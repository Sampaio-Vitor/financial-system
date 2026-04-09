from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetClass,
    AssetType,
    Market,
    asset_bucket_for,
    resolve_asset_metadata,
)
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_interest import FixedIncomeInterest
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.allocation_target import AllocationTarget
from app.models.financial_reserve import FinancialReserveEntry, FinancialReserveTarget
from app.models.dividend_event import DividendEvent
from app.models.user import User
from app.constants import ALLOCATION_BUCKET_LABELS
from app.services.portfolio_service import get_bucket_values, get_reserve_for_month, get_class_values
from app.schemas.portfolio import (
    MonthlyOverview,
    ClassSummary,
    FixedIncomeTransactionItem,
    PositionsResponse,
    PositionItem,
)
from app.schemas.purchase import PurchaseResponse
from app.schemas.dividend import DividendEventResponse

router = APIRouter()


async def _get_targets(db: AsyncSession, user: User) -> dict[AllocationBucket, Decimal]:
    result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    return {t.allocation_bucket: t.target_pct for t in result.scalars().all()}


async def _build_variable_income_positions(
    db: AsyncSession,
    user: User,
    *,
    legacy_type: AssetType | None = None,
    asset_class: AssetClass | None = None,
    market: Market | None = None,
) -> PositionsResponse:
    result = await db.execute(
        select(
            Asset.id,
            Asset.ticker,
            Asset.description,
            Asset.type,
            Asset.asset_class,
            Asset.market,
            Asset.quote_currency,
            Asset.current_price,
            Asset.current_price_native,
            Asset.fx_rate_to_brl,
            func.sum(Purchase.quantity).label("total_qty"),
            func.sum(Purchase.total_value).label("total_cost"),
            func.min(Purchase.purchase_date).label("first_date"),
        )
        .join(Asset, Purchase.asset_id == Asset.id)
        .where(Purchase.user_id == user.id)
        .group_by(
            Asset.id,
            Asset.ticker,
            Asset.description,
            Asset.type,
            Asset.asset_class,
            Asset.market,
            Asset.quote_currency,
            Asset.current_price,
            Asset.current_price_native,
            Asset.fx_rate_to_brl,
        )
        .having(func.sum(Purchase.quantity) > 0)
    )

    positions = []
    total_cost = Decimal("0")
    total_market = Decimal("0")
    selected_v2: AssetClass | None = asset_class
    selected_market: Market | None = market
    selected_bucket: AllocationBucket | None = None

    for row in result.all():
        (
            asset_id,
            ticker,
            desc,
            a_type,
            a_asset_class,
            a_market,
            a_quote_currency,
            price,
            native_price,
            fx_rate_to_brl,
            qty,
            cost,
            first_date,
        ) = row
        resolved_class, resolved_market, resolved_currency = resolve_asset_metadata(
            legacy_type=a_type,
            asset_class=a_asset_class,
            market=a_market,
            quote_currency=a_quote_currency,
        )
        if legacy_type is not None and a_type != legacy_type:
            continue
        if asset_class is not None and resolved_class != asset_class:
            continue
        if market is not None and resolved_market != market:
            continue

        avg_price = cost / qty if qty else Decimal("0")
        market_value = price * qty if price and qty else None
        pnl = (market_value - cost) if market_value else None
        pnl_pct = (pnl / cost * 100) if pnl and cost else None
        bucket = asset_bucket_for(resolved_class, resolved_market)
        selected_bucket = selected_bucket or bucket

        positions.append(PositionItem(
            asset_id=asset_id,
            ticker=ticker,
            description=desc,
            type=a_type,
            asset_class=resolved_class,
            market=resolved_market,
            quote_currency=resolved_currency,
            first_date=first_date.isoformat() if first_date else None,
            quantity=qty,
            total_cost=cost,
            avg_price=round(avg_price, 4),
            current_price=price,
            current_price_native=native_price,
            fx_rate_to_brl=fx_rate_to_brl,
            market_value=market_value,
            pnl=round(pnl, 4) if pnl else None,
            pnl_pct=round(pnl_pct, 2) if pnl_pct else None,
        ))
        total_cost += cost
        if market_value:
            total_market += market_value

    total_pnl = total_market - total_cost
    response_type = legacy_type or AssetType.STOCK
    return PositionsResponse(
        asset_class=response_type,
        asset_class_v2=selected_v2,
        market=selected_market,
        allocation_bucket=selected_bucket,
        positions=sorted(positions, key=lambda p: p.ticker),
        total_cost=total_cost,
        total_market_value=total_market,
        total_pnl=total_pnl,
        total_pnl_pct=(total_pnl / total_cost * 100) if total_cost else None,
    )


