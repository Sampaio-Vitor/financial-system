from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetClass, AssetType
from app.models.asset_daily_snapshot import AssetDailySnapshot
from app.models.dividend_event import DividendEvent
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.purchase import Purchase
from app.models.user import User
from app.schemas.snapshot import MoverItem, MoversResponse


PERIOD_DAYS = {
    "day": 1,
    "week": 7,
    "month": 30,
    "year": 365,
}


class MoversService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def compute(
        self,
        *,
        period: str,
        asset_class: str | None,
        market: str | None,
        limit: int,
        include_rf: bool,
    ) -> MoversResponse:
        days = PERIOD_DAYS[period]

        # Reference (end) date = latest snapshot we have
        latest_q = await self.db.execute(
            select(func.max(AssetDailySnapshot.date)).where(
                AssetDailySnapshot.user_id == self.user.id
            )
        )
        end_date = latest_q.scalar()
        if not end_date:
            return MoversResponse(
                period=period,
                reference_date=date.today(),
                period_start_date=date.today(),
                total_patrimonio=0.0,
                total_period_pnl=0.0,
                winners=[],
                losers=[],
            )

        target_start = end_date - timedelta(days=days)

        # Find the closest snapshot date <= target_start (per asset)
        # Strategy: pick the max date <= target_start across all snapshots; fallback to min snapshot date
        start_q = await self.db.execute(
            select(func.max(AssetDailySnapshot.date)).where(
                AssetDailySnapshot.user_id == self.user.id,
                AssetDailySnapshot.date <= target_start,
            )
        )
        start_date = start_q.scalar()
        if not start_date:
            min_q = await self.db.execute(
                select(func.min(AssetDailySnapshot.date)).where(
                    AssetDailySnapshot.user_id == self.user.id
                )
            )
            start_date = min_q.scalar() or end_date

        # Load end snapshots (joined with Asset for description)
        end_rows = (
            await self.db.execute(
                select(AssetDailySnapshot, Asset)
                .join(Asset, Asset.id == AssetDailySnapshot.asset_id)
                .where(
                    AssetDailySnapshot.user_id == self.user.id,
                    AssetDailySnapshot.date == end_date,
                )
            )
        ).all()
        start_rows = (
            (
                await self.db.execute(
                    select(AssetDailySnapshot).where(
                        AssetDailySnapshot.user_id == self.user.id,
                        AssetDailySnapshot.date == start_date,
                    )
                )
            )
            .scalars()
            .all()
        )
        start_by_asset = {s.asset_id: s for s in start_rows}

        cash_flows: dict[int, list[tuple[date, Decimal]]] = {}

        def add_flow(asset_id: int, amount: Decimal, flow_date: date) -> None:
            cash_flows.setdefault(asset_id, []).append((flow_date, amount))

        # Net contributions per asset in (start_date, end_date]
        contrib_rows = (
            await self.db.execute(
                select(
                    Purchase.asset_id, Purchase.total_value, Purchase.purchase_date
                ).where(
                    Purchase.user_id == self.user.id,
                    Purchase.purchase_date > start_date,
                    Purchase.purchase_date <= end_date,
                )
            )
        ).all()
        for aid, val, flow_date in contrib_rows:
            add_flow(aid, val or Decimal("0"), flow_date)

        # FI applied within range
        fi_applied_rows = (
            await self.db.execute(
                select(
                    FixedIncomePosition.asset_id,
                    FixedIncomePosition.applied_value,
                    FixedIncomePosition.start_date,
                ).where(
                    FixedIncomePosition.user_id == self.user.id,
                    FixedIncomePosition.start_date > start_date,
                    FixedIncomePosition.start_date <= end_date,
                )
            )
        ).all()
        for aid, val, flow_date in fi_applied_rows:
            add_flow(aid, val or Decimal("0"), flow_date)

        fi_redeem_rows = (
            await self.db.execute(
                select(
                    FixedIncomePosition.asset_id,
                    FixedIncomeRedemption.amount,
                    FixedIncomeRedemption.redemption_date,
                )
                .join(
                    FixedIncomePosition,
                    FixedIncomePosition.id == FixedIncomeRedemption.fixed_income_id,
                )
                .where(
                    FixedIncomeRedemption.user_id == self.user.id,
                    FixedIncomeRedemption.redemption_date > start_date,
                    FixedIncomeRedemption.redemption_date <= end_date,
                )
            )
        ).all()
        for aid, val, flow_date in fi_redeem_rows:
            add_flow(aid, -(val or Decimal("0")), flow_date)

        orphan_fi_redeem_rows = (
            await self.db.execute(
                select(
                    Asset.id,
                    FixedIncomeRedemption.amount,
                    FixedIncomeRedemption.redemption_date,
                )
                .join(Asset, Asset.ticker == FixedIncomeRedemption.ticker)
                .where(
                    FixedIncomeRedemption.user_id == self.user.id,
                    FixedIncomeRedemption.fixed_income_id.is_(None),
                    FixedIncomeRedemption.redemption_date > start_date,
                    FixedIncomeRedemption.redemption_date <= end_date,
                    Asset.type == AssetType.RF,
                )
            )
        ).all()
        for aid, val, flow_date in orphan_fi_redeem_rows:
            add_flow(aid, -(val or Decimal("0")), flow_date)

        # Dividends per asset in range
        div_rows = (
            await self.db.execute(
                select(
                    DividendEvent.asset_id,
                    DividendEvent.payment_date,
                    DividendEvent.credited_amount,
                ).where(
                    DividendEvent.user_id == self.user.id,
                    DividendEvent.payment_date > start_date,
                    DividendEvent.payment_date <= end_date,
                    DividendEvent.asset_id.is_not(None),
                )
            )
        ).all()
        dividends: dict[int, list[tuple[date, Decimal]]] = {}
        for aid, payment_date, amount in div_rows:
            dividends.setdefault(aid, []).append((payment_date, amount or Decimal("0")))

        # Compute movers
        items: list[MoverItem] = []
        total_period_pnl = Decimal("0")

        for end_snap, asset in end_rows:
            ac = end_snap.asset_class or asset.asset_class
            mk = end_snap.market or asset.market
            ac_value = ac.value if ac else None
            mk_value = mk.value if mk else None

            if not include_rf and (ac == AssetClass.RF or asset.type == AssetType.RF):
                continue
            if asset_class and asset_class != "ALL" and ac_value != asset_class:
                continue
            if market and market != "ALL" and mk_value != market:
                continue

            start_snap = start_by_asset.get(end_snap.asset_id)
            asset_flows = cash_flows.get(end_snap.asset_id, [])
            if start_snap:
                effective_start = start_date
                start_val = start_snap.position_value or Decimal("0")
                include_flow_on_start = False
            else:
                effective_start = min(
                    (flow_date for flow_date, _ in asset_flows), default=start_date
                )
                start_val = Decimal("0")
                include_flow_on_start = True

            end_val = end_snap.position_value or Decimal("0")
            effective_days = max((end_date - effective_start).days, 1)

            def is_effective_flow(flow_date: date) -> bool:
                if include_flow_on_start:
                    return effective_start <= flow_date <= end_date
                return effective_start < flow_date <= end_date

            def flow_weight(flow_date: date) -> Decimal:
                return Decimal((end_date - flow_date).days) / Decimal(effective_days)

            effective_flows = [
                (flow_date, amount)
                for flow_date, amount in asset_flows
                if is_effective_flow(flow_date)
            ]
            net_contrib = sum(
                (amount for _flow_date, amount in effective_flows), Decimal("0")
            )
            weighted_contrib = sum(
                (
                    amount * flow_weight(flow_date)
                    for flow_date, amount in effective_flows
                ),
                Decimal("0"),
            )
            divs = sum(
                (
                    amount
                    for payment_date, amount in dividends.get(end_snap.asset_id, [])
                    if is_effective_flow(payment_date)
                ),
                Decimal("0"),
            )

            pnl = end_val - start_val - net_contrib + divs
            denom = start_val + weighted_contrib
            pnl_pct = float(pnl / denom * 100) if denom > 0 else 0.0
            total_period_pnl += pnl

            items.append(
                MoverItem(
                    asset_id=end_snap.asset_id,
                    ticker=end_snap.ticker or asset.ticker,
                    description=asset.description or None,
                    asset_class=ac_value,
                    market=mk_value,
                    position_value=float(round(end_val, 2)),
                    pnl_period_brl=float(round(pnl, 2)),
                    pnl_period_pct=round(pnl_pct, 2),
                    contribution_pct=0.0,
                    net_contributions_brl=float(round(net_contrib, 2)),
                    dividends_brl=float(round(divs, 2)),
                )
            )

        # contribution_pct: pnl / total patrimonio at start
        total_start_patrimonio = sum(
            (s.position_value or Decimal("0")) for s in start_rows
        ) or Decimal("1")
        for it in items:
            it.contribution_pct = round(
                it.pnl_period_brl / float(total_start_patrimonio) * 100, 2
            )

        items.sort(key=lambda i: i.pnl_period_brl, reverse=True)
        winners = [i for i in items if i.pnl_period_brl > 0][:limit]
        losers = sorted(
            [i for i in items if i.pnl_period_brl < 0],
            key=lambda i: i.pnl_period_brl,
        )[:limit]

        total_patrimonio_now = sum(
            (s.position_value or Decimal("0")) for s, _ in end_rows
        )

        return MoversResponse(
            period=period,
            reference_date=end_date,
            period_start_date=start_date,
            total_patrimonio=float(round(total_patrimonio_now, 2)),
            total_period_pnl=float(round(total_period_pnl, 2)),
            winners=winners,
            losers=losers,
        )
