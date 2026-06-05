from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.asset import AssetType, CurrencyCode
from app.models.asset_daily_snapshot import AssetDailySnapshot
from app.models.asset_price_history import AssetPriceHistory
from app.services.investidor10_dividend_service import Investidor10DividendService
from app.services.snapshot_service import SnapshotService
from tests.factories import link_user_asset, make_asset, make_purchase


pytestmark = pytest.mark.integration


async def _add_btc_price_history(db, *, asset_id: int) -> None:
    now = datetime.now(timezone.utc)
    for quote_date, price in (
        (date(2026, 6, 1), Decimal("300000")),
        (date(2026, 6, 2), Decimal("320000")),
    ):
        db.add(
            AssetPriceHistory(
                asset_id=asset_id,
                yf_ticker="bitcoin",
                date=quote_date,
                price_native=price,
                fx_rate_to_brl=Decimal("1"),
                price_brl=price,
                quote_currency=CurrencyCode.BRL,
                source="coingecko",
                created_at=now,
                updated_at=now,
            )
        )
    await db.commit()


async def test_crypto_backfill_uses_cached_history_and_movers_can_filter_crypto(
    auth_client,
    db,
    user,
):
    btc = await make_asset(
        db,
        ticker="BTC",
        asset_type=AssetType.CRYPTO,
        current_price=Decimal("320000"),
        price_symbol="bitcoin",
    )
    await link_user_asset(db, user_id=user.id, asset_id=btc.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=btc.id,
        purchase_date=date(2026, 6, 1),
        quantity=Decimal("0.001"),
        unit_price=Decimal("300000"),
    )
    await _add_btc_price_history(db, asset_id=btc.id)

    rows_written = await SnapshotService(db, user).backfill_asset_snapshots(
        date(2026, 6, 1), date(2026, 6, 2)
    )
    await db.commit()

    assert rows_written == 2
    result = await db.execute(
        select(AssetDailySnapshot)
        .where(AssetDailySnapshot.asset_id == btc.id)
        .order_by(AssetDailySnapshot.date)
    )
    snapshots = result.scalars().all()
    assert [snapshot.date for snapshot in snapshots] == [
        date(2026, 6, 1),
        date(2026, 6, 2),
    ]
    assert [snapshot.asset_class.value for snapshot in snapshots] == [
        "CRYPTO",
        "CRYPTO",
    ]
    assert [snapshot.market.value for snapshot in snapshots] == [
        "CRYPTO",
        "CRYPTO",
    ]
    assert [snapshot.position_value for snapshot in snapshots] == [
        Decimal("300.0000"),
        Decimal("320.0000"),
    ]

    movers = await auth_client.get(
        "/api/snapshots/movers?period=day&asset_class=CRYPTO&market=CRYPTO"
    )

    assert movers.status_code == 200
    body = movers.json()
    assert body["winners"][0]["ticker"] == "BTC"
    assert body["winners"][0]["asset_class"] == "CRYPTO"
    assert body["winners"][0]["market"] == "CRYPTO"
    assert Decimal(str(body["winners"][0]["pnl_period_brl"])) == Decimal("20.0")


async def test_investidor10_eligibility_ignores_crypto(db, user):
    btc = await make_asset(
        db,
        ticker="BTC",
        asset_type=AssetType.CRYPTO,
        current_price=Decimal("320000"),
        price_symbol="bitcoin",
    )
    await link_user_asset(db, user_id=user.id, asset_id=btc.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=btc.id,
        purchase_date=date(2026, 6, 1),
        quantity=Decimal("0.001"),
        unit_price=Decimal("300000"),
    )

    assets = await Investidor10DividendService(
        db
    )._eligible_assets_with_current_position()

    assert assets == []
