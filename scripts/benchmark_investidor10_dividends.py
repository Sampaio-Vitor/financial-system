#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[1]
BASTTER_RESPONSE = ROOT / "bastter_response.txt"
BASE_URL = "https://investidor10.com.br"
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    ),
}


@dataclass(frozen=True)
class DividendEvent:
    ticker: str
    asset_type: str
    event_type: str
    ex_date: date
    payment_date: date
    value: Decimal

    @property
    def key(self) -> tuple[str, date, date, Decimal]:
        return (
            self.ticker,
            self.ex_date,
            self.payment_date,
            self.value.quantize(Decimal("0.00000001")),
        )


class DividendTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_target_table = False
        self.table_depth = 0
        self.in_td = False
        self.cell_text = ""
        self.current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "table" and attrs_dict.get("id") == "table-dividends-history":
            self.in_target_table = True
            self.table_depth = 1
        elif self.in_target_table and tag == "table":
            self.table_depth += 1

        if self.in_target_table and tag == "td":
            self.in_td = True
            self.cell_text = ""

    def handle_endtag(self, tag: str) -> None:
        if self.in_target_table and tag == "td":
            self.in_td = False
            self.current_row.append(" ".join(self.cell_text.split()))
            return

        if self.in_target_table and tag == "tr":
            if len(self.current_row) == 4:
                self.rows.append(self.current_row)
            self.current_row = []
            return

        if self.in_target_table and tag == "table":
            self.table_depth -= 1
            if self.table_depth == 0:
                self.in_target_table = False

    def handle_data(self, data: str) -> None:
        if self.in_td:
            self.cell_text += data


def parse_iso_date(raw: str) -> date:
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()


def parse_br_date(raw: str) -> date:
    return datetime.strptime(raw, "%d/%m/%Y").date()


def parse_decimal(raw: str | int | float | Decimal) -> Decimal:
    if isinstance(raw, Decimal):
        return raw
    if isinstance(raw, int):
        return Decimal(raw)
    if isinstance(raw, float):
        return Decimal(str(raw))
    normalized = raw.strip().replace(".", "").replace(",", ".")
    return Decimal(normalized)


def normalize_type(raw: str) -> str:
    value = raw.strip().upper()
    if value in {"DIV", "DIVIDENDOS", "DIVIDENDO"}:
        return "DIVIDEND"
    if value in {
        "JCP",
        "JSCP",
        "JUROS SOBRE CAPITAL PROPRIO",
        "JUROS SOBRE CAPITAL PRÓPRIO",
    }:
        return "JCP"
    if "REND" in value:
        return "RENDIMENTO"
    if "SELIC" in value or "TRIBUT" in value:
        return "TAXABLE_ADJUSTMENT"
    return value


def load_bastter(path: Path) -> list[DividendEvent]:
    payload = json.loads(path.read_text())
    rows = json.loads(payload["d"])
    events: list[DividendEvent] = []
    for row in rows:
        asset_type = str(row["TipoAtivo"])
        if asset_type not in {"Ação", "FII"}:
            continue
        events.append(
            DividendEvent(
                ticker=str(row["Codigo"]).upper(),
                asset_type=asset_type,
                event_type=normalize_type(str(row["Tipo"])),
                ex_date=parse_iso_date(str(row["DataEx"])),
                payment_date=parse_iso_date(str(row["DataPagamento"])),
                value=parse_decimal(row["Valor"]),
            )
        )
    return events


def parse_investidor10_html(
    ticker: str, asset_type: str, html: str
) -> list[DividendEvent]:
    parser = DividendTableParser()
    parser.feed(html)
    events: list[DividendEvent] = []
    for row in parser.rows:
        event_type, ex_date, payment_date, value = row
        try:
            events.append(
                DividendEvent(
                    ticker=ticker,
                    asset_type=asset_type,
                    event_type=normalize_type(event_type),
                    ex_date=parse_br_date(ex_date),
                    payment_date=parse_br_date(payment_date),
                    value=parse_decimal(value),
                )
            )
        except (ValueError, InvalidOperation):
            continue
    return events


