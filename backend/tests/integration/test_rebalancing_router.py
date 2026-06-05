from decimal import Decimal

import pytest

from app.models.allocation_target import AllocationTarget
from app.models.asset import AllocationBucket, AssetType
from tests.factories import link_user_asset, make_asset, make_purchase


pytestmark = pytest.mark.integration


async def test_rebalancing_empty_portfolio(auth_client):
    r = await auth_client.get("/api/rebalancing?contribution=1000")
    assert r.status_code == 200
    body = r.json()
    assert body["asset_plan"] == []
    assert Decimal(body["contribution"]) == Decimal("1000")


async def test_rebalancing_recommends_under_allocated(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4", current_price=Decimal("10"))
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=a.id,
        quantity=Decimal("1"),
        unit_price=Decimal("10"),
    )
    db.add(
        AllocationTarget(
            user_id=user.id,
            allocation_bucket=AllocationBucket.STOCK_BR,
            target_pct=Decimal("1.0"),
        )
    )
    await db.commit()

    r = await auth_client.get("/api/rebalancing?contribution=500&top_n=5")
    assert r.status_code == 200
    body = r.json()
    assert len(body["asset_plan"]) == 1
    assert body["asset_plan"][0]["ticker"] == "ITUB4"
    # All contribution allocated to the only under-target asset.
    assert Decimal(body["asset_plan"][0]["amount_to_invest"]) == Decimal("500")
    assert Decimal(body["total_planned"]) == Decimal("500")


async def test_rebalancing_recommends_under_allocated_crypto(auth_client, db, user):
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
        quantity=Decimal("0.001"),
        unit_price=Decimal("300000"),
    )
    db.add(
        AllocationTarget(
            user_id=user.id,
            allocation_bucket=AllocationBucket.CRYPTO,
            target_pct=Decimal("1.0"),
        )
    )
    await db.commit()

    r = await auth_client.get("/api/rebalancing?contribution=500&top_n=5")

    assert r.status_code == 200
    body = r.json()
    assert len(body["asset_plan"]) == 1
    plan = body["asset_plan"][0]
    assert plan["ticker"] == "BTC"
    assert plan["asset_class"] == "CRYPTO"
    assert plan["market"] == "CRYPTO"
    assert plan["quote_currency"] == "BRL"
    assert plan["allocation_bucket"] == "CRYPTO"
    assert Decimal(plan["amount_to_invest"]) == Decimal("500")


async def test_rebalancing_can_prioritize_individual_asset_before_class(
    auth_client,
    db,
    user,
):
    stock_under = await make_asset(db, ticker="PETR4", current_price=Decimal("10"))
    stock_over = await make_asset(db, ticker="ITUB4", current_price=Decimal("10"))
    fii = await make_asset(
        db,
        ticker="HGLG11",
        asset_type=AssetType.FII,
        current_price=Decimal("10"),
    )

    await link_user_asset(
        db,
        user_id=user.id,
        asset_id=stock_under.id,
        target_pct=Decimal("0.5"),
    )
    await link_user_asset(
        db,
        user_id=user.id,
        asset_id=stock_over.id,
        target_pct=Decimal("0.5"),
    )
    await link_user_asset(db, user_id=user.id, asset_id=fii.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=stock_over.id,
        quantity=Decimal("70"),
        unit_price=Decimal("10"),
    )
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=fii.id,
        quantity=Decimal("30"),
        unit_price=Decimal("10"),
    )
    db.add(
        AllocationTarget(
            user_id=user.id,
            allocation_bucket=AllocationBucket.STOCK_BR,
            target_pct=Decimal("0.5"),
        )
    )
    db.add(
        AllocationTarget(
            user_id=user.id,
            allocation_bucket=AllocationBucket.FII,
            target_pct=Decimal("0.5"),
        )
    )
    await db.commit()

    class_first = await auth_client.get(
        "/api/rebalancing?contribution=100&top_n=1&priority=class_first"
    )
    assert class_first.status_code == 200
    assert class_first.json()["asset_plan"][0]["ticker"] == "HGLG11"

    asset_first = await auth_client.get(
        "/api/rebalancing?contribution=100&top_n=1&priority=asset_first"
    )
    assert asset_first.status_code == 200
    assert asset_first.json()["asset_plan"][0]["ticker"] == "PETR4"


async def test_rebalancing_requires_auth(client):
    r = await client.get("/api/rebalancing?contribution=1000")
    assert r.status_code == 401
