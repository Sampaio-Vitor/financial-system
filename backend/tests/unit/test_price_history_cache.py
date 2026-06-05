from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market, TesouroKind
from app.models.asset_price_history import AssetPriceHistory
from app.models.system_setting import SystemSetting
from app.services.price_service import PriceService
from tests.factories import make_asset


pytestmark = pytest.mark.unit


def _yf_frame(values: dict, ticker: str | None = None) -> pd.DataFrame:
    index = pd.to_datetime(list(values.keys()))
    if ticker:
        columns = pd.MultiIndex.from_tuples(
            [("Close", ticker), ("Low", ticker), ("High", ticker)]
        )
        return pd.DataFrame(
            [[v, v * 0.99, v * 1.01] for v in values.values()],
            index=index,
            columns=columns,
        )
    return pd.DataFrame(
        {
            "Close": list(values.values()),
            "Low": [v * 0.99 for v in values.values()],
            "High": [v * 1.01 for v in values.values()],
        },
        index=index,
    )


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_price_history_cache_downloads_and_stores_first_request(
    db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="AAPL",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    db.add(SystemSetting(key="usd_brl_rate", value="5.0"))
    await db.commit()

    calls = []

    async def fake_download(self, tickers, **kwargs):
        calls.append((tickers, kwargs))
        if tickers == "AAPL":
            return _yf_frame(
                {
                    today - timedelta(days=1): 100.0,
                    today: 101.0,
                }
            )
        if tickers == "USDBRL=X":
            return _yf_frame(
                {
                    today - timedelta(days=1): 5.0,
                    today: 5.1,
                }
            )
        raise AssertionError(f"unexpected ticker {tickers}")

    monkeypatch.setattr(PriceService, "_download_yf", fake_download)

    points = await PriceService(db, user).get_asset_price_history(asset, days=2)

    assert points == [
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "price": 500.0,
            "price_native": 100.0,
        },
        {
            "date": today.isoformat(),
            "price": 515.1,
            "price_native": 101.0,
        },
    ]
    assert [call[0] for call in calls] == ["AAPL", "USDBRL=X"]

    rows = (
        (
            await db.execute(
                select(AssetPriceHistory).where(AssetPriceHistory.asset_id == asset.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert rows[0].quote_currency == CurrencyCode.USD
    assert rows[0].low_native is not None
    assert rows[0].high_native is not None


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_price_history_cache_second_request_uses_database(db, user, monkeypatch):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="ITUB4",
        asset_type=AssetType.ACAO,
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="ITUB4.SA",
            date=today,
            price_native=Decimal("32.123456"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("32.1234"),
            quote_currency=CurrencyCode.BRL,
        )
    )
    await db.commit()

    async def fail_download(self, tickers, **kwargs):
        raise AssertionError("yfinance should not be called")

    monkeypatch.setattr(PriceService, "_download_yf", fail_download)

    points = await PriceService(db, user).get_asset_price_history(asset, days=0)

    assert points == [
        {
            "date": today.isoformat(),
            "price": 32.12,
            "price_native": 32.1235,
        }
    ]


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_price_history_does_not_fetch_yfinance_for_tesouro_ticker(
    db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="TD-IPCA-2050",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="TD-IPCA-2050",
            date=today,
            price_native=Decimal("4123.456700"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("4123.4567"),
            quote_currency=CurrencyCode.BRL,
            source="tesouro",
        )
    )
    await db.commit()

    async def fail_download(self, tickers, **kwargs):
        raise AssertionError("tesouro history should not call yfinance")

    monkeypatch.setattr(PriceService, "_download_yf", fail_download)

    points = await PriceService(db, user).get_asset_price_history(asset, days=0)

    assert points == [
        {
            "date": today.isoformat(),
            "price": 4123.46,
            "price_native": 4123.4567,
        }
    ]


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_price_history_cache_fetches_trailing_missing_range(
    db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="VOO",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.ETF,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    db.add(SystemSetting(key="usd_brl_rate", value="5.0"))
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="VOO",
            date=today - timedelta(days=2),
            price_native=Decimal("400"),
            low_native=Decimal("396"),
            high_native=Decimal("404"),
            fx_rate_to_brl=Decimal("5"),
            price_brl=Decimal("2000"),
            low_brl=Decimal("1980"),
            high_brl=Decimal("2020"),
            quote_currency=CurrencyCode.USD,
        )
    )
    await db.commit()

    calls = []

    async def fake_download(self, tickers, **kwargs):
        calls.append((tickers, kwargs))
        assert kwargs["start"] == (today - timedelta(days=1)).isoformat()
        if tickers == "VOO":
            return _yf_frame({today - timedelta(days=1): 405.0})
        if tickers == "USDBRL=X":
            return _yf_frame({today - timedelta(days=1): 5.2})
        raise AssertionError(f"unexpected ticker {tickers}")

    monkeypatch.setattr(PriceService, "_download_yf", fake_download)

    points = await PriceService(db, user).get_asset_price_history(asset, days=2)

    assert points == [
        {
            "date": (today - timedelta(days=2)).isoformat(),
            "price": 2000.0,
            "price_native": 400.0,
        },
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "price": 2106.0,
            "price_native": 405.0,
        },
    ]
    assert [call[0] for call in calls] == ["VOO", "USDBRL=X"]


@freeze_time("2026-05-29 12:00:00+00:00")
async def test_price_history_cache_does_not_refetch_missing_current_day(
    db, user, monkeypatch
):
    today = datetime.now(timezone.utc).date()
    asset = await make_asset(
        db,
        ticker="ITUB3",
        asset_type=AssetType.ACAO,
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    db.add(
        AssetPriceHistory(
            asset_id=asset.id,
            yf_ticker="ITUB3.SA",
            date=today - timedelta(days=1),
            price_native=Decimal("31.500000"),
            fx_rate_to_brl=Decimal("1"),
            price_brl=Decimal("31.5000"),
            quote_currency=CurrencyCode.BRL,
        )
    )
    await db.commit()

    async def fail_download(self, tickers, **kwargs):
        raise AssertionError("missing current day should not trigger yfinance")

    monkeypatch.setattr(PriceService, "_download_yf", fail_download)

    points = await PriceService(db, user).get_asset_price_history(asset, days=1)

    assert points == [
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "price": 31.5,
            "price_native": 31.5,
        }
    ]


async def test_update_all_prices_skips_non_tesouro_fixed_income(db, user, monkeypatch):
    rf_asset = await make_asset(
        db,
        ticker="CDB-TEST",
        asset_type=AssetType.RF,
        asset_class=AssetClass.RF,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
    )
    stock_asset = await make_asset(
        db,
        ticker="AAPL",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )

    async def fake_refresh_fx_rates(self, results):
        return {CurrencyCode.BRL: Decimal("1"), CurrencyCode.USD: Decimal("5")}

    async def fake_fetch_tesouro_prices(self, assets):
        assert assets == []
        return {"updated": [], "failed": []}

    yf_assets = []

    async def fake_fetch_yf_prices(self, assets, fx_rates):
        yf_assets.extend(assets)
        return {"updated": [], "failed": []}

    monkeypatch.setattr(PriceService, "_refresh_fx_rates", fake_refresh_fx_rates)
    monkeypatch.setattr(
        PriceService, "_fetch_tesouro_prices", fake_fetch_tesouro_prices
    )
    monkeypatch.setattr(PriceService, "_fetch_yf_prices", fake_fetch_yf_prices)

    results = await PriceService(db, user).update_all_prices()

    assert yf_assets == [stock_asset]
    assert {"ticker": rf_asset.ticker, "reason": "non-Tesouro fixed income"} in results[
        "skipped"
    ]


async def test_update_all_prices_routes_tesouro_ticker_to_tesouro_provider(
    db, user, monkeypatch
):
    asset = await make_asset(
        db,
        ticker="TD-IPCA-2050",
        asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
        current_price=None,
    )

    async def fake_refresh_fx_rates(self, results):
        return {CurrencyCode.BRL: Decimal("1")}

    async def fake_fetch_yf_prices(self, assets, fx_rates):
        assert assets == []
        return {"updated": [], "failed": []}

    async def fake_fetch_tesouro_price(kind, maturity_year):
        assert kind == TesouroKind.IPCA
        assert maturity_year == 2050
        return Decimal("4123.4567")

    monkeypatch.setattr(PriceService, "_refresh_fx_rates", fake_refresh_fx_rates)
    monkeypatch.setattr(PriceService, "_fetch_yf_prices", fake_fetch_yf_prices)
    monkeypatch.setattr(
        "app.services.price_service.fetch_tesouro_price", fake_fetch_tesouro_price
    )

    results = await PriceService(db, user).update_all_prices()
    await db.refresh(asset)

    assert results["updated"] == [{"ticker": "TD-IPCA-2050", "price": 4123.4567}]
    assert results["failed"] == []
    assert asset.type == AssetType.RF
    assert asset.asset_class == AssetClass.RF
    assert asset.market == Market.BR
    assert asset.quote_currency == CurrencyCode.BRL
    assert asset.td_kind == TesouroKind.IPCA
    assert asset.td_maturity_year == 2050
    assert asset.current_price == Decimal("4123.4567")

    row = (
        (
            await db.execute(
                select(AssetPriceHistory).where(AssetPriceHistory.asset_id == asset.id)
            )
        )
        .scalars()
        .one()
    )
    assert row.yf_ticker == "TD-IPCA-2050"
    assert row.source == "tesouro"
