"""Lightweight factories to construct DB rows in tests."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.allocation_target import AllocationTarget
from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetClass,
    AssetType,
    CurrencyCode,
    Market,
)
from app.models.financial_reserve import FinancialReserveEntry
from app.models.fixed_income import FixedIncomePosition
from app.models.purchase import Purchase
from app.models.user_asset import UserAsset


_LEGACY_DEFAULTS = {
    AssetType.ACAO: (AssetClass.STOCK, Market.BR, CurrencyCode.BRL),
    AssetType.STOCK: (AssetClass.STOCK, Market.US, CurrencyCode.USD),
    AssetType.FII: (AssetClass.FII, Market.BR, CurrencyCode.BRL),
    AssetType.RF: (AssetClass.RF, Market.BR, CurrencyCode.BRL),
}


async def make_asset(
    db: AsyncSession,
    *,
    ticker: str = "PETR4",
    asset_type: AssetType = AssetType.ACAO,
    asset_class: AssetClass | None = None,
    market: Market | None = None,
    quote_currency: CurrencyCode | None = None,
    current_price: Decimal | None = Decimal("30.00"),
    current_price_native: Decimal | None = None,
    fx_rate_to_brl: Decimal | None = None,
    description: str = "",
    price_symbol: str | None = None,
) -> Asset:
    if asset_class is None and market is None and quote_currency is None:
        asset_class, market, quote_currency = _LEGACY_DEFAULTS[asset_type]
    asset = Asset(
        ticker=ticker,
        type=asset_type,
        asset_class=asset_class,
        market=market,
        quote_currency=quote_currency,
        current_price=current_price,
        current_price_native=current_price_native,
        fx_rate_to_brl=fx_rate_to_brl,
        description=description,
        price_symbol=price_symbol,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


async def link_user_asset(
    db: AsyncSession,
    *,
    user_id: int,
    asset_id: int,
    paused: bool = False,
    target_pct: Decimal | None = None,
) -> UserAsset:
    ua = UserAsset(
        user_id=user_id, asset_id=asset_id, paused=paused, target_pct=target_pct
    )
    db.add(ua)
    await db.commit()
    await db.refresh(ua)
    return ua


async def make_purchase(
    db: AsyncSession,
    *,
    user_id: int,
    asset_id: int,
    purchase_date: date | None = None,
    quantity: Decimal = Decimal("10"),
    unit_price: Decimal = Decimal("30.00"),
    trade_currency: str = "BRL",
    fx_rate: Decimal = Decimal("1.0000"),
) -> Purchase:
    if purchase_date is None:
        purchase_date = date.today()
    total = quantity * unit_price
    p = Purchase(
        asset_id=asset_id,
        user_id=user_id,
        purchase_date=purchase_date,
        quantity=quantity,
        trade_currency=trade_currency,
        unit_price=unit_price,
        total_value=total,
        unit_price_native=unit_price,
        total_value_native=total,
        fx_rate=fx_rate,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def make_allocation_target(
    db: AsyncSession,
    *,
    user_id: int,
    bucket: AllocationBucket,
    target_pct: Decimal,
) -> AllocationTarget:
    t = AllocationTarget(user_id=user_id, allocation_bucket=bucket, target_pct=target_pct)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def make_fi_position(
    db: AsyncSession,
    *,
    user_id: int,
    asset_id: int,
    applied_value: Decimal = Decimal("1000"),
    current_balance: Decimal = Decimal("1100"),
    start_date: date | None = None,
    description: str = "CDB Test",
) -> FixedIncomePosition:
    if start_date is None:
        start_date = date.today()
    pos = FixedIncomePosition(
        user_id=user_id,
        asset_id=asset_id,
        description=description,
        applied_value=applied_value,
        current_balance=current_balance,
        yield_value=current_balance - applied_value,
        yield_pct=Decimal("0.1"),
        start_date=start_date,
    )
    db.add(pos)
    await db.commit()
    await db.refresh(pos)
    return pos


async def make_reserve_entry(
    db: AsyncSession,
    *,
    user_id: int,
    amount: Decimal = Decimal("5000"),
    recorded_at: datetime | None = None,
) -> FinancialReserveEntry:
    if recorded_at is None:
        recorded_at = datetime.now(timezone.utc).replace(tzinfo=None)
    entry = FinancialReserveEntry(
        user_id=user_id, amount=amount, recorded_at=recorded_at
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
