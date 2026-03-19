from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.financial_reserve import FinancialReserveEntry, FinancialReserveTarget
from app.models.allocation_target import AllocationTarget
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.rebalancing import RebalancingResponse, ClassRebalancing, AssetRebalancing

CLASS_LABELS = {
    AssetType.STOCK: "Stocks (EUA)",
    AssetType.ACAO: "Acoes (Brasil)",
    AssetType.FII: "FIIs",
    AssetType.RF: "Renda Fixa",
}


class RebalancingService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def calculate(self, contribution: Decimal, top_n: int) -> RebalancingResponse:
        # Get current values per class (investments only)
        class_values = await self._get_class_values()
        investable_total = sum(class_values.values())

        # Financial reserve
        reserva_valor = await self._get_reserve_value()
        reserva_target = await self._get_reserve_target()
        reserva_gap = (reserva_target - reserva_valor) if reserva_target else None

        # Patrimonio includes reserve
        patrimonio_atual = investable_total + reserva_valor

        # Reserve is top priority: fill reserve gap first
        reserve_allocation = Decimal("0")
        if reserva_gap and reserva_gap > 0:
            reserve_allocation = min(reserva_gap, contribution)
        remaining_contribution = contribution - reserve_allocation

        patrimonio_pos_aporte = patrimonio_atual + contribution

        # Investable portion after contribution (excluding reserve)
        investable_pos_aporte = investable_total + remaining_contribution

        # Get targets
        targets = await self._get_targets()

        # Get USD/BRL rate
        usd_brl = await self._get_usd_brl()

        # Calculate class-level gaps (targets apply to investable portion)
        class_breakdown = []
        class_gaps: dict[AssetType, Decimal] = {}

        for asset_class in AssetType:
            target_pct = targets.get(asset_class, Decimal("0"))
            target_value = investable_pos_aporte * target_pct
            current_value = class_values[asset_class]
            current_pct = (current_value / investable_total) if investable_total else Decimal("0")
            gap = target_value - current_value
            gap_pct = (gap / target_value) if target_value else Decimal("0")
            class_gaps[asset_class] = gap

            status = "APORTAR" if gap > 0 else "ACIMA DO ALVO"

            class_breakdown.append(ClassRebalancing(
                asset_class=asset_class,
                label=CLASS_LABELS[asset_class],
                target_pct=round(target_pct * 100, 2),
                current_pct=round(current_pct * 100, 2),
                current_value=round(current_value, 2),
                target_value=round(target_value, 2),
                gap=round(gap, 2),
                gap_pct=round(gap_pct * 100, 2),
                status=status,
            ))

        # Distribute remaining contribution (after reserve) proportionally to positive gaps
        positive_gaps = {k: v for k, v in class_gaps.items() if v > 0}
        total_positive_gap = sum(positive_gaps.values())

        class_allocations: dict[AssetType, Decimal] = {}
        if total_positive_gap > 0:
            for asset_class, gap in positive_gaps.items():
                class_allocations[asset_class] = remaining_contribution * gap / total_positive_gap

        # Get per-asset details for variable income classes
        asset_plan = []
        for asset_class in (AssetType.STOCK, AssetType.ACAO, AssetType.FII):
            if asset_class not in class_allocations:
                continue

            class_contribution = class_allocations[asset_class]
            assets_in_class = await self._get_assets_with_values(asset_class)

            if not assets_in_class:
                continue

            # Equal weight within class (matching spreadsheet approach)
            n_assets = len(assets_in_class)
            target_per_asset = investable_pos_aporte * targets.get(asset_class, Decimal("0")) / n_assets

            # Calculate per-asset gaps and sort by gap descending
            asset_gaps = []
            for ticker, current_val in assets_in_class.items():
                gap = target_per_asset - current_val
                gap_pct = (gap / target_per_asset * 100) if target_per_asset else Decimal("0")
                asset_gaps.append((ticker, current_val, target_per_asset, gap, gap_pct))

            asset_gaps.sort(key=lambda x: x[3], reverse=True)

            # Distribute class contribution among top N positive-gap assets
            positive_asset_gaps = [a for a in asset_gaps if a[3] > 0]
            top_assets = positive_asset_gaps[:top_n]

            if top_assets:
                total_gap_top = sum(a[3] for a in top_assets)
                for ticker, current_val, target_val, gap, gap_pct in top_assets:
                    # Proportional to gap
                    amount = class_contribution * gap / total_gap_top if total_gap_top else Decimal("0")
                    amount_usd = (amount / usd_brl) if usd_brl and asset_class == AssetType.STOCK else None

                    asset_plan.append(AssetRebalancing(
                        ticker=ticker,
                        asset_class=asset_class,
                        current_value=round(current_val, 2),
                        target_value=round(target_val, 2),
                        gap=round(gap, 2),
                        gap_pct=round(gap_pct, 2),
                        amount_to_invest=round(amount, 2),
                        amount_to_invest_usd=round(amount_usd, 2) if amount_usd else None,
                    ))

        # Sort asset plan by gap descending
        asset_plan.sort(key=lambda a: a.gap, reverse=True)
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

    async def _get_class_values(self) -> dict[AssetType, Decimal]:
        values: dict[AssetType, Decimal] = {t: Decimal("0") for t in AssetType}

        result = await self.db.execute(
            select(
                Asset.type,
                Asset.current_price,
                func.sum(Purchase.quantity).label("total_qty"),
            )
            .join(Asset, Purchase.asset_id == Asset.id)
            .where(Purchase.user_id == self.user.id, Asset.type != AssetType.RF)
            .group_by(Asset.id, Asset.type, Asset.current_price)
        )
        for row in result.all():
            asset_type, price, qty = row
            if price and qty:
                values[asset_type] += price * qty

        fi_result = await self.db.execute(
            select(func.sum(FixedIncomePosition.current_balance))
            .where(FixedIncomePosition.user_id == self.user.id)
        )
        values[AssetType.RF] = fi_result.scalar() or Decimal("0")

        return values

    async def _get_reserve_value(self) -> Decimal:
        result = await self.db.execute(
            select(FinancialReserveEntry)
            .where(FinancialReserveEntry.user_id == self.user.id)
            .order_by(FinancialReserveEntry.recorded_at.desc())
            .limit(1)
        )
        entry = result.scalar_one_or_none()
        return entry.amount if entry else Decimal("0")

    async def _get_reserve_target(self) -> Decimal | None:
        result = await self.db.execute(
            select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == self.user.id)
        )
        target = result.scalar_one_or_none()
        return target.target_amount if target else None

    async def _get_targets(self) -> dict[AssetType, Decimal]:
        result = await self.db.execute(
            select(AllocationTarget).where(AllocationTarget.user_id == self.user.id)
        )
        return {t.asset_class: t.target_pct for t in result.scalars().all()}

    async def _get_usd_brl(self) -> Decimal | None:
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == self.user.id)
        )
        s = result.scalar_one_or_none()
        return s.usd_brl_rate if s else None

    async def _get_assets_with_values(self, asset_class: AssetType) -> dict[str, Decimal]:
        """Get current market value for each asset in a class."""
        # All assets in this class (including those with no purchases)
        all_assets = await self.db.execute(
            select(Asset).where(Asset.type == asset_class)
        )
        result_map: dict[str, Decimal] = {}
        for asset in all_assets.scalars().all():
            result_map[asset.ticker] = Decimal("0")

        # Add values from purchases
        positions = await self.db.execute(
            select(
                Asset.ticker,
                Asset.current_price,
                func.sum(Purchase.quantity).label("qty"),
            )
            .join(Asset, Purchase.asset_id == Asset.id)
            .where(Purchase.user_id == self.user.id, Asset.type == asset_class)
            .group_by(Asset.id, Asset.ticker, Asset.current_price)
        )
        for ticker, price, qty in positions.all():
            if price and qty:
                result_map[ticker] = price * qty

        return result_map
