from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete

from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetClass,
    AssetType,
    CurrencyCode,
    Market,
    asset_bucket_for,
    resolve_asset_metadata,
)
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.daily_snapshot import DailySnapshot
from app.models.asset_daily_snapshot import AssetDailySnapshot
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

        # ── 6. Aportes liquidos do mes ──
        # Variable income purchases include sells as negative total_value.
        rv_aportes_result = await self.db.execute(
            select(func.sum(Purchase.total_value)).where(
                Purchase.user_id == self.user.id,
                Purchase.purchase_date >= month_start,
                Purchase.purchase_date < next_month_start,
            )
        )
        aportes_do_mes = rv_aportes_result.scalar() or Decimal("0")

        # Fixed income positions started this month, net of redemptions.
        fi_aportes_result = await self.db.execute(
            select(func.sum(FixedIncomePosition.applied_value)).where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date >= month_start,
                FixedIncomePosition.start_date < next_month_start,
            )
        )
        aportes_do_mes += fi_aportes_result.scalar() or Decimal("0")

        fi_resgates_result = await self.db.execute(
            select(func.sum(FixedIncomeRedemption.amount)).where(
                FixedIncomeRedemption.user_id == self.user.id,
                FixedIncomeRedemption.redemption_date >= month_start,
                FixedIncomeRedemption.redemption_date < next_month_start,
            )
        )
        aportes_do_mes -= fi_resgates_result.scalar() or Decimal("0")

        # Reserve delta: deposits increase net contribution, withdrawals reduce it.
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
                Asset.ticker,
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
                Asset.ticker,
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
        per_asset_rows: list[dict] = []

        for row in rv_rows:
            (
                asset_id,
                ticker,
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
            market_value = Decimal("0")
            if current_price and qty:
                market_value = current_price * qty
                class_values[bucket] += market_value
            cost_val = cost or Decimal("0")
            total_rv_cost += cost_val
            per_asset_rows.append(
                {
                    "asset_id": asset_id,
                    "ticker": ticker,
                    "asset_class": asset_class,
                    "market": market,
                    "price_brl": current_price,
                    "quantity": qty or Decimal("0"),
                    "position_value": market_value,
                    "invested_cost": cost_val,
                }
            )

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

        # Aggregate FI per asset_id (one Tesouro asset can back multiple positions)
        fi_by_asset: dict[int, dict] = {}
        for fi_pos in fi_positions:
            asset = fi_pos.asset if hasattr(fi_pos, "asset") and fi_pos.asset else None
            asset_id = fi_pos.asset_id
            ticker = asset.ticker if asset else "RF"
            qty = fi_pos.quantity if fi_pos.quantity is not None else Decimal("1")
            price = (
                asset.current_price
                if asset and asset.current_price and fi_pos.quantity
                else (fi_pos.current_balance if not fi_pos.quantity else None)
            )
            entry = fi_by_asset.setdefault(
                asset_id,
                {
                    "asset_id": asset_id,
                    "ticker": ticker,
                    "asset_class": AssetClass.RF,
                    "market": Market.BR,
                    "price_brl": price,
                    "quantity": Decimal("0"),
                    "position_value": Decimal("0"),
                    "invested_cost": Decimal("0"),
                },
            )
            entry["quantity"] += qty
            entry["position_value"] += fi_pos.current_balance or Decimal("0")
            entry["invested_cost"] += fi_pos.applied_value or Decimal("0")
        per_asset_rows.extend(fi_by_asset.values())

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

        await self._persist_asset_snapshots(today, per_asset_rows)
        return snapshot

    async def _persist_asset_snapshots(
        self, target_date: date, rows: list[dict]
    ) -> None:
        """Replace per-asset snapshots for (user, date) with the supplied rows."""
        await self.db.execute(
            delete(AssetDailySnapshot).where(
                AssetDailySnapshot.user_id == self.user.id,
                AssetDailySnapshot.date == target_date,
            )
        )
        now = datetime.now(timezone.utc)
        for row in rows:
            self.db.add(
                AssetDailySnapshot(
                    user_id=self.user.id,
                    asset_id=row["asset_id"],
                    date=target_date,
                    price_brl=(
                        round(row["price_brl"], 4)
                        if row.get("price_brl") is not None
                        else None
                    ),
                    quantity=round(row["quantity"], 6),
                    position_value=round(row["position_value"], 4),
                    invested_cost=round(row["invested_cost"], 4),
                    asset_class=row.get("asset_class"),
                    market=row.get("market"),
                    ticker=row.get("ticker") or "",
                    snapshot_at=now,
                )
            )

    async def backfill_asset_snapshots(self, start_date: date, end_date: date) -> int:
        """Reconstruct per-asset daily snapshots between start_date and end_date.

        Pulls a single yfinance range per asset, then walks each day reconstructing
        quantity/invested_cost from purchases. RF positions use current_balance as a
        flat value (no reliable historical curve).

        Returns the number of (asset, date) rows written.
        """
        if start_date > end_date:
            return 0

        # All purchases for user, grouped per-asset
        purchases_result = await self.db.execute(
            select(Purchase, Asset)
            .join(Asset, Purchase.asset_id == Asset.id)
            .where(
                Purchase.user_id == self.user.id,
                Asset.type != AssetType.RF,
                Purchase.purchase_date <= end_date,
            )
        )
        purchases_by_asset: dict[int, list[Purchase]] = {}
        assets_by_id: dict[int, Asset] = {}
        for purchase, asset in purchases_result.all():
            purchases_by_asset.setdefault(asset.id, []).append(purchase)
            assets_by_id[asset.id] = asset

        import asyncio
        from app.services.price_service import (
            FX_TICKERS,
            PriceService,
            YF_BATCH_SIZE,
            YF_BATCH_SLEEP_SECONDS,
        )

        price_service = PriceService(self.db, self.user)

        def _extract_curve(data, yf_ticker: str) -> dict[date, Decimal]:
            curve: dict[date, Decimal] = {}
            if data is None or data.empty:
                return curve
            try:
                close_series = (
                    data["Close"][yf_ticker]
                    if hasattr(data["Close"], "columns")
                    else data["Close"]
                )
            except Exception:
                return curve
            for ts, val in close_series.items():
                try:
                    f = float(val)
                    if f > 0:
                        curve[ts.date()] = Decimal(str(round(f, 6)))
                except Exception:
                    continue
            return curve

        range_start = (start_date - timedelta(days=7)).isoformat()
        range_end = (end_date + timedelta(days=1)).isoformat()

        price_history: dict[int, dict[date, Decimal]] = {}
        asset_currency: dict[int, CurrencyCode] = {}
        crypto_assets: list[Asset] = []
        ticker_to_asset: dict[str, Asset] = {}
        for asset in assets_by_id.values():
            asset_class, _mk, currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            asset_currency[asset.id] = currency
            if asset_class == AssetClass.CRYPTO:
                crypto_assets.append(asset)
                continue
            ticker_to_asset[price_service._price_symbol_for(asset)] = asset

        # FX history — only fetch currencies needed by non-BRL assets in this backfill.
        fx_history: dict[CurrencyCode, dict[date, Decimal]] = {}
        fx_currencies = {
            currency
            for currency in asset_currency.values()
            if currency != CurrencyCode.BRL
        }
        fx_yf_tickers = [
            yf_ticker
            for currency, yf_ticker in FX_TICKERS.items()
            if currency in fx_currencies
        ]
        if fx_yf_tickers:
            data = await price_service._download_yf(
                fx_yf_tickers, start=range_start, end=range_end
            )
            for currency, yf_ticker in FX_TICKERS.items():
                if currency in fx_currencies:
                    fx_history[currency] = _extract_curve(data, yf_ticker)
            await asyncio.sleep(YF_BATCH_SLEEP_SECONDS)

        def fx_on(currency: CurrencyCode, day: date) -> Decimal | None:
            if currency == CurrencyCode.BRL:
                return Decimal("1")
            curve = fx_history.get(currency, {})
            for d in (day - timedelta(days=i) for i in range(8)):
                if d in curve:
                    return curve[d]
            return None

        # Crypto history comes from the price-history cache/CoinGecko path, not yfinance.
        for asset in crypto_assets:
            cached = await price_service.ensure_asset_price_history_range(
                asset, start_date, end_date, require_ohlc=False
            )
            price_history[asset.id] = {
                row.date: row.price_native for row in cached if row.price_native
            }

        # Asset price history — batch yfinance assets in groups of YF_BATCH_SIZE with sleeps.
        yf_tickers = list(ticker_to_asset.keys())
        for i in range(0, len(yf_tickers), YF_BATCH_SIZE):
            batch = yf_tickers[i : i + YF_BATCH_SIZE]
            data = await price_service._download_yf(
                batch, start=range_start, end=range_end
            )
            for yf_ticker in batch:
                asset = ticker_to_asset[yf_ticker]
                price_history[asset.id] = _extract_curve(data, yf_ticker)
            if i + YF_BATCH_SIZE < len(yf_tickers):
                await asyncio.sleep(YF_BATCH_SLEEP_SECONDS)

        def native_price_on(asset_id: int, day: date) -> Decimal | None:
            curve = price_history.get(asset_id, {})
            for d in (day - timedelta(days=i) for i in range(8)):
                if d in curve:
                    return curve[d]
            return None

        # Fixed income: aggregate per asset (use current_balance flat — no historical curve)
        fi_positions_result = await self.db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.user_id == self.user.id,
                FixedIncomePosition.start_date <= end_date,
            )
        )
        fi_positions = fi_positions_result.scalars().all()

        # Wipe existing rows in range to keep idempotent
        await self.db.execute(
            delete(AssetDailySnapshot).where(
                AssetDailySnapshot.user_id == self.user.id,
                AssetDailySnapshot.date >= start_date,
                AssetDailySnapshot.date <= end_date,
            )
        )

        rows_written = 0
        now = datetime.now(timezone.utc)
        day = start_date
        while day <= end_date:
            # Variable income: rebuild per-asset position from purchases up to `day`
            for asset_id, purchases in purchases_by_asset.items():
                qty = Decimal("0")
                cost = Decimal("0")
                for p in purchases:
                    if p.purchase_date <= day:
                        qty += p.quantity or Decimal("0")
                        cost += p.total_value or Decimal("0")
                if qty <= 0 and cost <= 0:
                    continue
                asset = assets_by_id[asset_id]
                _ac, _mk, currency = resolve_asset_metadata(
                    legacy_type=asset.type,
                    asset_class=asset.asset_class,
                    market=asset.market,
                    quote_currency=asset.quote_currency,
                )
                asset_class_v, market_v, _ = resolve_asset_metadata(
                    legacy_type=asset.type,
                    asset_class=asset.asset_class,
                    market=asset.market,
                    quote_currency=asset.quote_currency,
                )
                native = native_price_on(asset_id, day)
                fx = fx_on(currency, day)
                price_brl = round(native * fx, 4) if native and fx else None
                position_value = (
                    round(price_brl * qty, 4) if price_brl else Decimal("0")
                )
                self.db.add(
                    AssetDailySnapshot(
                        user_id=self.user.id,
                        asset_id=asset_id,
                        date=day,
                        price_brl=price_brl,
                        quantity=round(qty, 6),
                        position_value=position_value,
                        invested_cost=round(cost, 4),
                        asset_class=asset_class_v,
                        market=market_v,
                        ticker=asset.ticker,
                        snapshot_at=now,
                    )
                )
                rows_written += 1

            # Fixed income (use current_balance and applied_value as proxy — flat across range)
            fi_by_asset_day: dict[int, dict] = {}
            for fi_pos in fi_positions:
                if fi_pos.start_date > day:
                    continue
                aid = fi_pos.asset_id
                asset = fi_pos.asset
                ticker = asset.ticker if asset else "RF"
                qty = fi_pos.quantity if fi_pos.quantity is not None else Decimal("1")
                entry = fi_by_asset_day.setdefault(
                    aid,
                    {
                        "ticker": ticker,
                        "quantity": Decimal("0"),
                        "position_value": Decimal("0"),
                        "invested_cost": Decimal("0"),
                    },
                )
                entry["quantity"] += qty
                entry["position_value"] += fi_pos.current_balance or Decimal("0")
                entry["invested_cost"] += fi_pos.applied_value or Decimal("0")
            for aid, entry in fi_by_asset_day.items():
                self.db.add(
                    AssetDailySnapshot(
                        user_id=self.user.id,
                        asset_id=aid,
                        date=day,
                        price_brl=None,
                        quantity=round(entry["quantity"], 6),
                        position_value=round(entry["position_value"], 4),
                        invested_cost=round(entry["invested_cost"], 4),
                        asset_class=AssetClass.RF,
                        market=Market.BR,
                        ticker=entry["ticker"],
                        snapshot_at=now,
                    )
                )
                rows_written += 1

            day += timedelta(days=1)

        return rows_written

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
