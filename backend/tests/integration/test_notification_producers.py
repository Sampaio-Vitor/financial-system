from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.asset import AllocationBucket, AssetType, CurrencyCode
from app.models.asset_price_history import AssetPriceHistory
from app.models.daily_snapshot import DailySnapshot
from app.models.fixed_income import FixedIncomePosition
from app.models.notification import Notification
from app.models.purchase_price_anomaly_ignore import PurchasePriceAnomalyIgnore
from app.models.retirement_goal import RetirementGoal
from app.notification_types import (
    ALLOCATION_DRIFT,
    FIXED_INCOME_MATURITY,
    PRICE_UPDATE_COMPLETED,
    PURCHASE_PRICE_ANOMALY,
    RETIREMENT_PROGRESS_MILESTONE,
)
from app.services.notification_producer_service import (
    notify_price_update_results_for_users,
    scan_allocation_drift,
    scan_fixed_income_maturities,
    scan_retirement_milestones,
)
from app.services.price_anomaly_service import scan_and_notify_purchase_price_anomalies
from tests.factories import (
    link_user_asset,
    make_allocation_target,
    make_asset,
    make_fi_position,
    make_purchase,
)


pytestmark = pytest.mark.integration


async def _notifications(db, user_id: int) -> list[Notification]:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.id.asc())
    )
    return list(result.scalars().all())


async def test_price_update_notification_includes_daily_patrimonio_variation(db, user):
    db.add_all(
        [
            DailySnapshot(
                user_id=user.id,
                date=date(2026, 5, 27),
                total_patrimonio=Decimal("1000"),
                total_invested=Decimal("900"),
                total_pnl=Decimal("100"),
                pnl_pct=Decimal("11.11"),
            ),
            DailySnapshot(
                user_id=user.id,
                date=date(2026, 5, 28),
                total_patrimonio=Decimal("1100"),
                total_invested=Decimal("900"),
                total_pnl=Decimal("200"),
                pnl_pct=Decimal("22.22"),
            ),
        ]
    )
    await db.commit()

    await notify_price_update_results_for_users(
        db,
        results={"updated": [{"ticker": "ITUB4"}], "failed": [], "status": "success"},
        users=[user],
        run_date=date(2026, 5, 28),
    )
    await db.commit()

    notification = (await _notifications(db, user.id))[0]
    assert notification.type == PRICE_UPDATE_COMPLETED
    assert "Patrimônio hoje: +R$ 100,00 (+10.00%)." in notification.message
    assert notification.notification_metadata["patrimonio_variation"] == "100.0000"


async def test_fixed_income_maturity_scan_dedupes(db, user):
    asset = await make_asset(db, asset_type=AssetType.RF, ticker="CDB")
    await make_fi_position(
        db,
        user_id=user.id,
        asset_id=asset.id,
        start_date=date(2026, 1, 1),
        description="CDB Test",
    )
    fi_result = await db.execute(select(FixedIncomePosition))
    fi = fi_result.scalar_one()
    fi.maturity_date = date(2026, 6, 27)
    await db.commit()

    assert await scan_fixed_income_maturities(db, today=date(2026, 5, 28)) == 1
    await db.commit()
    assert await scan_fixed_income_maturities(db, today=date(2026, 5, 28)) == 0
    await db.commit()

    notifications = await _notifications(db, user.id)
    assert len(notifications) == 1
    assert notifications[0].type == FIXED_INCOME_MATURITY


async def test_purchase_anomaly_scan_respects_ignore(db, user):
    asset = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    purchase = await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 5, 20),
        quantity=Decimal("1"),
        unit_price=Decimal("50"),
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="ITUB4.SA",
            date=date(2026, 5, 20),
            price_native=Decimal("40"),
            low_native=Decimal("39"),
            high_native=Decimal("41"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("40"),
            low_brl=Decimal("39"),
            high_brl=Decimal("41"),
            quote_currency=CurrencyCode.BRL,
        )
    )
    await db.commit()

    assert await scan_and_notify_purchase_price_anomalies(db, user) == 1
    await db.commit()
    assert (await _notifications(db, user.id))[0].type == PURCHASE_PRICE_ANOMALY

    db.add(PurchasePriceAnomalyIgnore(purchase_id=purchase.id, user_id=user.id))
    await db.commit()
    assert await scan_and_notify_purchase_price_anomalies(db, user) == 0


async def test_retirement_milestones_every_five_percent(db, user):
    asset = await make_asset(db, ticker="ITUB4", current_price=Decimal("100"))
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 1),
        quantity=Decimal("3"),
        unit_price=Decimal("100"),
    )
    db.add(
        RetirementGoal(
            user_id=user.id,
            patrimonio_meta=Decimal("1000"),
            taxa_retirada=Decimal("4"),
            rentabilidade_anual=Decimal("8"),
        )
    )
    await db.commit()

    await scan_retirement_milestones(db, user)
    await db.commit()

    notifications = await _notifications(db, user.id)
    milestones = [
        n.notification_metadata["milestone"]
        for n in notifications
        if n.type == RETIREMENT_PROGRESS_MILESTONE
    ]
    assert milestones == [5, 10, 15, 20, 25, 30]


async def test_allocation_drift_monthly_dedupe(db, user):
    asset = await make_asset(db, ticker="ITUB4", current_price=Decimal("100"))
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 1),
        quantity=Decimal("1"),
        unit_price=Decimal("100"),
    )
    await make_allocation_target(
        db,
        user_id=user.id,
        bucket=AllocationBucket.STOCK_BR,
        target_pct=Decimal("0.50"),
    )

    assert await scan_allocation_drift(db, user, today=date(2026, 5, 28)) == 1
    await db.commit()
    assert await scan_allocation_drift(db, user, today=date(2026, 5, 28)) == 0
    await db.commit()

    notifications = [
        n for n in await _notifications(db, user.id) if n.type == ALLOCATION_DRIFT
    ]
    assert len(notifications) == 1
    assert notifications[0].dedupe_key == "allocation_drift:STOCK_BR:2026-05"