def url_for(ticker: str, asset_type: str) -> str:
    slug = ticker.lower()
    if asset_type == "FII":
        return f"{BASE_URL}/fiis/{slug}/"
    return f"{BASE_URL}/acoes/{slug}/"


async def fetch_ticker(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    ticker: str,
    asset_type: str,
) -> tuple[str, str, int, list[DividendEvent], str | None]:
    async with semaphore:
        url = url_for(ticker, asset_type)
        try:
            response = await client.get(url, headers=HEADERS, follow_redirects=True)
            status = response.status_code
            if status >= 400:
                return ticker, asset_type, status, [], f"HTTP {status}"
            events = parse_investidor10_html(ticker, asset_type, response.text)
            if not events:
                return ticker, asset_type, status, [], "table not found or empty"
            return ticker, asset_type, status, events, None
        except Exception as exc:
            return ticker, asset_type, 0, [], f"{type(exc).__name__}: {exc}"


def counter(events: list[DividendEvent]) -> Counter[tuple[str, date, date, Decimal]]:
    return Counter(event.key for event in events)


def close_matches(
    source: DividendEvent,
    candidates: list[DividendEvent],
    value_tolerance: Decimal,
) -> list[DividendEvent]:
    matches = [
        event
        for event in candidates
        if event.ex_date == source.ex_date
        and event.payment_date == source.payment_date
        and abs(event.value - source.value) <= value_tolerance
    ]
    if matches:
        return matches
    return [
        event
        for event in candidates
        if event.payment_date == source.payment_date
        and abs(event.value - source.value) <= value_tolerance
    ][:3]


def loose_key(event: DividendEvent) -> tuple[str, date, Decimal]:
    return (
        event.ticker,
        event.payment_date,
        event.value.quantize(Decimal("0.00000001")),
    )


def loose_counter(events: list[DividendEvent]) -> Counter[tuple[str, date, Decimal]]:
    return Counter(loose_key(event) for event in events)


def count_tolerant_matches(
    bastter_events: list[DividendEvent],
    investidor_events: list[DividendEvent],
    value_tolerance: Decimal,
    ignore_ex_date: bool,
) -> int:
    used: set[int] = set()
    matches = 0
    for source in bastter_events:
        for index, candidate in enumerate(investidor_events):
            if index in used:
                continue
            if source.ticker != candidate.ticker:
                continue
            if source.payment_date != candidate.payment_date:
                continue
            if not ignore_ex_date and source.ex_date != candidate.ex_date:
                continue
            if abs(source.value - candidate.value) > value_tolerance:
                continue
            used.add(index)
            matches += 1
            break
    return matches


def fmt_event(event: DividendEvent) -> str:
    return (
        f"{event.ticker} {event.event_type} ex={event.ex_date.isoformat()} "
        f"pay={event.payment_date.isoformat()} value={event.value}"
    )


