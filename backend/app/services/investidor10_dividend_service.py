from __future__ import annotations

import asyncio
import logging
import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html.parser import HTMLParser
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import (
    Asset,
    AssetClass,
    CurrencyCode,
    Market,
    resolve_asset_metadata,
)
from app.models.dividend_event import DividendEvent
from app.models.purchase import Purchase
from app.models.user_asset import UserAsset

logger = logging.getLogger(__name__)

INVESTIDOR10_SOURCE = "INVESTIDOR10"
BASE_URL = "https://investidor10.com.br"
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    ),
}
EXPECTED = "EXPECTED"
UNCONFIRMED = "UNCONFIRMED"
REQUEST_PAUSE_SECONDS = 1.0
DISTRIBUTED_FETCH_WINDOW_SLOTS = 40
SUCCESS_FETCH_HOURS = 20
SUCCESS_JITTER_MINUTES = 90
MAX_FAILURE_BACKOFF_HOURS = 24


@dataclass
class Investidor10DividendRow:
    event_type: str
    data_com: date
    payment_date: date
    amount_per_unit: Decimal
    raw_type: str
    raw_value: str


@dataclass
class Investidor10DividendScanSummary:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    failed: list[dict[str, Any]] = field(default_factory=list)
    detected: list[DividendEvent] = field(default_factory=list)


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


def _parse_br_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%d/%m/%Y").date()


def _parse_br_decimal(value: str) -> Decimal:
    normalized = value.strip().replace(".", "").replace(",", ".")
    return Decimal(normalized)


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _unit(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)


def _event_type(value: str) -> str:
    normalized = value.strip().upper()
    if normalized in {"DIVIDENDOS", "DIVIDENDO", "DIV"}:
        return "DIVIDEND"
    if normalized in {"JCP", "JSCP"}:
        return "JCP"
    if "REND" in normalized:
        return "RENDIMENTO"
    if "RED" in normalized and "CAP" in normalized:
        return "CAPITAL_REDUCTION"
    return normalized[:20] or "UNKNOWN"


def _event_key(asset: Asset, row: Investidor10DividendRow) -> str:
    return (
        f"investidor10:{asset.ticker.upper()}:{row.event_type}:"
        f"{row.data_com.isoformat()}:{row.payment_date.isoformat()}:"
        f"{_unit(row.amount_per_unit)}"
    )


def parse_dividend_rows(html: str) -> list[Investidor10DividendRow]:
    parser = DividendTableParser()
    parser.feed(html)
    rows: list[Investidor10DividendRow] = []
    for raw_type, raw_data_com, raw_payment_date, raw_value in parser.rows:
        try:
            rows.append(
                Investidor10DividendRow(
                    event_type=_event_type(raw_type),
                    data_com=_parse_br_date(raw_data_com),
                    payment_date=_parse_br_date(raw_payment_date),
                    amount_per_unit=_parse_br_decimal(raw_value),
                    raw_type=raw_type,
                    raw_value=raw_value,
                )
            )
        except (ValueError, InvalidOperation):
            logger.debug("Skipping unparsable Investidor10 dividend row: %s", raw_type)
    return rows


