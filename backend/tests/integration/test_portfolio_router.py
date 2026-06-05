from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models.asset import AllocationBucket, AssetType
from tests.factories import (
    link_user_asset,
    make_allocation_target,
    make_asset,
    make_fi_position,
    make_purchase,
    make_reserve_entry,
)


pytestmark = pytest.mark.integration


def _decimal(value) -> Decimal:
    return Decimal(str(value))


async def test_overview_total_invested_includes_financial_reserve(
    auth_client, db, user
):
    stock = await make_asset(db, ticker="ITUB4", current_price=Decimal("25"))
    await link_user_asset(db, user_id=user.id, asset_id=stock.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=stock.id,
        purchase_date=date(2026, 5, 5),
        quantity=Decimal("10"),
        unit_price=Decimal("20"),
    )

    rf_asset = await make_asset(
        db,
        ticker="CDB",
        asset_type=AssetType.RF,
        current_price=None,
    )
    await link_user_asset(db, user_id=user.id, asset_id=rf_asset.id)
    await make_fi_position(
        db,
        user_id=user.id,
        asset_id=rf_asset.id,
        applied_value=Decimal("1000"),
        current_balance=Decimal("1100"),
        start_date=date(2026, 5, 1),
    )

    await make_reserve_entry(
        db,
        user_id=user.id,
        amount=Decimal("500"),
        recorded_at=datetime(2026, 5, 15),
    )

    response = await auth_client.get("/api/portfolio/overview?month=2026-05")

    assert response.status_code == 200
    body = response.json()
    assert _decimal(body["total_invested"]) == Decimal("1700.0000")
    assert _decimal(body["patrimonio_total"]) == Decimal("1850.0000")


async def test_crypto_positions_and_overview_use_crypto_bucket(auth_client, db, user):
    btc = await make_asset(
        db,
        ticker="BTC",
        asset_type=AssetType.CRYPTO,
        current_price=Decimal("320000"),
        price_symbol="bitcoin",
    )
    await link_user_asset(db, user_id=user.id, asset_id=btc.id)
    await make_allocation_target(
        db,
        user_id=user.id,
        bucket=AllocationBucket.CRYPTO,
        target_pct=Decimal("0.05"),
    )
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=btc.id,
        purchase_date=date(2026, 6, 1),
        quantity=Decimal("0.001"),
        unit_price=Decimal("300000"),
    )
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=btc.id,
        purchase_date=date(2026, 6, 2),
        quantity=Decimal("-0.00025"),
        unit_price=Decimal("320000"),
    )

    positions = await auth_client.get("/api/portfolio/positions?asset_class=CRYPTO")
    assert positions.status_code == 200
    positions_body = positions.json()
    assert positions_body["asset_class"] == "CRYPTO"
    assert positions_body["asset_class_v2"] == "CRYPTO"
    assert positions_body["allocation_bucket"] == "CRYPTO"
    assert Decimal(positions_body["total_market_value"]) == Decimal("240.00000000")

    position = positions_body["positions"][0]
    assert position["ticker"] == "BTC"
    assert position["type"] == "CRYPTO"
    assert position["asset_class"] == "CRYPTO"
    assert position["market"] == "CRYPTO"
    assert Decimal(position["quantity"]) == Decimal("0.00075000")

    overview = await auth_client.get("/api/portfolio/overview?month=2026-06")
    assert overview.status_code == 200
    overview_body = overview.json()
    assert Decimal(overview_body["patrimonio_total"]) == Decimal("240.0000")

    crypto_breakdown = next(
        item
        for item in overview_body["allocation_breakdown"]
        if item["allocation_bucket"] == "CRYPTO"
    )
    assert Decimal(crypto_breakdown["value"]) == Decimal("240.00000000")
    assert Decimal(crypto_breakdown["pct"]) == Decimal("100.00")
    assert Decimal(crypto_breakdown["target_pct"]) == Decimal("5.00")
