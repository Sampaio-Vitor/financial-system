from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetType,
    asset_bucket_for,
    resolve_asset_metadata,
)
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.daily_snapshot import DailySnapshot
from app.models.monthly_snapshot import MonthlySnapshot
from app.models.user import User
from app.constants import ALLOCATION_BUCKET_LABELS
from app.services.portfolio_service import (
    get_bucket_values,
    get_reserve_for_date,
    get_reserve_for_month,
)
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
        assets_result = (
            await self.db.execute(select(Asset).where(Asset.id.in_(asset_ids)))
            if asset_ids
            else None
        )
        assets_list = list(assets_result.scalars().all()) if assets_result else []
        asset_map = {asset.id: asset for asset in assets_list}

        # ── 2. Fetch historical prices ──
        historical_prices = await self.price_service.fetch_historical_price_details(
            assets_list, month_end_date
        )

        # ── 3. Calculate RV values per class + per-asset breakdown ──
        class_values: dict[AllocationBucket, Decimal] = {
            bucket: Decimal("0") for bucket in AllocationBucket
        }
        total_rv_cost = Decimal("0")
        asset_items: list[dict] = []

        for row in rv_rows:
            asset_id, asset_type, ticker, qty, cost = row
            asset = asset_map.get(asset_id)
            if not asset:
                continue
            resolved_class, resolved_market, resolved_currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            bucket = asset_bucket_for(resolved_class, resolved_market)
            price_detail = historical_prices.get(asset_id)
            native_price = (
                price_detail[0] if price_detail else asset.current_price_native
            )
            fx_rate_to_brl = price_detail[1] if price_detail else asset.fx_rate_to_brl
            price = price_detail[2] if price_detail else asset.current_price
            market_value = price * qty if price and qty else None
            if market_value:
                class_values[bucket] += market_value
            cost_val = cost or Decimal("0")
            total_rv_cost += cost_val

            pnl = (market_value - cost_val) if market_value else None
            pnl_pct_asset = (pnl / cost_val * 100) if pnl and cost_val else None
            avg_price = (cost_val / qty) if qty else Decimal("0")
            avg_price_native = (
                (avg_price / fx_rate_to_brl)
                if avg_price and fx_rate_to_brl and fx_rate_to_brl > 0
                else avg_price
            )

            asset_items.append(
                {
                    "ticker": ticker,
                    "type": asset_type.value,
                    "asset_class": resolved_class.value,
                    "market": resolved_market.value,
                    "quote_currency": resolved_currency.value,
                    "allocation_bucket": bucket.value,
                    "quantity": float(qty) if qty else 0,
                    "avg_price": float(round(avg_price, 4)),
                    "avg_price_native": float(round(avg_price_native, 6))
                    if avg_price_native is not None
                    else None,
                    "closing_price": float(round(price, 4)) if price else None,
                    "closing_price_native": float(round(native_price, 6))
                    if native_price
                    else None,
                    "fx_rate_to_brl": float(round(fx_rate_to_brl, 6))
                    if fx_rate_to_brl
                    else None,
                    "market_value": float(round(market_value, 4))
                    if market_value
                    else None,
                    "total_cost": float(round(cost_val, 4)),
                    "pnl": float(round(pnl, 4)) if pnl else None,
                    "pnl_pct": float(round(pnl_pct_asset, 2))
                    if pnl_pct_asset
                    else None,
                }
            )

        # ── 4. Fixed income: per-position + totals ──
        fi_positions_result = await self.db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date < next_month_start,
            )
        )
        fi_positions = fi_positions_result.scalars().all()
        fi_applied = sum(p.applied_value for p in fi_positions)

        for fi_pos in fi_positions:
            net_value = fi_pos.current_balance
            if net_value > 0:
                asset_items.append(
                    {
                        "ticker": fi_pos.asset.ticker if fi_pos.asset else "RF",
                        "type": "RF",
                        "asset_class": "RF",
                        "market": "BR",
                        "quote_currency": "BRL",
                        "allocation_bucket": "RF",
                        "quantity": 1,
                        "avg_price": float(round(fi_pos.applied_value, 4)),
                        "avg_price_native": float(round(fi_pos.applied_value, 4)),
                        "closing_price": float(round(net_value, 4)),
                        "closing_price_native": float(round(net_value, 4)),
                        "fx_rate_to_brl": 1.0,
                        "market_value": float(round(net_value, 4)),
                        "total_cost": float(round(fi_pos.applied_value, 4)),
                        "pnl": float(round(net_value - fi_pos.applied_value, 4)),
                        "pnl_pct": float(
                            round(
                                (net_value - fi_pos.applied_value)
                                / fi_pos.applied_value
                                * 100,
                                2,
                            )
                        )
                        if fi_pos.applied_value
                        else None,
                    }
                )

        rf_value = sum(
            Decimal(str(item["market_value"]))
            for item in asset_items
            if item["allocation_bucket"] == "RF"
        )
        class_values[AllocationBucket.RF] = rf_value

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
        prev_reserve = await get_reserve_for_month(
            self.db, self.user.id, prev_year, prev_m
        )
        reserva_aporte = reserva - (
            prev_reserve.amount if prev_reserve else Decimal("0")
        )
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
        for bucket in AllocationBucket:
            value = class_values[bucket]
            pct = (
                (value / patrimonio_investivel * 100)
                if patrimonio_investivel
                else Decimal("0")
            )
            allocation.append(
                {
                    "allocation_bucket": bucket.value,
                    "label": ALLOCATION_BUCKET_LABELS[bucket],
                    "value": float(round(value, 4)),
                    "pct": float(round(pct, 2)),
                    "target_pct": 0,
                    "gap": 0,
                }
            )

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

    async def generate_daily_snapshot(self, target_date: date) -> DailySnapshot:
        """Generate a lightweight daily snapshot using current Asset.current_price (no API calls)."""
        today = target_date
        tomorrow = today + timedelta(days=1)

        # ── 1. Variable income positions ──
        rv_query = (
            select(
                Asset.id,
                Asset.type,
                Asset.asset_class,
                Asset.market,
                Asset.quote_currency,
                Asset.current_price,
                func.sum(Purchase.quantity).label("total_qty"),
                func.sum(Purchase.total_value).label("total_cost"),
            )
            .join(Asset, Purchase.asset_id == Asset.id)
            .where(
                Purchase.user_id == self.user.id,
                Asset.type != AssetType.RF,
                Purchase.purchase_date <= today,
            )
            .group_by(
                Asset.id,
                Asset.type,
                Asset.asset_class,
                Asset.market,
                Asset.quote_currency,
                Asset.current_price,
            )
        )
        rv_result = await self.db.execute(rv_query)
        rv_rows = rv_result.all()

        class_values: dict[AllocationBucket, Decimal] = {
            bucket: Decimal("0") for bucket in AllocationBucket
        }
        total_rv_cost = Decimal("0")

        for row in rv_rows:
            (
                _asset_id,
                asset_type,
                asset_class,
                market,
                quote_currency,
                current_price,
                qty,
                cost,
            ) = row
            asset_class, market, quote_currency = resolve_asset_metadata(
                legacy_type=asset_type,
                asset_class=asset_class,
                market=market,
                quote_currency=quote_currency,
            )
            bucket = asset_bucket_for(asset_class, market)
            if current_price and qty:
                market_value = current_price * qty
                class_values[bucket] += market_value
            cost_val = cost or Decimal("0")
            total_rv_cost += cost_val

        # ── 2. Fixed income ──
        fi_positions_result = await self.db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date <= today,
            )
        )
        fi_positions = fi_positions_result.scalars().all()
        fi_applied = sum(p.applied_value for p in fi_positions)
        current_bucket_values = await get_bucket_values(
            self.db, self.user, cutoff=tomorrow
        )
        class_values[AllocationBucket.RF] = current_bucket_values[AllocationBucket.RF]

        # ── 3. Reserve ──
        reserve_entry = await get_reserve_for_date(self.db, self.user.id, today)
        reserva = reserve_entry.amount if reserve_entry else Decimal("0")

        # ── 4. Totals ──
        patrimonio_investivel = sum(class_values.values())
        patrimonio_total = patrimonio_investivel + reserva

        total_invested = total_rv_cost + fi_applied + reserva
        total_pnl = patrimonio_total - total_invested
        pnl_pct = (total_pnl / total_invested * 100) if total_invested else Decimal("0")

        # ── 5. Upsert ──
        existing = await self.db.execute(
            select(DailySnapshot).where(
                DailySnapshot.user_id == self.user.id,
                DailySnapshot.date == today,
            )
        )
        snapshot = existing.scalar_one_or_none()

        if snapshot:
            snapshot.total_patrimonio = round(patrimonio_total, 4)
            snapshot.total_invested = round(total_invested, 4)
            snapshot.total_pnl = round(total_pnl, 4)
            snapshot.pnl_pct = round(pnl_pct, 4)
            snapshot.snapshot_at = datetime.now(timezone.utc)
        else:
            snapshot = DailySnapshot(
                user_id=self.user.id,
                date=today,
                total_patrimonio=round(patrimonio_total, 4),
                total_invested=round(total_invested, 4),
                total_pnl=round(total_pnl, 4),
                pnl_pct=round(pnl_pct, 4),
                snapshot_at=datetime.now(timezone.utc),
            )
            self.db.add(snapshot)

        return snapshot

    async def generate_all(self) -> list[MonthlySnapshot]:
        """Generate/regenerate snapshots for all months from earliest data to last month."""
        # Find earliest date
        min_purchase = await self.db.execute(
            select(func.min(Purchase.purchase_date)).where(
                Purchase.user_id == self.user.id
            )
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
