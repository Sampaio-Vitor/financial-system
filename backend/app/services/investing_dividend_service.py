from __future__ import annotations

import logging
import asyncio
import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
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
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)

SEARCH_URL = "https://api.investing.com/api/search/v2/search"
DIVIDENDS_URL = (
    "https://endpoints.investing.com/dividends/v1/instruments/{instrument_id}/dividends"
)
HEADERS = {
    "domain-id": "br",
    "user-agent": "Mozilla/5.0",
}
INVESTING_SOURCE = "INVESTING"
EXPECTED = "EXPECTED"
PAID = "PAID"
UNCONFIRMED = "UNCONFIRMED"
REQUEST_PAUSE_SECONDS = 1.5
RATE_LIMIT_RETRY_DELAYS_SECONDS = (10, 30, 60)
DISTRIBUTED_FETCH_WINDOW_SLOTS = 40
SUCCESS_FETCH_HOURS = 20
SUCCESS_JITTER_MINUTES = 90
MAX_FAILURE_BACKOFF_HOURS = 24


@dataclass
class InvestingDividendScanSummary:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    failed: list[dict[str, Any]] = field(default_factory=list)
    detected: list[DividendEvent] = field(default_factory=list)


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _unit(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)


def _event_key(
    asset: Asset,
    row: dict[str, Any],
    ex_date: date,
    payment_date: date,
    amount: Decimal,
) -> str:
    row_id = row.get("id") or row.get("event_id")
    if row_id:
        return f"investing:{asset.investing_instrument_id}:{row_id}"
    return (
        f"investing:{asset.investing_instrument_id}:"
        f"{ex_date.isoformat()}:{payment_date.isoformat()}:{_unit(amount)}"
    )


