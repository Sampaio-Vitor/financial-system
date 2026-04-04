from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.financial_reserve import FinancialReserveEntry
from app.models.fixed_income import FixedIncomePosition
from app.models.purchase import Purchase
from app.models.user import User


async def get_reserve_for_month(
    db: AsyncSession, user_id: int, year: int, month: int
) -> FinancialReserveEntry | None:
    """Get the last reserve entry recorded on or before the end of the given month."""
    from datetime import datetime

    if month == 12:
        month_end = datetime(year + 1, 1, 1)
    else:
        month_end = datetime(year, month + 1, 1)

    result = await db.execute(
        select(FinancialReserveEntry)
        .where(
            FinancialReserveEntry.user_id == user_id,
            FinancialReserveEntry.recorded_at < month_end,
        )
        .order_by(FinancialReserveEntry.recorded_at.desc(), FinancialReserveEntry.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_reserve_for_date(
    db: AsyncSession, user_id: int, target_date: date
) -> FinancialReserveEntry | None:
    """Get the last reserve entry recorded on or before the end of a specific day."""
    day_end = datetime.combine(target_date + timedelta(days=1), time.min)

    result = await db.execute(
        select(FinancialReserveEntry)
        .where(
            FinancialReserveEntry.user_id == user_id,
            FinancialReserveEntry.recorded_at < day_end,
        )
        .order_by(FinancialReserveEntry.recorded_at.desc(), FinancialReserveEntry.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_class_values(
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
