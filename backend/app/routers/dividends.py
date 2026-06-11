from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset
from app.models.dividend_event import DividendEvent
from app.models.purchase import Purchase
from app.models.user import User
from app.schemas.dividend import (
    AssetYieldItem,
    DividendEventListResponse,
    DividendEventResponse,
    DividendYieldResponse,
)

router = APIRouter()


def _to_response(event: DividendEvent) -> DividendEventResponse:
    return DividendEventResponse(
        id=event.id,
        transaction_id=event.transaction_id,
        asset_id=event.asset_id,
        ticker=event.ticker,
        asset_type=event.asset.type.value if event.asset else None,
        asset_class=event.asset.asset_class.value
        if event.asset and event.asset.asset_class
        else None,
        market=event.asset.market.value if event.asset and event.asset.market else None,
        event_type=event.event_type,
        source=event.source,
        status=event.status,
        credited_amount=event.credited_amount,
        gross_amount=event.gross_amount,
        withholding_tax=event.withholding_tax,
        quantity_base=event.quantity_base,
        amount_per_unit=event.amount_per_unit,
        ex_date=event.ex_date,
        declared_currency=event.declared_currency,
        amount_per_unit_native=event.amount_per_unit_native,
        gross_amount_native=event.gross_amount_native,
        withholding_tax_native=event.withholding_tax_native,
        credited_amount_native=event.credited_amount_native,
        fx_rate_to_brl=event.fx_rate_to_brl,
        payment_date=event.payment_date,
        description=event.description,
        source_category=event.source_category,
        source_confidence=event.source_confidence,
        created_at=event.created_at,
    )


@router.get("/yield", response_model=DividendYieldResponse)
async def get_dividend_yield(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trailing-12-month dividend yield for the portfolio and each asset.

    Positions held for less than 12 months have their dividends annualized
    (scaled to a full year based on the holding period) so yields stay
    comparable across assets bought at different times.
    """
    today = date.today()
    window_start = today - timedelta(days=365)

    # Current variable-income positions
    pos_result = await db.execute(
        select(
            Asset.id,
            Asset.ticker,
            Asset.current_price,
            func.sum(Purchase.quantity).label("qty"),
            func.sum(Purchase.total_value).label("cost"),
            func.min(Purchase.purchase_date).label("first_date"),
        )
        .join(Asset, Purchase.asset_id == Asset.id)
        .where(Purchase.user_id == user.id)
        .group_by(Asset.id, Asset.ticker, Asset.current_price)
        .having(func.sum(Purchase.quantity) > 0)
    )
    rows = pos_result.all()

    # Dividends received in the last 12 months, grouped by asset/ticker
    div_result = await db.execute(
        select(
            DividendEvent.asset_id,
            DividendEvent.ticker,
            func.sum(DividendEvent.credited_amount),
        )
        .where(
            DividendEvent.user_id == user.id,
            DividendEvent.status.in_(["PAID", "CONFIRMED"]),
            DividendEvent.payment_date > window_start,
            DividendEvent.payment_date <= today,
        )
        .group_by(DividendEvent.asset_id, DividendEvent.ticker)
    )
    div_by_asset: dict[int, Decimal] = {}
    div_by_ticker: dict[str, Decimal] = {}
    for asset_id, ticker, amount in div_result.all():
        amount = amount or Decimal("0")
        if asset_id is not None:
            div_by_asset[asset_id] = div_by_asset.get(asset_id, Decimal("0")) + amount
        elif ticker:
            div_by_ticker[ticker] = div_by_ticker.get(ticker, Decimal("0")) + amount

    items: list[AssetYieldItem] = []
    total_market = Decimal("0")
    total_cost = Decimal("0")
    total_received = Decimal("0")
    total_annualized = Decimal("0")

    for asset_id, ticker, price, qty, cost, first_date in rows:
        market_value = (price * qty) if price and qty else Decimal("0")
        received = div_by_asset.get(asset_id, Decimal("0")) + div_by_ticker.get(
            ticker, Decimal("0")
        )

        days_held = (today - first_date).days if first_date else 365
        # Annualize over the actual holding window (min 30 days to avoid
        # wild extrapolation from a single early payment), capped at 1 year.
        window_days = min(365, max(days_held, 30))
        annualized = received * Decimal(365) / Decimal(window_days)
        is_annualized = received > 0 and days_held < 365

        total_market += market_value
        total_cost += cost or Decimal("0")
        total_received += received
        total_annualized += annualized

        if received <= 0:
            continue

        items.append(
            AssetYieldItem(
                asset_id=asset_id,
                ticker=ticker,
                market_value=market_value,
                dividends_12m=round(received, 2),
                dividends_annualized=round(annualized, 2),
                yield_pct=round(annualized / market_value * 100, 2)
                if market_value
                else None,
                yield_on_cost_pct=round(annualized / cost * 100, 2) if cost else None,
                months_held=max(0, days_held) // 30,
                is_annualized=is_annualized,
            )
        )

    items.sort(key=lambda i: i.yield_pct or Decimal("0"), reverse=True)

    return DividendYieldResponse(
        portfolio_market_value=total_market,
        portfolio_dividends_12m=round(total_received, 2),
        portfolio_dividends_annualized=round(total_annualized, 2),
        portfolio_yield_pct=round(total_annualized / total_market * 100, 2)
        if total_market
        else None,
        portfolio_yield_on_cost_pct=round(total_annualized / total_cost * 100, 2)
        if total_cost
        else None,
        assets=items,
    )


@router.get("", response_model=DividendEventListResponse)
async def list_dividend_events(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    ticker: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    tab: Optional[str] = Query(None, pattern="^(recebidos|previstos|all)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(DividendEvent)
        .where(DividendEvent.user_id == user.id)
        .order_by(DividendEvent.payment_date.desc(), DividendEvent.id.desc())
    )

    if year is not None:
        query = query.where(extract("year", DividendEvent.payment_date) == year)
    if month is not None:
        query = query.where(extract("month", DividendEvent.payment_date) == month)
    if ticker:
        query = query.where(DividendEvent.ticker == ticker.upper())
    if event_type:
        query = query.where(DividendEvent.event_type == event_type.upper())
    if source:
        query = query.where(DividendEvent.source == source.upper())
    if status:
        query = query.where(DividendEvent.status == status.upper())
    if tab == "recebidos":
        query = query.where(DividendEvent.status.in_(["PAID", "CONFIRMED"]))
    elif tab == "previstos":
        query = query.where(DividendEvent.status == "EXPECTED")

    result = await db.execute(query)
    events = result.scalars().all()

    return DividendEventListResponse(
        events=[_to_response(event) for event in events],
        total_count=len(events),
    )
