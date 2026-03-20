from calendar import monthrange
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.monthly_snapshot import MonthlySnapshot
from app.models.user import User
from app.constants import CLASS_LABELS
from app.services.portfolio_service import get_reserve_for_month
from app.services.price_service import PriceService


class SnapshotService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user
        self.price_service = PriceService(db, user)

    async def generate_snapshot(self, year: int, month: int) -> MonthlySnapshot:
        """Generate (or update) the snapshot for a specific month."""
        month_str = f"{year}-{month:02d}"
        last_day = monthrange(year, month)[1]
        month_end_date = date(year, month, last_day)

        if month == 12:
            next_month_start = date(year + 1, 1, 1)
        else:
            next_month_start = date(year, month + 1, 1)

        month_start = date(year, month, 1)

        # ── 1. Variable income positions (purchases before month end) ──
        rv_query = (
            select(
                Asset.id,
                Asset.type,
                Asset.ticker,
                func.sum(Purchase.quantity).label("total_qty"),
                func.sum(Purchase.total_value).label("total_cost"),
            )
            .join(Asset, Purchase.asset_id == Asset.id)
            .where(
                Purchase.user_id == self.user.id,
                Asset.type != AssetType.RF,
                Purchase.purchase_date < next_month_start,
            )
            .group_by(Asset.id, Asset.type, Asset.ticker)
        )
        rv_result = await self.db.execute(rv_query)
        rv_rows = rv_result.all()

        # Collect assets that need historical prices
        asset_ids = [row.id for row in rv_rows]
        assets_result = await self.db.execute(
            select(Asset).where(Asset.id.in_(asset_ids))
        ) if asset_ids else None
        assets_list = list(assets_result.scalars().all()) if assets_result else []

        # ── 2. Fetch historical prices ──
        historical_prices = await self.price_service.fetch_historical_prices(
            assets_list, month_end_date
        )

        # ── 3. Calculate RV values per class + per-asset breakdown ──
        class_values: dict[AssetType, Decimal] = {t: Decimal("0") for t in AssetType}
        total_rv_cost = Decimal("0")
        asset_items: list[dict] = []

        for row in rv_rows:
            asset_id, asset_type, ticker, qty, cost = row
            price = historical_prices.get(asset_id)
            market_value = price * qty if price and qty else None
            if market_value:
                class_values[asset_type] += market_value
            cost_val = cost or Decimal("0")
            total_rv_cost += cost_val

            pnl = (market_value - cost_val) if market_value else None
            pnl_pct_asset = (pnl / cost_val * 100) if pnl and cost_val else None
            avg_price = (cost_val / qty) if qty else Decimal("0")

            asset_items.append({
                "ticker": ticker,
                "type": asset_type.value,
                "quantity": float(qty) if qty else 0,
                "avg_price": float(round(avg_price, 4)),
                "closing_price": float(round(price, 4)) if price else None,
                "market_value": float(round(market_value, 4)) if market_value else None,
                "total_cost": float(round(cost_val, 4)),
                "pnl": float(round(pnl, 4)) if pnl else None,
                "pnl_pct": float(round(pnl_pct_asset, 2)) if pnl_pct_asset else None,
            })

        # ── 4. Fixed income: per-position + totals ──
        fi_positions_result = await self.db.execute(
            select(FixedIncomePosition)
            .where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date < next_month_start,
            )
        )
        fi_positions = fi_positions_result.scalars().all()
        fi_applied = sum(p.applied_value for p in fi_positions)

        # Batch query for per-position redemptions (fixes N+1)
        fi_pos_ids = [p.id for p in fi_positions]
        redemption_by_position: dict[int, Decimal] = {}
        if fi_pos_ids:
            batch_redemptions = await self.db.execute(
                select(
                    FixedIncomeRedemption.fixed_income_id,
                    func.sum(FixedIncomeRedemption.amount).label("total"),
                ).where(
                    FixedIncomeRedemption.user_id == self.user.id,
                    FixedIncomeRedemption.fixed_income_id.in_(fi_pos_ids),
                    FixedIncomeRedemption.redemption_date < next_month_start,
                ).group_by(FixedIncomeRedemption.fixed_income_id)
            )
            for row in batch_redemptions.all():
                redemption_by_position[row.fixed_income_id] = row.total

        for fi_pos in fi_positions:
            pos_redeemed = redemption_by_position.get(fi_pos.id, Decimal("0"))
            net_value = fi_pos.applied_value - pos_redeemed
            if net_value > 0:
                asset_items.append({
                    "ticker": fi_pos.asset.ticker if fi_pos.asset else "RF",
                    "type": "RF",
                    "quantity": 1,
                    "avg_price": float(round(fi_pos.applied_value, 4)),
                    "closing_price": float(round(net_value, 4)),
                    "market_value": float(round(net_value, 4)),
                    "total_cost": float(round(fi_pos.applied_value, 4)),
                    "pnl": float(round(net_value - fi_pos.applied_value, 4)),
                    "pnl_pct": float(round((net_value - fi_pos.applied_value) / fi_pos.applied_value * 100, 2)) if fi_pos.applied_value else None,
                })

        redemption_query = select(func.sum(FixedIncomeRedemption.amount)).where(
            FixedIncomeRedemption.user_id == self.user.id,
            FixedIncomeRedemption.redemption_date < next_month_start,
        )
        redemption_result = await self.db.execute(redemption_query)
        fi_redeemed = redemption_result.scalar() or Decimal("0")

        rf_value = fi_applied - fi_redeemed
        class_values[AssetType.RF] = rf_value

        # ── 5. Reserve ──
        reserve_entry = await get_reserve_for_month(self.db, self.user.id, year, month)
        reserva = reserve_entry.amount if reserve_entry else Decimal("0")

        # ── 6. Aportes do mes ──
        # RV purchases in this month
        rv_aportes_result = await self.db.execute(
            select(func.sum(Purchase.total_value)).where(
                Purchase.user_id == self.user.id,
                Purchase.purchase_date >= month_start,
                Purchase.purchase_date < next_month_start,
            )
        )
        aportes_do_mes = rv_aportes_result.scalar() or Decimal("0")

        # FI positions started this month
        fi_aportes_result = await self.db.execute(
            select(func.sum(FixedIncomePosition.applied_value)).where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date >= month_start,
                FixedIncomePosition.start_date < next_month_start,
            )
        )
        aportes_do_mes += fi_aportes_result.scalar() or Decimal("0")

        # Reserve increase
        if month == 1:
            prev_year, prev_m = year - 1, 12
        else:
            prev_year, prev_m = year, month - 1
        prev_reserve = await get_reserve_for_month(self.db, self.user.id, prev_year, prev_m)
        reserva_aporte = reserva - (prev_reserve.amount if prev_reserve else Decimal("0"))
        if reserva_aporte > 0:
            aportes_do_mes += reserva_aporte

        # ── 7. Totals ──
        patrimonio_investivel = sum(class_values.values())
        patrimonio_total = patrimonio_investivel + reserva

        total_invested = total_rv_cost + fi_applied
        # Add reserve to invested
        total_invested += reserva

        total_pnl = patrimonio_total - total_invested
        pnl_pct = (total_pnl / total_invested * 100) if total_invested else Decimal("0")

        # Allocation breakdown
        allocation = []
        for asset_class in AssetType:
            value = class_values[asset_class]
            pct = (value / patrimonio_investivel * 100) if patrimonio_investivel else Decimal("0")
            allocation.append({
                "asset_class": asset_class.value,
                "label": CLASS_LABELS[asset_class],
                "value": float(round(value, 4)),
                "pct": float(round(pct, 2)),
            })

        # ── 8. Upsert snapshot ──
        existing = await self.db.execute(
            select(MonthlySnapshot).where(
                MonthlySnapshot.user_id == self.user.id,
                MonthlySnapshot.month == month_str,
            )
        )
        snapshot = existing.scalar_one_or_none()

        # Sort assets by market_value descending
        asset_items.sort(key=lambda x: x.get("market_value") or 0, reverse=True)

        if snapshot:
            snapshot.total_patrimonio = round(patrimonio_total, 4)
            snapshot.total_invested = round(total_invested, 4)
            snapshot.total_pnl = round(total_pnl, 4)
            snapshot.pnl_pct = round(pnl_pct, 4)
            snapshot.aportes_do_mes = round(aportes_do_mes, 4)
            snapshot.allocation_breakdown = allocation
            snapshot.asset_breakdown = asset_items
            snapshot.snapshot_at = datetime.now(timezone.utc)
        else:
            snapshot = MonthlySnapshot(
                user_id=self.user.id,
                month=month_str,
                total_patrimonio=round(patrimonio_total, 4),
                total_invested=round(total_invested, 4),
                total_pnl=round(total_pnl, 4),
                pnl_pct=round(pnl_pct, 4),
                aportes_do_mes=round(aportes_do_mes, 4),
                allocation_breakdown=allocation,
                asset_breakdown=asset_items,
                snapshot_at=datetime.now(timezone.utc),
            )
            self.db.add(snapshot)

        await self.db.commit()
        await self.db.refresh(snapshot)
        return snapshot

    async def generate_all(self) -> list[MonthlySnapshot]:
        """Generate/regenerate snapshots for all months from earliest data to last month."""
        # Find earliest date
        min_purchase = await self.db.execute(
            select(func.min(Purchase.purchase_date)).where(Purchase.user_id == self.user.id)
        )
        min_fi = await self.db.execute(
            select(func.min(FixedIncomePosition.start_date)).where(
                FixedIncomePosition.user_id == self.user.id
            )
        )
        dates = [d for d in [min_purchase.scalar(), min_fi.scalar()] if d]
        if not dates:
            return []

        start_date = min(dates)
        today = date.today()

        # Last month (don't generate current month — it's incomplete)
        if today.month == 1:
            end_year, end_month = today.year - 1, 12
        else:
            end_year, end_month = today.year, today.month - 1

        snapshots = []
        y, m = start_date.year, start_date.month
        while (y, m) <= (end_year, end_month):
            snapshot = await self.generate_snapshot(y, m)
            snapshots.append(snapshot)

            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1

        return snapshots