@router.get("/overview", response_model=MonthlyOverview)
async def get_overview(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
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
    aportes_do_mes = sum(p.total_value for p in month_purchases if p.quantity > 0)

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

    # --- Resgates do mês ---
    # 1) Vendas RV: purchases com quantity negativa no mês (total_value será negativo)
    vendas_result = await db.execute(
        select(func.sum(Purchase.total_value))
        .where(
            Purchase.user_id == user.id,
            Purchase.purchase_date >= month_start,
            Purchase.purchase_date < month_end,
            Purchase.quantity < 0,
        )
    )
    resgates_do_mes = abs(vendas_result.scalar() or Decimal("0"))

    # 2) Resgates RF no mês
    fi_resgates = await db.execute(
        select(func.sum(FixedIncomeRedemption.amount))
        .where(
            FixedIncomeRedemption.user_id == user.id,
            FixedIncomeRedemption.redemption_date >= month_start,
            FixedIncomeRedemption.redemption_date < month_end,
        )
    )
    resgates_do_mes += fi_resgates.scalar() or Decimal("0")

    # 3) Juros RF no mes
    fi_juros = await db.execute(
        select(func.sum(FixedIncomeInterest.interest_amount))
        .where(
            FixedIncomeInterest.user_id == user.id,
            FixedIncomeInterest.reference_month >= month_start,
            FixedIncomeInterest.reference_month < month_end,
        )
    )
    aportes_do_mes += fi_juros.scalar() or Decimal("0")

    # Reserve: track gross deposits/withdrawals from individual entries
    reserve_entry = await get_reserve_for_month(db, user.id, year, m)
    reserva_financeira = reserve_entry.amount if reserve_entry else None
    if m == 1:
        prev_year_r, prev_m_r = year - 1, 12
    else:
        prev_year_r, prev_m_r = year, m - 1
    prev_reserve = await get_reserve_for_month(db, user.id, prev_year_r, prev_m_r)

    # Get ALL reserve entries in this month to compute gross movements
    month_start_dt = datetime(year, m, 1)
    month_end_dt = datetime(year + 1, 1, 1) if m == 12 else datetime(year, m + 1, 1)
    all_reserve_entries = await db.execute(
        select(FinancialReserveEntry)
        .where(
            FinancialReserveEntry.user_id == user.id,
            FinancialReserveEntry.recorded_at >= month_start_dt,
            FinancialReserveEntry.recorded_at < month_end_dt,
        )
        .order_by(FinancialReserveEntry.recorded_at.asc(), FinancialReserveEntry.id.asc())
    )
    reserve_entries_month = all_reserve_entries.scalars().all()

    reserva_depositos = Decimal("0")
    reserva_resgates = Decimal("0")
    prev_amount = prev_reserve.amount if prev_reserve else Decimal("0")
    for entry in reserve_entries_month:
        delta = entry.amount - prev_amount
        if delta > 0:
            reserva_depositos += delta
        elif delta < 0:
            reserva_resgates += abs(delta)
        prev_amount = entry.amount

    aportes_do_mes += reserva_depositos
    resgates_do_mes += reserva_resgates

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
    class_values = await get_bucket_values(db, user, cutoff=month_end)

    # Reserve target
    target_result = await db.execute(
        select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == user.id)
    )
    reserve_target = target_result.scalar_one_or_none()
    reserva_target = reserve_target.target_amount if reserve_target else None

    patrimonio_total = sum(class_values.values()) + (reserva_financeira or Decimal("0"))

    # Month-over-month variation: compute previous month's patrimonio on-the-fly
    prev_class_values = await get_bucket_values(db, user, cutoff=month_start)
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

    # Build allocation breakdown (percentages relative to investable patrimony, excluding reserve)
    patrimonio_investivel = sum(class_values.values())
    allocation = []
    for allocation_bucket in AllocationBucket:
        value = class_values[allocation_bucket]
        pct = (value / patrimonio_investivel * 100) if patrimonio_investivel else Decimal("0")
        target_pct = targets.get(allocation_bucket, Decimal("0")) * 100
        allocation.append(ClassSummary(
            allocation_bucket=allocation_bucket,
            label=ALLOCATION_BUCKET_LABELS[allocation_bucket],
            value=value,
            pct=round(pct, 2),
            target_pct=round(target_pct, 2),
            gap=round(target_pct - pct, 2),
        ))

    # RF aportes detail (positions started this month)
    fi_aportes_detail = await db.execute(
        select(FixedIncomePosition)
        .where(
            FixedIncomePosition.user_id == user.id,
            FixedIncomePosition.start_date >= month_start,
            FixedIncomePosition.start_date < month_end,
        )
    )
    fi_aportes_list = [
        FixedIncomeTransactionItem(
            ticker=fi.asset.ticker if fi.asset else "RF",
            description=fi.description,
            date=fi.start_date,
            amount=fi.applied_value,
        )
        for fi in fi_aportes_detail.scalars().all()
    ]

    # RF redemptions detail
    fi_resgates_detail = await db.execute(
        select(FixedIncomeRedemption)
        .where(
            FixedIncomeRedemption.user_id == user.id,
            FixedIncomeRedemption.redemption_date >= month_start,
            FixedIncomeRedemption.redemption_date < month_end,
        )
    )
    fi_redemptions_list = [
        FixedIncomeTransactionItem(
            ticker=fi.ticker,
            description=fi.description,
            date=fi.redemption_date,
            amount=fi.amount,
        )
        for fi in fi_resgates_detail.scalars().all()
    ]

    # RF interest detail
    fi_interest_detail = await db.execute(
        select(FixedIncomeInterest)
        .where(
            FixedIncomeInterest.user_id == user.id,
            FixedIncomeInterest.reference_month >= month_start,
            FixedIncomeInterest.reference_month < month_end,
        )
    )
    fi_interest_list = [
        FixedIncomeTransactionItem(
            ticker=fi.ticker,
            description=fi.description,
            date=fi.reference_month,
            amount=fi.interest_amount,
        )
        for fi in fi_interest_detail.scalars().all()
    ]

    # Dividend events for the month
    div_result = await db.execute(
        select(DividendEvent)
        .where(
            DividendEvent.user_id == user.id,
            DividendEvent.payment_date >= month_start,
            DividendEvent.payment_date < month_end,
        )
        .order_by(DividendEvent.payment_date.desc())
    )
    month_dividends = div_result.scalars().all()
    proventos_do_mes = sum(d.credited_amount for d in month_dividends)
    dividend_events = [
        DividendEventResponse(
            id=d.id,
            transaction_id=d.transaction_id,
            asset_id=d.asset_id,
            ticker=d.ticker,
            asset_type=d.asset.type.value if d.asset else None,
            event_type=d.event_type,
            credited_amount=d.credited_amount,
            gross_amount=d.gross_amount,
            withholding_tax=d.withholding_tax,
            quantity_base=d.quantity_base,
            amount_per_unit=d.amount_per_unit,
            payment_date=d.payment_date,
            description=d.description,
            source_category=d.source_category,
            source_confidence=d.source_confidence,
            created_at=d.created_at,
        )
        for d in month_dividends
    ]

    # Transactions for the month
    transactions = [
        PurchaseResponse(
            id=p.id,
            asset_id=p.asset_id,
            purchase_date=p.purchase_date,
            quantity=p.quantity,
            trade_currency=p.trade_currency,
            unit_price=p.unit_price,
            total_value=p.total_value,
            unit_price_native=p.unit_price_native,
            total_value_native=p.total_value_native,
            fx_rate=p.fx_rate,
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
        resgates_do_mes=round(resgates_do_mes, 4),
        variacao_mes=round(variacao_mes, 4),
        variacao_mes_pct=round(variacao_mes_pct, 2),
        allocation_breakdown=allocation,
        transactions=transactions,
        fi_aportes=fi_aportes_list,
        fi_redemptions=fi_redemptions_list,
        fi_interest=fi_interest_list,
        reserva_depositos=round(reserva_depositos, 4),
        reserva_resgates=round(reserva_resgates, 4),
        proventos_do_mes=round(proventos_do_mes, 4),
        dividend_events=dividend_events,
    )


@router.get("/positions", response_model=PositionsResponse)
async def get_positions(
    asset_class: AssetClass | None = Query(None),
    market: Market | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _build_variable_income_positions(
        db,
        user,
        asset_class=asset_class,
        market=market,
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

    return await _build_variable_income_positions(
        db,
        user,
        legacy_type=asset_class,
    )
