from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.allocation_target import AllocationTarget
from app.models.settings import UserSettings
from app.models.financial_reserve import FinancialReserveTarget
from app.models.user import User
from app.routers.financial_reserve import get_reserve_for_month
from app.schemas.portfolio import (
    MonthlyOverview,
    ClassSummary,
    DailyPatrimonio,
    PositionsResponse,
    PositionItem,
)
from app.schemas.purchase import PurchaseResponse

router = APIRouter()

CLASS_LABELS = {
    AssetType.STOCK: "Stocks (EUA)",
    AssetType.ACAO: "Acoes (Brasil)",
    AssetType.FII: "FIIs",
    AssetType.RF: "Renda Fixa",
}


async def _get_class_values(
    db: AsyncSession, user: User, cutoff: date | None = None
) -> dict[AssetType, Decimal]:
    """Compute current market value per asset class.

    If cutoff is given, only purchases with purchase_date < cutoff are included.
    """
    values: dict[AssetType, Decimal] = {t: Decimal("0") for t in AssetType}

    # Variable income: aggregate purchases and multiply by current price
    query = (
        select(
            Asset.type,
            Asset.current_price,
            func.sum(Purchase.quantity).label("total_qty"),
        )
        .join(Asset, Purchase.asset_id == Asset.id)
        .where(Purchase.user_id == user.id, Asset.type != AssetType.RF)
    )
    if cutoff:
        query = query.where(Purchase.purchase_date < cutoff)
    query = query.group_by(Asset.id, Asset.type, Asset.current_price)

    result = await db.execute(query)
    for row in result.all():
        asset_type, price, qty = row
        if price and qty:
            values[asset_type] += price * qty

    # Fixed income: sum current_balance for positions that existed before cutoff
    fi_query = (
        select(func.sum(FixedIncomePosition.current_balance))
        .where(FixedIncomePosition.user_id == user.id)
    )
    if cutoff:
        fi_query = fi_query.where(FixedIncomePosition.start_date < cutoff)
    fi_result = await db.execute(fi_query)
    rf_total = fi_result.scalar() or Decimal("0")
    values[AssetType.RF] = rf_total

    return values


async def _get_targets(db: AsyncSession, user: User) -> dict[AssetType, Decimal]:
    result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    return {t.asset_class: t.target_pct for t in result.scalars().all()}


@router.get("/overview", response_model=MonthlyOverview)
async def get_overview(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    if not month:
        month = now.strftime("%Y-%m")

    year, m = int(month[:4]), int(month[5:7])

    # Determine date range for the month
    month_start = date(year, m, 1)
    if m == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, m + 1, 1)

    # Earliest date across purchases and fixed income (for calendar floor)
    min_purchase = await db.execute(
        select(func.min(Purchase.purchase_date)).where(Purchase.user_id == user.id)
    )
    min_fi = await db.execute(
        select(func.min(FixedIncomePosition.start_date)).where(FixedIncomePosition.user_id == user.id)
    )
    dates = [d for d in [min_purchase.scalar(), min_fi.scalar()] if d]
    min_date = min(dates) if dates else None
    min_month = min_date.strftime("%Y-%m") if min_date else None

    # Get purchases for this month
    purchases_result = await db.execute(
        select(Purchase)
        .join(Asset)
        .where(
            Purchase.user_id == user.id,
            Purchase.purchase_date >= month_start,
            Purchase.purchase_date < month_end,
        )
        .order_by(Purchase.purchase_date.desc())
    )
    month_purchases = purchases_result.scalars().all()
    aportes_do_mes = sum(p.total_value for p in month_purchases)

    # Add fixed income positions started this month
    fi_aportes = await db.execute(
        select(func.sum(FixedIncomePosition.applied_value))
        .where(
            FixedIncomePosition.user_id == user.id,
            FixedIncomePosition.start_date >= month_start,
            FixedIncomePosition.start_date < month_end,
        )
    )
    aportes_do_mes += fi_aportes.scalar() or Decimal("0")

    # Add reserve increase for the month (current - previous)
    reserve_entry = await get_reserve_for_month(db, user.id, year, m)
    reserva_financeira = reserve_entry.amount if reserve_entry else None
    if m == 1:
        prev_year_r, prev_m_r = year - 1, 12
    else:
        prev_year_r, prev_m_r = year, m - 1
    prev_reserve = await get_reserve_for_month(db, user.id, prev_year_r, prev_m_r)
    reserva_aporte = (reserva_financeira or Decimal("0")) - (prev_reserve.amount if prev_reserve else Decimal("0"))
    if reserva_aporte > 0:
        aportes_do_mes += reserva_aporte

    # Get total invested (all purchases up to end of month)
    invested_result = await db.execute(
        select(func.sum(Purchase.total_value))
        .where(Purchase.user_id == user.id, Purchase.purchase_date < month_end)
    )
    total_invested = invested_result.scalar() or Decimal("0")

    # Add fixed income applied values (only positions that existed before month_end)
    fi_invested = await db.execute(
        select(func.sum(FixedIncomePosition.applied_value))
        .where(FixedIncomePosition.user_id == user.id, FixedIncomePosition.start_date < month_end)
    )
    total_invested += fi_invested.scalar() or Decimal("0")

    # Current values per class (purchases up to end of viewed month)
    class_values = await _get_class_values(db, user, cutoff=month_end)

    # Reserve target
    target_result = await db.execute(
        select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == user.id)
    )
    reserve_target = target_result.scalar_one_or_none()
    reserva_target = reserve_target.target_amount if reserve_target else None

    patrimonio_total = sum(class_values.values()) + (reserva_financeira or Decimal("0"))

    # Month-over-month variation: compute previous month's patrimonio on-the-fly
    prev_class_values = await _get_class_values(db, user, cutoff=month_start)
    prev_patrimonio = sum(prev_class_values.values()) + (prev_reserve.amount if prev_reserve else Decimal("0"))

    if prev_patrimonio > 0:
        variacao_mes = patrimonio_total - prev_patrimonio
        variacao_mes_pct = (variacao_mes / prev_patrimonio * 100)
    else:
        # No previous patrimonio: first month with data
        variacao_mes = Decimal("0")
        variacao_mes_pct = Decimal("0")

    # Allocation targets
    targets = await _get_targets(db, user)

    # Build allocation breakdown
    allocation = []
    for asset_class in AssetType:
        value = class_values[asset_class]
        pct = (value / patrimonio_total * 100) if patrimonio_total else Decimal("0")
        target_pct = targets.get(asset_class, Decimal("0")) * 100
        allocation.append(ClassSummary(
            asset_class=asset_class,
            label=CLASS_LABELS[asset_class],
            value=value,
            pct=round(pct, 2),
            target_pct=round(target_pct, 2),
            gap=round(target_pct - pct, 2),
        ))

    # Transactions for the month
    transactions = [
        PurchaseResponse(
            id=p.id,
            asset_id=p.asset_id,
            purchase_date=p.purchase_date,
            quantity=p.quantity,
            unit_price=p.unit_price,
            total_value=p.total_value,
            created_at=p.created_at,
            ticker=p.asset.ticker if p.asset else None,
            asset_type=p.asset.type if p.asset else None,
        )
        for p in month_purchases
    ]

    return MonthlyOverview(
        month=month,
        min_month=min_month,
        patrimonio_total=round(patrimonio_total, 4),
        reserva_financeira=round(reserva_financeira, 4) if reserva_financeira else None,
        reserva_target=round(reserva_target, 4) if reserva_target else None,
        total_invested=round(total_invested, 4),
        aportes_do_mes=round(aportes_do_mes, 4),
        variacao_mes=round(variacao_mes, 4),
        variacao_mes_pct=round(variacao_mes_pct, 2),
        allocation_breakdown=allocation,
        daily_patrimonio=[],  # Simplified: would need historical price data for daily tracking
        transactions=transactions,
    )


