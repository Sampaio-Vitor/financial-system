from decimal import Decimal

import pytest

from app.models.system_setting import SystemSetting


pytestmark = pytest.mark.integration


async def test_context_with_no_settings(auth_client):
    r = await auth_client.get("/api/prices/context")
    assert r.status_code == 200
    body = r.json()
    assert body["usd_brl_rate"] is None
    assert body["eur_brl_rate"] is None


async def test_context_with_rates(auth_client, db):
    db.add(SystemSetting(key="usd_brl_rate", value="5.10"))
    db.add(SystemSetting(key="eur_brl_rate", value="5.50"))
    db.add(SystemSetting(key="gbp_brl_rate", value="6.30"))
    await db.commit()
    r = await auth_client.get("/api/prices/context")
    body = r.json()
    assert body["usd_brl_rate"] == 5.10
    assert body["eur_brl_rate"] == 5.50
    assert body["gbp_brl_rate"] == 6.30


async def test_status_includes_next_run(auth_client):
    r = await auth_client.get("/api/prices/status")
    body = r.json()
    assert "next_run_utc" in body
    assert "last_run_utc" in body
    assert "last_run_status" in body


async def test_prices_require_auth(client):
    r = await client.get("/api/prices/context")
    assert r.status_code == 401
