from datetime import date
from decimal import Decimal

import pytest

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market
from app.models.asset_price_history import AssetPriceHistory
from tests.factories import link_user_asset, make_asset, make_purchase


pytestmark = pytest.mark.integration


async def test_positions_include_price_anomaly(auth_client, db, user):
    asset = await make_asset(
        db,
        ticker="AAPL",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    purchase = await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 10),
        quantity=Decimal("1"),
        unit_price=Decimal("220"),
        trade_currency="USD",
        fx_rate=Decimal("5"),
    )
    purchase.unit_price = Decimal("1100")
    purchase.total_value = Decimal("1100")
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="AAPL",
            date=date(2026, 1, 10),
            price_native=Decimal("214"),
            low_native=Decimal("210"),
            high_native=Decimal("215"),
            fx_rate_to_brl=Decimal("5"),
            price_brl=Decimal("1070"),
            low_brl=Decimal("1050"),
            high_brl=Decimal("1075"),
            quote_currency=CurrencyCode.USD,
        )
    )
    await db.commit()

    response = await auth_client.get("/api/portfolio/positions?asset_class=STOCK")

    assert response.status_code == 200
    position = response.json()["positions"][0]
    assert position["price_anomaly_count"] == 1
    anomaly = position["price_anomalies"][0]
    assert anomaly["purchase_id"] == purchase.id
    assert Decimal(anomaly["unit_price_native"]) == Decimal("220.0000")
    assert Decimal(anomaly["low_native"]) == Decimal("210.000000")
    assert Decimal(anomaly["high_native"]) == Decimal("215.000000")


async def test_positions_do_not_flag_within_tolerance(auth_client, db, user):
    asset = await make_asset(
        db,
        ticker="AAPL",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    purchase = await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 10),
        quantity=Decimal("1"),
        unit_price=Decimal("219"),
        trade_currency="USD",
        fx_rate=Decimal("5"),
    )
    purchase.unit_price = Decimal("1095")
    purchase.total_value = Decimal("1095")
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="AAPL",
            date=date(2026, 1, 10),
            price_native=Decimal("214"),
            low_native=Decimal("210"),
            high_native=Decimal("215"),
            fx_rate_to_brl=Decimal("5"),
            price_brl=Decimal("1070"),
            low_brl=Decimal("1050"),
            high_brl=Decimal("1075"),
            quote_currency=CurrencyCode.USD,
        )
    )
    await db.commit()

    response = await auth_client.get("/api/portfolio/positions?asset_class=STOCK")

    assert response.status_code == 200
    position = response.json()["positions"][0]
    assert position["price_anomaly_count"] == 0
    assert position["price_anomalies"] == []


async def test_ignore_price_anomaly_removes_it(auth_client, db, user):
    asset = await make_asset(db, ticker="ITUB4")
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    purchase = await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 10),
        quantity=Decimal("1"),
        unit_price=Decimal("50"),
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="ITUB4.SA",
            date=date(2026, 1, 10),
            price_native=Decimal("40"),
            low_native=Decimal("39"),
            high_native=Decimal("41"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("40"),
            low_brl=Decimal("39"),
            high_brl=Decimal("41"),
            quote_currency=CurrencyCode.BRL,
        )
    )
    await db.commit()

    ignore_response = await auth_client.post(
        f"/api/purchases/{purchase.id}/price-anomaly-ignore"
    )
    positions_response = await auth_client.get(
        "/api/portfolio/positions?asset_class=STOCK&market=BR"
    )

    assert ignore_response.status_code == 204
    position = positions_response.json()["positions"][0]
    assert position["price_anomaly_count"] == 0
    assert position["price_anomalies"] == []


async def test_fii_positions_include_price_anomaly(auth_client, db, user):
    asset = await make_asset(
        db,
        ticker="HGLG11",
        asset_type=AssetType.FII,
        asset_class=AssetClass.FII,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    purchase = await make_purchase(
        db,
        user_id=user.id,
        asset_id=asset.id,
        purchase_date=date(2026, 1, 10),
        quantity=Decimal("1"),
        unit_price=Decimal("130"),
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="HGLG11.SA",
            date=date(2026, 1, 10),
            price_native=Decimal("101"),
            low_native=Decimal("99"),
            high_native=Decimal("102"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("101"),
            low_brl=Decimal("99"),
            high_brl=Decimal("102"),
            quote_currency=CurrencyCode.BRL,
        )
    )
    await db.commit()

    response = await auth_client.get("/api/portfolio/FII")

    assert response.status_code == 200
    position = response.json()["positions"][0]
    assert position["ticker"] == "HGLG11"
    assert position["price_anomaly_count"] == 1
    assert position["price_anomalies"][0]["purchase_id"] == purchase.id
