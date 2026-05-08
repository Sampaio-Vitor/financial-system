from datetime import date
from decimal import Decimal

import pytest

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market
from tests.factories import link_user_asset, make_asset, make_purchase


pytestmark = pytest.mark.integration


async def test_list_empty(auth_client):
    r = await auth_client.get("/api/purchases")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_purchase_brl(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.post(
        "/api/purchases",
        json={
            "asset_id": a.id,
            "purchase_date": "2026-01-10",
            "quantity": "10",
            "unit_price": "30.00",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["trade_currency"] == "BRL"
    assert Decimal(body["total_value"]) == Decimal("300.0000")


async def test_create_purchase_unknown_asset(auth_client):
    r = await auth_client.post(
        "/api/purchases",
        json={
            "asset_id": 9999,
            "purchase_date": "2026-01-10",
            "quantity": "1",
            "unit_price": "10",
        },
    )
    assert r.status_code == 404


async def test_create_purchase_no_link_to_user(auth_client, db, user):
    a = await make_asset(db, ticker="X")
    r = await auth_client.post(
        "/api/purchases",
        json={"asset_id": a.id, "purchase_date": "2026-01-10", "quantity": "1", "unit_price": "10"},
    )
    assert r.status_code == 400


async def test_create_purchase_us_with_fx(auth_client, db, user):
    a = await make_asset(
        db,
        ticker="AAPL",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.post(
        "/api/purchases",
        json={
            "asset_id": a.id,
            "purchase_date": "2026-01-10",
            "quantity": "2",
            "unit_price_native": "100.00",
            "trade_currency": "USD",
            "fx_rate": "5.00",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert Decimal(body["unit_price"]) == Decimal("500.0000")
    assert Decimal(body["total_value"]) == Decimal("1000.0000")


async def test_create_purchase_currency_mismatch(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.post(
        "/api/purchases",
        json={
            "asset_id": a.id,
            "purchase_date": "2026-01-10",
            "quantity": "1",
            "unit_price_native": "10",
            "trade_currency": "USD",
            "fx_rate": "5",
        },
    )
    assert r.status_code == 400


async def test_create_purchase_sale_exceeds_position(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("3"), unit_price=Decimal("10"))
    r = await auth_client.post(
        "/api/purchases",
        json={
            "asset_id": a.id,
            "purchase_date": "2026-01-10",
            "quantity": "-5",
            "unit_price": "10",
        },
    )
    assert r.status_code == 400


async def test_update_purchase(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    p = await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("5"), unit_price=Decimal("10"))
    r = await auth_client.put(f"/api/purchases/{p.id}", json={"quantity": "10"})
    assert r.status_code == 200
    assert Decimal(r.json()["quantity"]) == Decimal("10")
    assert Decimal(r.json()["total_value"]) == Decimal("100")


async def test_update_purchase_unknown(auth_client):
    r = await auth_client.put("/api/purchases/9999", json={"quantity": "1"})
    assert r.status_code == 404


async def test_delete_purchase(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    p = await make_purchase(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.delete(f"/api/purchases/{p.id}")
    assert r.status_code == 204
    listed = await auth_client.get("/api/purchases")
    assert listed.json() == []


async def test_delete_purchase_unknown(auth_client):
    r = await auth_client.delete("/api/purchases/9999")
    assert r.status_code == 404


async def test_list_purchases_filters(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    b = await make_asset(db, ticker="PETR4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await link_user_asset(db, user_id=user.id, asset_id=b.id)
    await make_purchase(db, user_id=user.id, asset_id=a.id, purchase_date=date(2026, 1, 1))
    await make_purchase(db, user_id=user.id, asset_id=b.id, purchase_date=date(2026, 5, 1))

    r1 = await auth_client.get(f"/api/purchases?asset_id={a.id}")
    assert {p["asset_id"] for p in r1.json()} == {a.id}

    r2 = await auth_client.get("/api/purchases?date_from=2026-04-01")
    assert len(r2.json()) == 1
    assert r2.json()[0]["asset_id"] == b.id


async def test_list_rv_paginated(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    for i in range(3):
        await make_purchase(
            db, user_id=user.id, asset_id=a.id,
            purchase_date=date(2026, 1, i + 1), quantity=Decimal("1"),
        )
    r = await auth_client.get("/api/purchases/rv?page=1&page_size=2")
    body = r.json()
    assert body["total_count"] == 3
    assert body["total_pages"] == 2
    assert len(body["items"]) == 2


async def test_list_rv_rejects_rf(auth_client):
    r = await auth_client.get("/api/purchases/rv?asset_type=RF")
    assert r.status_code == 400
