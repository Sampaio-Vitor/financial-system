from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
import pytest
from freezegun import freeze_time

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market
from app.models.asset_price_history import AssetPriceHistory
from app.services.price_service import PriceService
from tests.factories import link_user_asset, make_asset


pytestmark = pytest.mark.integration


def _yf_frame(values: dict) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Close": list(values.values()),
            "Low": [v * 0.99 for v in values.values()],
            "High": [v * 1.01 for v in values.values()],
        },
        index=pd.to_datetime(list(values.keys())),
    )


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_asset_price_history_endpoint_uses_cache_shape(
    auth_client, db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="ITUB4",
        asset_type=AssetType.ACAO,
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)

    calls = []

    async def fake_download(self, tickers, **kwargs):
        calls.append((tickers, kwargs))
        assert tickers == "ITUB4.SA"
        return _yf_frame({today - timedelta(days=1): 30.0, today: 31.0})

    monkeypatch.setattr(PriceService, "_download_yf", fake_download)

    first = await auth_client.get(f"/api/assets/{asset.id}/price-history?days=1")
    second = await auth_client.get(f"/api/assets/{asset.id}/price-history?days=1")

    assert first.status_code == 200
    assert first.json() == [
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "price": 30.0,
            "price_native": 30.0,
        },
        {"date": today.isoformat(), "price": 31.0, "price_native": 31.0},
    ]
    assert second.status_code == 200
    assert second.json() == first.json()
    assert len(calls) == 1


async def test_asset_price_history_endpoint_requires_user_asset(auth_client):
    response = await auth_client.get("/api/assets/9999/price-history?days=1")

    assert response.status_code == 404


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_btc_price_history_includes_usd_reference(
    auth_client, db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="BTC",
        asset_type=AssetType.CRYPTO,
        asset_class=AssetClass.CRYPTO,
        market=Market.CRYPTO,
        quote_currency=CurrencyCode.BRL,
        price_symbol="bitcoin",
    )
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="bitcoin",
            date=today,
            price_native=Decimal("306092.123456"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("306092.1234"),
            quote_currency=CurrencyCode.BRL,
            source="coingecko",
        )
    )
    await db.commit()

    async def fake_fetch_usd(coingecko_id, start_date, end_date):
        assert coingecko_id == "bitcoin"
        assert start_date == today
        assert end_date == today
        return {today: Decimal("56321.123456")}

    monkeypatch.setattr(
        "app.services.price_service.fetch_historical_prices_usd", fake_fetch_usd
    )

    response = await auth_client.get(f"/api/assets/{asset.id}/price-history?days=0")

    assert response.status_code == 200
    assert response.json() == [
        {
            "date": today.isoformat(),
            "price": 306092.12,
            "price_native": 306092.1235,
            "price_usd": 56321.12,
        }
    ]