class Investidor10DividendService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        request_timeout_seconds: float = 20,
    ) -> None:
        self.db = db
        self.request_timeout_seconds = request_timeout_seconds

    async def scan_current_positions(
        self,
        *,
        start_date: date,
        end_date: date,
        today: date | None = None,
        progress: bool = False,
    ) -> Investidor10DividendScanSummary:
        today = today or date.today()
        summary = Investidor10DividendScanSummary()
        assets = await self._eligible_assets_with_current_position()

        async with httpx.AsyncClient(
            headers=HEADERS, timeout=self.request_timeout_seconds
        ) as client:
            for index, asset in enumerate(assets, start=1):
                if progress:
                    print(
                        f"[{index}/{len(assets)}] {asset.ticker}: scanning", flush=True
                    )
                try:
                    await self._scan_asset(
                        client, asset, start_date, end_date, today, summary
                    )
                    if progress:
                        print(
                            f"[{index}/{len(assets)}] {asset.ticker}: ok "
                            f"(created={summary.created}, updated={summary.updated}, "
                            f"failed={len(summary.failed)})",
                            flush=True,
                        )
                except Exception as exc:
                    logger.exception(
                        "Failed to scan Investidor10 dividends for %s", asset.ticker
                    )
                    summary.failed.append({"ticker": asset.ticker, "error": str(exc)})
                    if progress:
                        print(
                            f"[{index}/{len(assets)}] {asset.ticker}: failed: {exc}",
                            flush=True,
                        )
                await asyncio.sleep(REQUEST_PAUSE_SECONDS)
        return summary

    async def scan_due_positions(
        self,
        *,
        start_date: date,
        end_date: date,
        now: datetime | None = None,
    ) -> Investidor10DividendScanSummary:
        now = now or datetime.now(timezone.utc)
        today = now.date()
        summary = Investidor10DividendScanSummary()
        total = await self._eligible_asset_count()
        if total <= 0:
            return summary

        batch_size = max(1, math.ceil(total / DISTRIBUTED_FETCH_WINDOW_SLOTS))
        assets = await self._due_assets(now=now, limit=batch_size)

        async with httpx.AsyncClient(
            headers=HEADERS, timeout=self.request_timeout_seconds
        ) as client:
            for asset in assets:
                try:
                    await self._scan_asset(
                        client, asset, start_date, end_date, today, summary
                    )
                    self._schedule_success(asset, now)
                except Exception as exc:
                    logger.exception(
                        "Failed to scan Investidor10 dividends for %s", asset.ticker
                    )
                    self._schedule_failure(asset, now, exc)
                    summary.failed.append({"ticker": asset.ticker, "error": str(exc)})
                await asyncio.sleep(REQUEST_PAUSE_SECONDS)
        return summary

    async def _eligible_asset_count(self) -> int:
        return len(await self._eligible_assets_with_current_position())

    async def _eligible_assets_with_current_position(self) -> list[Asset]:
        quantity = func.coalesce(func.sum(Purchase.quantity), 0)
        result = await self.db.execute(
            select(Asset)
            .join(UserAsset, UserAsset.asset_id == Asset.id)
            .join(Purchase, Purchase.asset_id == Asset.id)
            .where(UserAsset.paused.is_(False), Purchase.user_id == UserAsset.user_id)
            .group_by(Asset.id)
            .having(quantity > 0)
        )
        assets: list[Asset] = []
        for asset in result.scalars().unique().all():
            asset_class, market, quote_currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            if (
                market == Market.BR
                and quote_currency == CurrencyCode.BRL
                and asset_class in {AssetClass.STOCK, AssetClass.FII}
            ):
                assets.append(asset)
        return assets

    async def _due_assets(self, *, now: datetime, limit: int) -> list[Asset]:
        naive_now = now.replace(tzinfo=None)
        assets = await self._eligible_assets_with_current_position()
        due_assets = [
            asset
            for asset in assets
            if asset.investidor10_dividends_next_fetch_at is None
            or asset.investidor10_dividends_next_fetch_at <= naive_now
        ]
        return sorted(
            due_assets,
            key=lambda asset: (
                asset.investidor10_dividends_next_fetch_at or datetime.min,
                asset.id,
            ),
        )[:limit]

    def _schedule_success(self, asset: Asset, now: datetime) -> None:
        jitter = random.randint(-SUCCESS_JITTER_MINUTES, SUCCESS_JITTER_MINUTES)
        naive_now = now.replace(tzinfo=None)
        asset.investidor10_dividends_fetched_at = naive_now
        asset.investidor10_dividends_next_fetch_at = naive_now + timedelta(
            hours=SUCCESS_FETCH_HOURS,
            minutes=jitter,
        )
        asset.investidor10_dividends_failure_count = 0
        asset.investidor10_dividends_last_error = None

    def _schedule_failure(self, asset: Asset, now: datetime, exc: Exception) -> None:
        failure_count = (asset.investidor10_dividends_failure_count or 0) + 1
        error = str(exc)
        if "429" in error or "403" in error:
            backoff_hours = min(4 * failure_count, MAX_FAILURE_BACKOFF_HOURS)
        else:
            backoff_hours = min(2 * failure_count, 12)
        naive_now = now.replace(tzinfo=None)
        asset.investidor10_dividends_failure_count = failure_count
        asset.investidor10_dividends_last_error = error[:500]
        asset.investidor10_dividends_next_fetch_at = naive_now + timedelta(
            hours=backoff_hours
        )

    async def _scan_asset(
        self,
        client: httpx.AsyncClient,
        asset: Asset,
        start_date: date,
        end_date: date,
        today: date,
        summary: Investidor10DividendScanSummary,
    ) -> None:
        html = await self._fetch_asset_html(client, asset)
        rows = parse_dividend_rows(html)
        if not rows:
            raise RuntimeError("Investidor10 dividend table not found or empty")

        for row in rows:
            if row.payment_date < start_date or row.payment_date > end_date:
                summary.skipped += 1
                continue
            await self._upsert_row(asset=asset, row=row, today=today, summary=summary)

    async def _fetch_asset_html(self, client: httpx.AsyncClient, asset: Asset) -> str:
        response = await client.get(self._asset_url(asset), follow_redirects=True)
        response.raise_for_status()
        return response.text

    def _asset_url(self, asset: Asset) -> str:
        ticker = asset.ticker.lower()
        asset_class, _market, _currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        if asset_class == AssetClass.FII:
            return f"{BASE_URL}/fiis/{ticker}/"
        return f"{BASE_URL}/acoes/{ticker}/"

    async def _upsert_row(
        self,
        *,
        asset: Asset,
        row: Investidor10DividendRow,
        today: date,
        summary: Investidor10DividendScanSummary,
    ) -> None:
        source_event_key = _event_key(asset, row)
        user_assets = await self._user_assets_with_quantity(asset.id, row.data_com)

        for user_id, quantity in user_assets:
            if quantity <= 0:
                summary.skipped += 1
                continue

            gross_brl = _money(quantity * row.amount_per_unit)
            status = EXPECTED if row.payment_date > today else UNCONFIRMED

            result = await self.db.execute(
                select(DividendEvent).where(
                    DividendEvent.user_id == user_id,
                    DividendEvent.asset_id == asset.id,
                    DividendEvent.source == INVESTIDOR10_SOURCE,
                    DividendEvent.source_event_key == source_event_key,
                )
            )
            event = result.scalar_one_or_none()
            created = event is None
            if event is None:
                event = DividendEvent(
                    user_id=user_id,
                    transaction_id=None,
                    asset_id=asset.id,
                    source=INVESTIDOR10_SOURCE,
                    source_event_key=source_event_key,
                )
                self.db.add(event)

            event.ticker = asset.ticker
            event.event_type = row.event_type
            event.status = status
            event.ex_date = row.data_com
            event.payment_date = row.payment_date
            event.declared_currency = CurrencyCode.BRL.value
            event.amount_per_unit_native = _unit(row.amount_per_unit)
            event.amount_per_unit = _unit(row.amount_per_unit)
            event.quantity_base = quantity
            event.gross_amount_native = gross_brl
            event.withholding_tax_native = Decimal("0.0000")
            event.credited_amount_native = gross_brl
            event.fx_rate_to_brl = Decimal("1")
            event.gross_amount = gross_brl
            event.withholding_tax = Decimal("0.0000")
            event.credited_amount = gross_brl
            event.description = f"{asset.ticker} provento Investidor10"
            event.source_category = "Investidor10"
            event.source_confidence = "medium"
            event.raw_data = {
                "tipo": row.raw_type,
                "data_com": row.data_com.isoformat(),
                "payment_date": row.payment_date.isoformat(),
                "value": row.raw_value,
            }

            if created:
                summary.created += 1
                summary.detected.append(event)
            else:
                summary.updated += 1

    async def _user_assets_with_quantity(
        self, asset_id: int, data_com: date
    ) -> list[tuple[int, Decimal]]:
        result = await self.db.execute(
            select(UserAsset.user_id, func.coalesce(func.sum(Purchase.quantity), 0))
            .join(Purchase, Purchase.asset_id == UserAsset.asset_id)
            .where(
                UserAsset.asset_id == asset_id,
                UserAsset.paused.is_(False),
                Purchase.user_id == UserAsset.user_id,
                Purchase.purchase_date <= data_com,
            )
            .group_by(UserAsset.user_id)
        )
        return [(int(user_id), Decimal(quantity)) for user_id, quantity in result.all()]
