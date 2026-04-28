import random
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from typing import Optional

from app.constants import ALLOCATION_BUCKET_LABELS
from app.models.allocation_target import AllocationTarget
from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetClass,
    CurrencyCode,
    Market,
    asset_bucket_for,
    resolve_asset_metadata,
)
from app.models.financial_reserve import FinancialReserveTarget
from app.models.purchase import Purchase
from app.models.user import User
from app.models.user_asset import UserAsset
from app.schemas.rebalancing import (
    AssetRebalancing,
    ClassRebalancing,
    RebalancingResponse,
)
from app.services.portfolio_service import get_bucket_values, get_reserve_for_month


AssetCandidate = tuple[
    str,
    AssetClass,
    Market,
    CurrencyCode,
    AllocationBucket,
    Decimal,
    Optional[Decimal],
]


class RebalancingService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def calculate(self, contribution: Decimal, top_n: int) -> RebalancingResponse:
        bucket_values = await get_bucket_values(self.db, self.user)
        investable_total = sum(bucket_values.values())

        reserva_valor = await self._get_reserve_value()
        reserva_target = await self._get_reserve_target()
        reserva_gap = (reserva_target - reserva_valor) if reserva_target else None

        patrimonio_atual = investable_total + reserva_valor

        reserve_allocation = Decimal("0")
        if reserva_gap and reserva_gap > 0:
            reserve_allocation = min(reserva_gap, contribution)
        remaining_contribution = contribution - reserve_allocation

        patrimonio_pos_aporte = patrimonio_atual + contribution
        investable_pos_aporte = investable_total + remaining_contribution

        targets = await self._get_targets()
        fx_rates: dict[CurrencyCode, Decimal] = {}
        for currency in CurrencyCode:
            rate = await self._get_fx_rate(currency)
            if rate:
                fx_rates[currency] = rate

        class_breakdown: list[ClassRebalancing] = []
        class_gaps: dict[AllocationBucket, Decimal] = {}

        for allocation_bucket in AllocationBucket:
            target_pct = targets.get(allocation_bucket, Decimal("0"))
            target_value = investable_pos_aporte * target_pct
            current_value = bucket_values[allocation_bucket]
            current_pct = (current_value / investable_total) if investable_total else Decimal("0")
            gap = target_value - current_value
            gap_pct = (gap / target_value) if target_value else Decimal("0")
            class_gaps[allocation_bucket] = gap

            if gap > 0:
                status = "APORTAR"
            elif current_value == 0 and target_value == 0:
                status = "—"
            else:
                status = "ACIMA DO ALVO"

            class_breakdown.append(
                ClassRebalancing(
                    allocation_bucket=allocation_bucket,
                    label=ALLOCATION_BUCKET_LABELS[allocation_bucket],
                    target_pct=round(target_pct * 100, 2),
                    current_pct=round(current_pct * 100, 2),
                    current_value=round(current_value, 2),
                    target_value=round(target_value, 2),
                    gap=round(gap, 2),
                    gap_pct=round(gap_pct * 100, 2),
                    status=status,
                )
            )

        candidates_by_bucket: dict[AllocationBucket, list[tuple[AssetCandidate, Decimal, Decimal, Decimal]]] = {}
        candidate_buckets = (
            AllocationBucket.STOCK_BR,
            AllocationBucket.STOCK_US,
            AllocationBucket.ETF_INTL,
            AllocationBucket.FII,
        )
        for allocation_bucket in candidate_buckets:
            assets_in_bucket = await self._get_assets_with_values(allocation_bucket)
            if not assets_in_bucket:
                continue

            bucket_target_value = investable_pos_aporte * targets.get(allocation_bucket, Decimal("0"))

            explicit = [c for c in assets_in_bucket if c[6] is not None]
            implicit = [c for c in assets_in_bucket if c[6] is None]
            sum_explicit = sum((c[6] for c in explicit), Decimal("0"))
            leftover_pct = max(Decimal("0"), Decimal("1") - sum_explicit)
            per_implicit_value = (
                bucket_target_value * leftover_pct / len(implicit)
                if implicit
                else Decimal("0")
            )

            bucket_candidates: list[tuple[AssetCandidate, Decimal, Decimal, Decimal]] = []
            for candidate in assets_in_bucket:
                current_val = candidate[5]
                asset_target_pct = candidate[6]
                if asset_target_pct is not None:
                    target_value = bucket_target_value * asset_target_pct
                else:
                    target_value = per_implicit_value
                gap = target_value - current_val
                gap_pct = (gap / target_value * 100) if target_value else Decimal("0")
                if gap > 0:
                    bucket_candidates.append((candidate, current_val, target_value, gap_pct))

            if bucket_candidates:
                random.shuffle(bucket_candidates)
                bucket_candidates.sort(key=lambda item: item[2] - item[1], reverse=True)
                candidates_by_bucket[allocation_bucket] = bucket_candidates

        bucket_order = sorted(
            candidates_by_bucket.keys(),
            key=lambda bucket: class_gaps.get(bucket, Decimal("0")),
            reverse=True,
        )
        top_assets: list[tuple[AssetCandidate, Decimal, Decimal, Decimal]] = []
        bucket_idx = {bucket: 0 for bucket in bucket_order}
        while len(top_assets) < top_n and bucket_order:
            picked_this_round = False
            for bucket in list(bucket_order):
                if len(top_assets) >= top_n:
                    break
                idx = bucket_idx[bucket]
                if idx < len(candidates_by_bucket[bucket]):
                    top_assets.append(candidates_by_bucket[bucket][idx])
                    bucket_idx[bucket] = idx + 1
                    picked_this_round = True
                else:
                    bucket_order.remove(bucket)
            if not picked_this_round:
                break

        asset_plan: list[AssetRebalancing] = []
        total_gap_top = sum(target_val - current_val for _candidate, current_val, target_val, _gap_pct in top_assets)
        if top_assets and total_gap_top > 0:
            for candidate, current_val, target_val, gap_pct in top_assets:
                ticker, asset_class, market, quote_currency, allocation_bucket, _current_value, _target_pct = candidate
                gap = target_val - current_val
                amount = remaining_contribution * gap / total_gap_top
                amount_native = None
                amount_usd = None
                if quote_currency != CurrencyCode.BRL:
                    fx_rate = fx_rates.get(quote_currency)
                    if fx_rate:
                        amount_native = amount / fx_rate
                        if quote_currency == CurrencyCode.USD:
                            amount_usd = amount_native

                asset_plan.append(
                    AssetRebalancing(
                        ticker=ticker,
                        asset_class=asset_class,
                        market=market,
                        quote_currency=quote_currency,
                        allocation_bucket=allocation_bucket,
                        current_value=round(current_val, 2),
                        target_value=round(target_val, 2),
                        gap=round(gap, 2),
                        gap_pct=round(gap_pct, 2),
                        amount_to_invest=round(amount, 2),
                        amount_to_invest_usd=round(amount_usd, 2) if amount_usd else None,
                        amount_to_invest_native=round(amount_native, 2) if amount_native else None,
                    )
                )

        total_planned = sum(a.amount_to_invest for a in asset_plan)

        expected_total = reserve_allocation + remaining_contribution
        rounding_diff = expected_total - (reserve_allocation + total_planned)
        if asset_plan and rounding_diff != 0:
            largest = max(asset_plan, key=lambda a: a.amount_to_invest)
            largest.amount_to_invest += rounding_diff
            if largest.amount_to_invest_native is not None and largest.quote_currency != CurrencyCode.BRL:
                fx_rate = fx_rates.get(largest.quote_currency)
                if fx_rate:
                    largest.amount_to_invest_native = round(largest.amount_to_invest / fx_rate, 2)
                    if largest.quote_currency == CurrencyCode.USD:
                        largest.amount_to_invest_usd = largest.amount_to_invest_native
            total_planned = sum(a.amount_to_invest for a in asset_plan)

        return RebalancingResponse(
            contribution=contribution,
            patrimonio_atual=round(patrimonio_atual, 2),
            patrimonio_pos_aporte=round(patrimonio_pos_aporte, 2),
            reserva_valor=round(reserva_valor, 2),
            reserva_target=round(reserva_target, 2) if reserva_target else None,
            reserva_gap=round(reserva_gap, 2) if reserva_gap else None,
            class_breakdown=class_breakdown,
            asset_plan=asset_plan,
            total_planned=round(total_planned, 2),
        )

    async def _get_reserve_value(self) -> Decimal:
        now = datetime.now(timezone.utc)
        entry = await get_reserve_for_month(self.db, self.user.id, now.year, now.month)
        return entry.amount if entry else Decimal("0")

    async def _get_reserve_target(self) -> Decimal | None:
        result = await self.db.execute(
            select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == self.user.id)
        )
        target = result.scalar_one_or_none()
        return target.target_amount if target else None

    async def _get_targets(self) -> dict[AllocationBucket, Decimal]:
        result = await self.db.execute(
            select(AllocationTarget).where(AllocationTarget.user_id == self.user.id)
        )
        return {t.allocation_bucket: t.target_pct for t in result.scalars().all()}

    async def _get_fx_rate(self, currency: CurrencyCode) -> Decimal | None:
        if currency == CurrencyCode.BRL:
            return Decimal("1")
        from app.services.price_service import _get_system_setting

        val = await _get_system_setting(self.db, f"{currency.value.lower()}_brl_rate")
        return Decimal(val) if val else None

    async def _get_assets_with_values(
        self,
        allocation_bucket: AllocationBucket,
    ) -> list[AssetCandidate]:
        all_assets = await self.db.execute(
            select(Asset, UserAsset.target_pct)
            .join(UserAsset, UserAsset.asset_id == Asset.id)
            .where(
                UserAsset.user_id == self.user.id,
                UserAsset.paused == False,
            )
        )
        result_map: dict[str, AssetCandidate] = {}
        target_pct_by_ticker: dict[str, Optional[Decimal]] = {}
        for asset, ua_target_pct in all_assets.all():
            asset_class, market, quote_currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            bucket = asset_bucket_for(asset_class, market)
            if bucket != allocation_bucket:
                continue
            target_pct_by_ticker[asset.ticker] = ua_target_pct
            result_map[asset.ticker] = (
                asset.ticker,
                asset_class,
                market,
                quote_currency,
                bucket,
                Decimal("0"),
                ua_target_pct,
            )

        positions = await self.db.execute(
            select(
                Asset.ticker,
                Asset.type,
                Asset.asset_class,
                Asset.market,
                Asset.quote_currency,
                Asset.current_price,
                func.sum(Purchase.quantity).label("qty"),
            )
            .join(Asset, Purchase.asset_id == Asset.id)
            .join(UserAsset, UserAsset.asset_id == Asset.id)
            .where(
                Purchase.user_id == self.user.id,
                UserAsset.user_id == self.user.id,
                UserAsset.paused == False,
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
        for ticker, legacy_type, asset_class, market, quote_currency, price, qty in positions.all():
            if not price or not qty:
                continue
            resolved_class, resolved_market, resolved_currency = resolve_asset_metadata(
                legacy_type=legacy_type,
                asset_class=asset_class,
                market=market,
                quote_currency=quote_currency,
            )
            bucket = asset_bucket_for(resolved_class, resolved_market)
            if bucket != allocation_bucket:
                continue
            result_map[ticker] = (
                ticker,
                resolved_class,
                resolved_market,
                resolved_currency,
                bucket,
                price * qty,
                target_pct_by_ticker.get(ticker),
            )

        return list(result_map.values())