@router.get("/{asset_class}", response_model=PositionsResponse)
async def get_positions_by_class(
    asset_class: AssetType,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if asset_class == AssetType.RF:
        # For RF, return fixed income positions
        fi_result = await db.execute(
            select(FixedIncomePosition)
            .where(FixedIncomePosition.user_id == user.id)
        )
        fi_positions = fi_result.scalars().all()
        positions = []
        total_cost = Decimal("0")
        total_market = Decimal("0")
        for fi in fi_positions:
            positions.append(PositionItem(
                asset_id=fi.asset_id,
                ticker=fi.asset.ticker if fi.asset else "RF",
                description=fi.description,
                type=AssetType.RF,
                first_date=fi.start_date.isoformat(),
                quantity=Decimal("1"),
                total_cost=fi.applied_value,
                avg_price=fi.applied_value,
                current_price=fi.current_balance,
                market_value=fi.current_balance,
                pnl=fi.yield_value,
                pnl_pct=fi.yield_pct * 100,
            ))
            total_cost += fi.applied_value
            total_market += fi.current_balance

        total_pnl = total_market - total_cost
        return PositionsResponse(
            asset_class=asset_class,
            positions=positions,
            total_cost=total_cost,
            total_market_value=total_market,
            total_pnl=total_pnl,
            total_pnl_pct=(total_pnl / total_cost * 100) if total_cost else None,
        )

    # Variable income: aggregate purchases by asset
    result = await db.execute(
        select(
            Asset.id,
            Asset.ticker,
            Asset.description,
            Asset.type,
            Asset.current_price,
            func.sum(Purchase.quantity).label("total_qty"),
            func.sum(Purchase.total_value).label("total_cost"),
            func.min(Purchase.purchase_date).label("first_date"),
        )
        .join(Asset, Purchase.asset_id == Asset.id)
        .where(Purchase.user_id == user.id, Asset.type == asset_class)
        .group_by(Asset.id)
        .having(func.sum(Purchase.quantity) > 0)
    )

    positions = []
    total_cost = Decimal("0")
    total_market = Decimal("0")

    for row in result.all():
        asset_id, ticker, desc, a_type, price, qty, cost, first_date = row
        avg_price = cost / qty if qty else Decimal("0")
        market_value = price * qty if price and qty else None
        pnl = (market_value - cost) if market_value else None
        pnl_pct = (pnl / cost * 100) if pnl and cost else None

        positions.append(PositionItem(
            asset_id=asset_id,
            ticker=ticker,
            description=desc,
            type=a_type,
            first_date=first_date.isoformat() if first_date else None,
            quantity=qty,
            total_cost=cost,
            avg_price=round(avg_price, 4),
            current_price=price,
            market_value=market_value,
            pnl=round(pnl, 4) if pnl else None,
            pnl_pct=round(pnl_pct, 2) if pnl_pct else None,
        ))
        total_cost += cost
        if market_value:
            total_market += market_value

    total_pnl = total_market - total_cost
    return PositionsResponse(
        asset_class=asset_class,
        positions=sorted(positions, key=lambda p: p.ticker),
        total_cost=total_cost,
        total_market_value=total_market,
        total_pnl=total_pnl,
        total_pnl_pct=(total_pnl / total_cost * 100) if total_cost else None,
    )
