from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.asset_price_history import AssetPriceHistory
from app.models.purchase import Purchase
from app.models.purchase_price_anomaly_ignore import PurchasePriceAnomalyIgnore
from app.models.user import User
from app.schemas.portfolio import PurchasePriceAnomaly
from app.services.notification_producer_service import (
    notification_exists,
    notify_purchase_price_anomaly,
)

PRICE_ANOMALY_TOLERANCE_PCT = Decimal("0.02")


async def get_purchase_price_anomalies(
    db: AsyncSession,
    user: User,
    asset_ids: list[int],
    *,
    purchase_ids: list[int] | None = None,
) -> dict[int, list[PurchasePriceAnomaly]]:
    if not asset_ids and not purchase_ids:
        return {}

    filters = [
        Purchase.user_id == user.id,
        Purchase.quantity > 0,
        PurchasePriceAnomalyIgnore.id.is_(None),
        AssetPriceHistory.low_native.is_not(None),
        AssetPriceHistory.high_native.is_not(None),
    ]
    if asset_ids:
        filters.append(Purchase.asset_id.in_(asset_ids))
    if purchase_ids:
        filters.append(Purchase.id.in_(purchase_ids))

    result = await db.execute(
        select(Purchase, AssetPriceHistory)
        .join(
            AssetPriceHistory,
            (AssetPriceHistory.asset_id == Purchase.asset_id)
            & (AssetPriceHistory.date == Purchase.purchase_date),
        )
        .outerjoin(
            PurchasePriceAnomalyIgnore,
            PurchasePriceAnomalyIgnore.purchase_id == Purchase.id,
        )
        .where(*filters)
    )

    by_asset: dict[int, list[PurchasePriceAnomaly]] = {}
    for purchase, history in result.all():
        low = history.low_native
        high = history.high_native
        if low is None or high is None:
            continue
        lower_bound = low * (Decimal("1") - PRICE_ANOMALY_TOLERANCE_PCT)
        upper_bound = high * (Decimal("1") + PRICE_ANOMALY_TOLERANCE_PCT)
        if lower_bound <= purchase.unit_price_native <= upper_bound:
            continue
        by_asset.setdefault(purchase.asset_id, []).append(
            PurchasePriceAnomaly(
                purchase_id=purchase.id,
                purchase_date=purchase.purchase_date,
                unit_price_native=purchase.unit_price_native,
                low_native=low,
                high_native=high,
                tolerance_pct=PRICE_ANOMALY_TOLERANCE_PCT,
            )
        )
    return by_asset


async def scan_and_notify_purchase_price_anomalies(
    db: AsyncSession,
    user: User,
    *,
    purchase_ids: list[int] | None = None,
) -> int:
    asset_ids: list[int] = []
    if purchase_ids:
        result = await db.execute(
            select(Purchase.asset_id)
            .where(Purchase.user_id == user.id, Purchase.id.in_(purchase_ids))
            .distinct()
        )
        asset_ids = list(result.scalars().all())
    else:
        result = await db.execute(
            select(Purchase.asset_id).where(Purchase.user_id == user.id).distinct()
        )
        asset_ids = list(result.scalars().all())

    anomalies = await get_purchase_price_anomalies(
        db, user, asset_ids, purchase_ids=purchase_ids
    )
    if not anomalies:
        return 0

    asset_result = await db.execute(select(Asset).where(Asset.id.in_(anomalies.keys())))
    assets = {asset.id: asset for asset in asset_result.scalars().all()}
    created = 0
    for asset_id, items in anomalies.items():
        asset = assets.get(asset_id)
        if asset is None:
            continue
        for anomaly in items:
            dedupe_key = f"purchase_price_anomaly:{anomaly.purchase_id}"
            if await notification_exists(db, user_id=user.id, dedupe_key=dedupe_key):
                continue
            await notify_purchase_price_anomaly(
                db,
                user_id=user.id,
                purchase_id=anomaly.purchase_id,
                asset_id=asset_id,
                ticker=asset.ticker,
                purchase_date=anomaly.purchase_date,
                unit_price_native=anomaly.unit_price_native,
                low_native=anomaly.low_native,
                high_native=anomaly.high_native,
                tolerance_pct=anomaly.tolerance_pct,
            )
            created += 1
    return created
