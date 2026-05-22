from decimal import Decimal

import pytest

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market
from tests.factories import link_user_asset, make_asset, make_purchase


pytestmark = pytest.mark.integration


async def test_list_empty(auth_client):
    r = await auth_client.get("/api/assets")
    assert r.status_code == 200
    assert r.json() == []


async def test_list_returns_only_user_assets(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    b = await make_asset(db, ticker="PETR4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.get("/api/assets")
    body = r.json()
    tickers = {a["ticker"] for a in body}
    assert tickers == {"ITUB4"}
    _ = b  # unlinked: not visible


async def test_list_filter_by_type(auth_client, db, user):
    fii = await make_asset(db, ticker="MXRF11", asset_type=AssetType.FII)
    acao = await make_asset(db, ticker="ITUB4", asset_type=AssetType.ACAO)
    await link_user_asset(db, user_id=user.id, asset_id=fii.id)
    await link_user_asset(db, user_id=user.id, asset_id=acao.id)
    r = await auth_client.get("/api/assets?type=FII")
    assert {a["ticker"] for a in r.json()} == {"MXRF11"}


async def test_create_asset_admin_creates_global(admin_client, admin_user):
    r = await admin_client.post(
        "/api/assets",
        json={
            "ticker": "vale3",
            "asset_class": "STOCK",
            "market": "BR",
            "quote_currency": "BRL",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["ticker"] == "VALE3"
    assert body["paused"] is False


async def test_create_asset_non_admin_for_existing_global_links(auth_client, db, user):
    asset = await make_asset(db, ticker="ITUB4")
    r = await auth_client.post(
        "/api/assets",
        json={
            "ticker": "ITUB4",
            "asset_class": "STOCK",
            "market": "BR",
            "quote_currency": "BRL",
        },
    )
    assert r.status_code == 201
    assert r.json()["id"] == asset.id


async def test_create_asset_non_admin_new_global_forbidden(auth_client):
    r = await auth_client.post(
        "/api/assets",
        json={
            "ticker": "BRANDNEW",
            "asset_class": "STOCK",
            "market": "US",
            "quote_currency": "USD",
        },
    )
    assert r.status_code == 403


async def test_create_asset_duplicate_link(auth_client, db, user):
    asset = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    r = await auth_client.post(
        "/api/assets",
        json={
            "ticker": "ITUB4",
            "asset_class": "STOCK",
            "market": "BR",
            "quote_currency": "BRL",
        },
    )
    assert r.status_code == 409


async def test_create_asset_invalid_shape(auth_client):
    r = await auth_client.post(
        "/api/assets",
        json={
            "ticker": "X",
            "asset_class": "FII",
            "market": "US",
            "quote_currency": "USD",
        },
    )
    assert r.status_code == 422


async def test_get_asset(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.get(f"/api/assets/{a.id}")
    assert r.status_code == 200
    assert r.json()["ticker"] == "ITUB4"


async def test_get_asset_unknown(auth_client):
    r = await auth_client.get("/api/assets/9999")
    assert r.status_code == 404


async def test_update_asset_pause_user_field(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.put(f"/api/assets/{a.id}", json={"paused": True})
    assert r.status_code == 200
    assert r.json()["paused"] is True


async def test_update_asset_target_pct_within_bucket(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.put(f"/api/assets/{a.id}", json={"target_pct": "0.5"})
    assert r.status_code == 200
    assert Decimal(r.json()["target_pct"]) == Decimal("0.5")


async def test_update_asset_target_pct_overflow_bucket(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    b = await make_asset(db, ticker="PETR4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id, target_pct=Decimal("0.7"))
    await link_user_asset(db, user_id=user.id, asset_id=b.id)
    r = await auth_client.put(f"/api/assets/{b.id}", json={"target_pct": "0.5"})
    assert r.status_code == 400


async def test_update_asset_global_field_forbidden_for_non_admin(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.put(f"/api/assets/{a.id}", json={"description": "newdesc"})
    assert r.status_code == 403


async def test_update_asset_global_field_admin(admin_client, db, admin_user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=admin_user.id, asset_id=a.id)
    r = await admin_client.put(f"/api/assets/{a.id}", json={"description": "desc!"})
    assert r.status_code == 200
    assert r.json()["description"] == "desc!"


async def test_delete_asset_removes_link(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    r = await auth_client.delete(f"/api/assets/{a.id}")
    assert r.status_code == 204
    listed = await auth_client.get("/api/assets")
    assert listed.json() == []


async def test_delete_asset_with_position_blocks(auth_client, db, user):
    a = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("10"))
    r = await auth_client.delete(f"/api/assets/{a.id}")
    assert r.status_code == 409


async def test_delete_asset_with_zero_net_position_removes_link(auth_client, db, user):
    a = await make_asset(db, ticker="VEEV")
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("1"))
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("-1"))

    r = await auth_client.delete(f"/api/assets/{a.id}")

    assert r.status_code == 204
    listed = await auth_client.get("/api/assets")
    assert listed.json() == []


async def test_delete_asset_unknown(auth_client):
    r = await auth_client.delete("/api/assets/9999")
    assert r.status_code == 404


async def test_bulk_create_admin_creates_new(admin_client):
    r = await admin_client.post(
        "/api/assets/bulk",
        json={
            "assets": [
                {"ticker": "abc", "asset_class": "STOCK", "market": "US", "quote_currency": "USD"},
                {"ticker": "abc", "asset_class": "STOCK", "market": "US", "quote_currency": "USD"},  # dup
            ]
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["created"]) == 1
    assert len(body["skipped"]) == 1


async def test_bulk_create_non_admin_skips_unknown(auth_client):
    r = await auth_client.post(
        "/api/assets/bulk",
        json={
            "assets": [
                {"ticker": "NEWBIE", "asset_class": "STOCK", "market": "US", "quote_currency": "USD"},
            ]
        },
    )
    assert r.status_code == 200
    assert len(r.json()["skipped"]) == 1


async def test_bulk_create_links_existing_global(auth_client, db):
    await make_asset(
        db,
        ticker="ITUB4",
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    r = await auth_client.post(
        "/api/assets/bulk",
        json={
            "assets": [
                {"ticker": "ITUB4", "asset_class": "STOCK", "market": "BR", "quote_currency": "BRL"},
            ]
        },
    )
    assert r.status_code == 200
    assert len(r.json()["linked"]) == 1


async def test_rebalancing_info_basic(auth_client, db, user):
    from app.models.allocation_target import AllocationTarget
    from app.models.asset import AllocationBucket

    a = await make_asset(db, ticker="ITUB4", current_price=Decimal("10"))
    await link_user_asset(db, user_id=user.id, asset_id=a.id)
    await make_purchase(db, user_id=user.id, asset_id=a.id, quantity=Decimal("5"), unit_price=Decimal("10"))
    db.add(AllocationTarget(user_id=user.id, allocation_bucket=AllocationBucket.STOCK_BR, target_pct=Decimal("1.0")))
    await db.commit()

    r = await auth_client.get("/api/assets/rebalancing-info")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["ticker"] == "ITUB4"
    assert Decimal(body[0]["current_value"]) == Decimal("50.00")
    assert Decimal(body[0]["target_value"]) == Decimal("50.00")
