from decimal import Decimal

import pytest

from app.models.allocation_target import AllocationTarget
from app.models.asset import AllocationBucket
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
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("1"), unit_price=Decimal("10"))
    db.add(AllocationTarget(user_id=user.id, allocation_bucket=AllocationBucket.STOCK_BR, target_pct=Decimal("1.0")))
    await db.commit()

    r = await auth_client.get("/api/rebalancing?contribution=500&top_n=5")
    assert r.status_code == 200
    body = r.json()
    assert len(body["asset_plan"]) == 1
    assert body["asset_plan"][0]["ticker"] == "ITUB4"
    # All contribution allocated to the only under-target asset.
    assert Decimal(body["asset_plan"][0]["amount_to_invest"]) == Decimal("500")
    assert Decimal(body["total_planned"]) == Decimal("500")


async def test_rebalancing_requires_auth(client):
    r = await client.get("/api/rebalancing?contribution=1000")
    assert r.status_code == 401