async def main() -> None:
    argp = argparse.ArgumentParser()
    argp.add_argument("--limit", type=int, default=0)
    argp.add_argument("--concurrency", type=int, default=4)
    argp.add_argument("--value-tolerance", default="0.000001")
    args = argp.parse_args()

    bastter_events = load_bastter(BASTTER_RESPONSE)
    by_ticker: dict[str, list[DividendEvent]] = defaultdict(list)
    asset_types: dict[str, str] = {}
    for event in bastter_events:
        by_ticker[event.ticker].append(event)
        asset_types[event.ticker] = event.asset_type

    tickers = sorted(by_ticker)
    if args.limit:
        tickers = tickers[: args.limit]

    semaphore = asyncio.Semaphore(args.concurrency)
    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        results = await asyncio.gather(
            *[
                fetch_ticker(client, semaphore, ticker, asset_types[ticker])
                for ticker in tickers
            ]
        )

    investidor_events: list[DividendEvent] = []
    errors: dict[str, str] = {}
    statuses: dict[str, int] = {}
    for ticker, asset_type, status, events, error in results:
        statuses[ticker] = status
        if error is not None:
            errors[ticker] = error
        investidor_events.extend(events)

    bastter_selected = [event for event in bastter_events if event.ticker in tickers]
    tolerance = Decimal(args.value_tolerance)
    bastter_counts = counter(bastter_selected)
    investidor_counts = counter(investidor_events)
    matched_count = sum((bastter_counts & investidor_counts).values())
    loose_matched_count = sum(
        (loose_counter(bastter_selected) & loose_counter(investidor_events)).values()
    )
    tolerant_exact_count = count_tolerant_matches(
        bastter_selected, investidor_events, tolerance, ignore_ex_date=False
    )
    tolerant_loose_count = count_tolerant_matches(
        bastter_selected, investidor_events, tolerance, ignore_ex_date=True
    )
    missing_counter = bastter_counts - investidor_counts
    extra_counter = investidor_counts - bastter_counts

    print("Investidor10 vs Bastter dividend benchmark")
    print(f"Brazilian tickers tested: {len(tickers)}")
    print(f"Bastter events in scope: {len(bastter_selected)}")
    print(f"Investidor10 events fetched: {len(investidor_events)}")
    print(f"Exact matches: {matched_count}/{len(bastter_selected)}")
    print(
        "Exact date + value tolerance matches: "
        f"{tolerant_exact_count}/{len(bastter_selected)}"
    )
    print(
        "Payment+value matches "
        f"(ignoring data com/ex date drift): {loose_matched_count}/{len(bastter_selected)}"
    )
    print(
        "Payment+value tolerance matches "
        f"(ignoring data com/ex date drift): {tolerant_loose_count}/{len(bastter_selected)}"
    )
    print(f"Missing from Investidor10: {sum(missing_counter.values())}")
    print(f"Extra in Investidor10: {sum(extra_counter.values())}")
    print(f"Fetch/parser errors: {len(errors)}")
    print()

    print("Per ticker")
    investidor_by_ticker: dict[str, list[DividendEvent]] = defaultdict(list)
    for event in investidor_events:
        investidor_by_ticker[event.ticker].append(event)

    for ticker in tickers:
        b_events = by_ticker[ticker]
        i_events = investidor_by_ticker[ticker]
        b_counter = counter(b_events)
        i_counter = counter(i_events)
        exact = sum((b_counter & i_counter).values())
        loose_exact = sum((loose_counter(b_events) & loose_counter(i_events)).values())
        tolerant_loose = count_tolerant_matches(
            b_events, i_events, tolerance, ignore_ex_date=True
        )
        missing = sum((b_counter - i_counter).values())
        extra = sum((i_counter - b_counter).values())
        status = statuses.get(ticker, 0)
        error = errors.get(ticker)
        suffix = f" error={error}" if error else ""
        print(
            f"{ticker:7} {asset_types[ticker]:4} status={status:<3} "
            f"bastter={len(b_events):<2} inv10={len(i_events):<3} "
            f"exact={exact:<2} loose={loose_exact:<2} tol={tolerant_loose:<2} missing={missing:<2} "
            f"extra={extra:<3}{suffix}"
        )

    missing_events = []
    for key, count in missing_counter.items():
        event = next(event for event in bastter_selected if event.key == key)
        missing_events.extend([event] * count)

    if missing_events:
        print()
        print("Missing sample")
        for event in missing_events[:30]:
            matches = close_matches(
                event, investidor_by_ticker[event.ticker], tolerance
            )
            near = (
                "; near: " + " | ".join(fmt_event(item) for item in matches)
                if matches
                else ""
            )
            print(f"- {fmt_event(event)}{near}")


if __name__ == "__main__":
    asyncio.run(main())