class InvestingDividendService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        request_timeout_seconds: float = 20,
        retry_rate_limits: bool = True,
    ):
        self.db = db
        self.price_service = PriceService(db)
        self.request_timeout_seconds = request_timeout_seconds
        self.retry_rate_limits = retry_rate_limits

    async def scan_current_positions(
        self,
        *,
        start_date: date,
        end_date: date,
        today: date | None = None,
        progress: bool = False,
    ) -> InvestingDividendScanSummary:
        today = today or date.today()
        summary = InvestingDividendScanSummary()
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
                        "Failed to scan Investing dividends for %s", asset.ticker
                    )
                    asset.investing_resolution_status = "failed"
                    asset.investing_resolution_error = str(exc)[:500]
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
    ) -> InvestingDividendScanSummary:
        now = now or datetime.now(timezone.utc)
        today = now.date()
        summary = InvestingDividendScanSummary()
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
                        "Failed to scan Investing dividends for %s", asset.ticker
                    )
                    self._schedule_failure(asset, now, exc)
                    summary.failed.append({"ticker": asset.ticker, "error": str(exc)})
                await asyncio.sleep(REQUEST_PAUSE_SECONDS)
        return summary

    async def _eligible_asset_count(self) -> int:
        return len(await self._eligible_assets_with_current_position())

    async def _due_assets(self, *, now: datetime, limit: int) -> list[Asset]:
        naive_now = now.replace(tzinfo=None)
        assets = await self._eligible_assets_with_current_position()
        due_assets = [
            asset
            for asset in assets
            if asset.investing_dividends_next_fetch_at is None
            or asset.investing_dividends_next_fetch_at <= naive_now
        ]
        return sorted(
            due_assets,
            key=lambda asset: (
                asset.investing_dividends_next_fetch_at or datetime.min,
                asset.id,
            ),
        )[:limit]

    def _schedule_success(self, asset: Asset, now: datetime) -> None:
        jitter = random.randint(-SUCCESS_JITTER_MINUTES, SUCCESS_JITTER_MINUTES)
        naive_now = now.replace(tzinfo=None)
        asset.investing_dividends_fetched_at = naive_now
        asset.investing_dividends_next_fetch_at = naive_now + timedelta(
            hours=SUCCESS_FETCH_HOURS,
            minutes=jitter,
        )
        asset.investing_dividends_failure_count = 0
        asset.investing_dividends_last_error = None

    def _schedule_failure(self, asset: Asset, now: datetime, exc: Exception) -> None:
        failure_count = (asset.investing_dividends_failure_count or 0) + 1
        error = str(exc)
        if "429" in error:
            backoff_hours = min(4 * failure_count, MAX_FAILURE_BACKOFF_HOURS)
        else:
            backoff_hours = min(2 * failure_count, 12)
        naive_now = now.replace(tzinfo=None)
        asset.investing_dividends_failure_count = failure_count
        asset.investing_dividends_last_error = error[:500]
        asset.investing_dividends_next_fetch_at = naive_now + timedelta(
            hours=backoff_hours
        )

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
        assets = []
        for asset in result.scalars().unique().all():
            asset_class, _market, _currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            if asset_class in {AssetClass.STOCK, AssetClass.ETF, AssetClass.FII}:
                assets.append(asset)
        return assets

    async def _scan_asset(
        self,
        client: httpx.AsyncClient,
        asset: Asset,
        start_date: date,
        end_date: date,
        today: date,
        summary: InvestingDividendScanSummary,
    ) -> None:
        await self._ensure_instrument(client, asset)
        if not asset.investing_instrument_id:
            summary.skipped += 1
            return

        rows = await self._fetch_dividends(client, asset.investing_instrument_id)
        for row in rows:
            ex_date = _parse_date(row.get("div_date"))
            payment_date = _parse_date(row.get("pay_date"))
            amount_per_unit = _parse_decimal(row.get("div_amount"))
            if not ex_date or not payment_date or amount_per_unit is None:
                summary.skipped += 1
                continue
            if payment_date < start_date or payment_date > end_date:
                summary.skipped += 1
                continue

            await self._upsert_row(
                asset=asset,
                row=row,
                ex_date=ex_date,
                payment_date=payment_date,
                amount_per_unit=amount_per_unit,
                today=today,
                summary=summary,
            )

    async def _ensure_instrument(self, client: httpx.AsyncClient, asset: Asset) -> None:
        if asset.investing_instrument_id:
            return
        response = await self._get_with_rate_limit_retry(
            client, SEARCH_URL, params={"q": asset.ticker}
        )
        quotes = response.json().get("quotes", [])
        if not quotes:
            asset.investing_resolution_status = "not_found"
            asset.investing_resolution_error = "No Investing search results"
            asset.investing_resolved_at = datetime.now(timezone.utc)
            return
        quote = quotes[0]
        instrument_id = quote.get("id")
        asset.investing_instrument_id = int(instrument_id) if instrument_id else None
        asset.investing_instrument_name = quote.get("description")
        asset.investing_exchange = quote.get("exchange")
        asset.investing_resolution_status = "resolved"
        asset.investing_resolution_error = None
        asset.investing_resolved_at = datetime.now(timezone.utc)

    async def _fetch_dividends(
        self, client: httpx.AsyncClient, instrument_id: int
    ) -> list[dict[str, Any]]:
        response = await self._get_with_rate_limit_retry(
            client,
            DIVIDENDS_URL.format(instrument_id=instrument_id),
            params={"limit": 200},
        )
        data = response.json().get("data", [])
        return data if isinstance(data, list) else []

    async def _get_with_rate_limit_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        params: dict[str, Any],
    ) -> httpx.Response:
        if not self.retry_rate_limits:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response

        for attempt, delay in enumerate((0, *RATE_LIMIT_RETRY_DELAYS_SECONDS)):
            if delay:
                await asyncio.sleep(delay)
            response = await client.get(url, params=params)
            if response.status_code != 429:
                response.raise_for_status()
                return response
            retry_after = response.headers.get("retry-after")
            if retry_after:
                try:
                    await asyncio.sleep(float(retry_after))
                except ValueError:
                    pass
            if attempt == len(RATE_LIMIT_RETRY_DELAYS_SECONDS):
                response.raise_for_status()
        raise RuntimeError("Investing request failed unexpectedly")

    async def _upsert_row(
        self,
        *,
        asset: Asset,
        row: dict[str, Any],
        ex_date: date,
        payment_date: date,
        amount_per_unit: Decimal,
        today: date,
        summary: InvestingDividendScanSummary,
    ) -> None:
        asset_class, market, quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        fx_rate = await self._fx_rate_for(quote_currency, payment_date)
        source_event_key = _event_key(
            asset, row, ex_date, payment_date, amount_per_unit
        )
        user_assets = await self._user_assets_with_quantity(asset.id, ex_date)

        for user_id, quantity in user_assets:
            if quantity <= 0:
                summary.skipped += 1
                continue

            gross_native = _money(quantity * amount_per_unit)
            tax_native = self._withholding_tax_native(
                gross_native=gross_native,
                market=market,
                asset_class=asset_class,
            )
            net_native = _money(gross_native - tax_native)
            gross_brl = _money(gross_native * fx_rate)
            tax_brl = _money(tax_native * fx_rate)
            net_brl = _money(net_native * fx_rate)
            status = self._status_for(
                market=market, payment_date=payment_date, today=today
            )

            result = await self.db.execute(
                select(DividendEvent).where(
                    DividendEvent.user_id == user_id,
                    DividendEvent.asset_id == asset.id,
                    DividendEvent.source == INVESTING_SOURCE,
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
                    source=INVESTING_SOURCE,
                    source_event_key=source_event_key,
                )
                self.db.add(event)

            event.ticker = asset.ticker
            event.event_type = "DIVIDEND"
            event.status = status
            event.ex_date = ex_date
            event.payment_date = payment_date
            event.declared_currency = quote_currency.value
            event.amount_per_unit_native = _unit(amount_per_unit)
            event.amount_per_unit = _unit(amount_per_unit * fx_rate)
            event.quantity_base = quantity
            event.gross_amount_native = gross_native
            event.withholding_tax_native = tax_native
            event.credited_amount_native = net_native
            event.fx_rate_to_brl = fx_rate
            event.gross_amount = gross_brl
            event.withholding_tax = tax_brl
            event.credited_amount = net_brl
            event.description = f"{asset.ticker} provento Investing"
            event.source_category = "Investing"
            event.source_confidence = "medium"
            event.raw_data = row

            if created:
                summary.created += 1
                summary.detected.append(event)
            else:
                summary.updated += 1

    async def _user_assets_with_quantity(
        self, asset_id: int, ex_date: date
    ) -> list[tuple[int, Decimal]]:
        result = await self.db.execute(
            select(UserAsset.user_id, func.coalesce(func.sum(Purchase.quantity), 0))
            .join(Purchase, Purchase.asset_id == UserAsset.asset_id)
            .where(
                UserAsset.asset_id == asset_id,
                UserAsset.paused.is_(False),
                Purchase.user_id == UserAsset.user_id,
                Purchase.purchase_date <= ex_date,
            )
            .group_by(UserAsset.user_id)
        )
        return [(int(user_id), Decimal(quantity)) for user_id, quantity in result.all()]

    async def _fx_rate_for(self, currency: CurrencyCode, payment_date: date) -> Decimal:
        if currency == CurrencyCode.BRL:
            return Decimal("1")
        rate = await self.price_service._get_rate_to_brl(currency)
        if rate:
            return rate
        historical_rate = await self.price_service._fetch_historical_fx(
            currency, payment_date
        )
        if historical_rate:
            return historical_rate
        return Decimal("1")

    def _withholding_tax_native(
        self,
        *,
        gross_native: Decimal,
        market: Market,
        asset_class: AssetClass,
    ) -> Decimal:
        if market != Market.BR:
            return _money(gross_native * Decimal("0.30"))
        return Decimal("0.0000")

    def _status_for(self, *, market: Market, payment_date: date, today: date) -> str:
        if payment_date > today:
            return EXPECTED
        if market == Market.BR:
            return UNCONFIRMED
        return PAID
