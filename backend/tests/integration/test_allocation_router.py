from decimal import Decimal

import pytest

from app.models.allocation_target import AllocationTarget
from app.models.asset import AllocationBucket


pytestmark = pytest.mark.integration


async def test_get_empty(auth_client):
    r = await auth_client.get("/api/allocation-targets")
    assert r.status_code == 200
    assert r.json() == []


async def test_put_creates_targets(auth_client):
    r = await auth_client.put(
        "/api/allocation-targets",
        json={
            "targets": [
                {"allocation_bucket": "STOCK_BR", "target_pct": "0.5"},
                {"allocation_bucket": "FII", "target_pct": "0.5"},
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert {x["allocation_bucket"] for x in body} == {"STOCK_BR", "FII"}


async def test_put_invalid_sum_rejected(auth_client):
    r = await auth_client.put(
        "/api/allocation-targets",
        json={"targets": [{"allocation_bucket": "STOCK_BR", "target_pct": "0.7"}]},
    )
    assert r.status_code == 422


async def test_put_replaces_previous(auth_client, db, user):
    db.add(AllocationTarget(user_id=user.id, allocation_bucket=AllocationBucket.RF, target_pct=Decimal("1.0")))
    await db.commit()
    r = await auth_client.put(
        "/api/allocation-targets",
        json={"targets": [{"allocation_bucket": "STOCK_BR", "target_pct": "1.0"}]},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["allocation_bucket"] == "STOCK_BR"
