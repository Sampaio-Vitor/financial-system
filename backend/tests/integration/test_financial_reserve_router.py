from datetime import datetime
from decimal import Decimal

import pytest


pytestmark = pytest.mark.integration


async def test_create_and_list_history(auth_client):
    r = await auth_client.post(
        "/api/financial-reserves",
        json={"amount": "1000.00", "note": "first"},
    )
    assert r.status_code == 201
    history = await auth_client.get("/api/financial-reserves/history")
    assert len(history.json()) == 1


async def test_get_value_for_month_returns_latest(auth_client):
    await auth_client.post(
        "/api/financial-reserves",
        json={"amount": "100", "recorded_at": "2026-05-01T00:00:00"},
    )
    await auth_client.post(
        "/api/financial-reserves",
        json={"amount": "250", "recorded_at": "2026-05-15T00:00:00"},
    )
    r = await auth_client.get("/api/financial-reserves?month=2026-05")
    assert r.status_code == 200
    assert Decimal(r.json()["amount"]) == Decimal("250")


async def test_get_value_no_entries(auth_client):
    r = await auth_client.get("/api/financial-reserves?month=2026-05")
    assert r.status_code == 200
    assert r.json()["amount"] is None


async def test_get_value_invalid_month_format(auth_client):
    r = await auth_client.get("/api/financial-reserves?month=2026-5")
    assert r.status_code == 422


async def test_target_round_trip(auth_client):
    initial = await auth_client.get("/api/financial-reserves/target")
    assert initial.json()["target_amount"] is None
    upd = await auth_client.put(
        "/api/financial-reserves/target", json={"target_amount": "10000"}
    )
    assert upd.status_code == 200
    assert Decimal(upd.json()["target_amount"]) == Decimal("10000")
    again = await auth_client.put(
        "/api/financial-reserves/target", json={"target_amount": "12000"}
    )
    assert Decimal(again.json()["target_amount"]) == Decimal("12000")


async def test_update_entry(auth_client):
    created = await auth_client.post(
        "/api/financial-reserves", json={"amount": "1"}
    )
    eid = created.json()["id"]
    upd = await auth_client.put(
        f"/api/financial-reserves/{eid}", json={"amount": "999", "note": "x"}
    )
    assert upd.status_code == 200
    assert Decimal(upd.json()["amount"]) == Decimal("999")


async def test_update_entry_unknown(auth_client):
    r = await auth_client.put("/api/financial-reserves/9999", json={"amount": "1"})
    assert r.status_code == 404


async def test_delete_entry(auth_client):
    created = await auth_client.post(
        "/api/financial-reserves", json={"amount": "1"}
    )
    eid = created.json()["id"]
    r = await auth_client.delete(f"/api/financial-reserves/{eid}")
    assert r.status_code == 204


async def test_delete_entry_unknown(auth_client):
    r = await auth_client.delete("/api/financial-reserves/9999")
    assert r.status_code == 404
