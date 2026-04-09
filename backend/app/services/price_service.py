import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, CurrencyCode, Market, resolve_asset_metadata
from app.models.system_setting import SystemSetting
from app.models.user import User

logger = logging.getLogger(__name__)

FX_TICKERS: dict[CurrencyCode, str] = {
    CurrencyCode.USD: "USDBRL=X",
    CurrencyCode.EUR: "EURBRL=X",
    CurrencyCode.GBP: "GBPBRL=X",
}


def _is_demo_asset(asset: Asset) -> bool:
    return asset.description.strip().endswith(" Demo")


def _extract_close(data, yf_ticker: str) -> float | None:
    try:
        val = data["Close"][yf_ticker].iloc[-1]
        close = float(val)
        return close if close and close > 0 else None
    except Exception:
        logger.warning("Failed to extract close price", exc_info=True)
        return None


async def _get_system_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def _upsert_system_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        db.add(SystemSetting(key=key, value=value))


class PriceService:
    def __init__(self, db: AsyncSession, user: Optional[User] = None):
        self.db = db
        self.user = user

    async def update_all_prices(self) -> dict:
        results = {"updated": [], "failed": [], "skipped": [], "fx_rates": {}}

        fx_rates = await self._refresh_fx_rates(results)

        asset_result = await self.db.execute(select(Asset))
        all_assets = asset_result.scalars().all()
        assets = [asset for asset in all_assets if not _is_demo_asset(asset)]
        results["skipped"].extend(
            {"ticker": asset.ticker, "reason": "demo asset"}
            for asset in all_assets
            if _is_demo_asset(asset)
        )

        price_results = await self._fetch_yf_prices(assets, fx_rates)
        results["updated"].extend(price_results["updated"])
        results["failed"].extend(price_results["failed"])

        await self.db.commit()
        return results

    async def _refresh_fx_rates(self, results: dict) -> dict[CurrencyCode, Decimal]:
        fx_rates: dict[CurrencyCode, Decimal] = {CurrencyCode.BRL: Decimal("1")}
        for currency, yf_ticker in FX_TICKERS.items():
            try:
                rate = await self._fetch_fx_to_brl(yf_ticker)
                if rate:
                    fx_rates[currency] = rate
                    results["fx_rates"][currency.value] = float(rate)
                    await self._save_fx_rate(currency, rate)
            except Exception as exc:
                results["failed"].append({"ticker": yf_ticker, "error": str(exc)})
                cached = await self._get_rate_to_brl(currency)
                if cached:
                    fx_rates[currency] = cached
        return fx_rates

    async def _fetch_fx_to_brl(self, yf_ticker: str) -> Decimal | None:
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(
            None, lambda: yf.download(yf_ticker, period="1d", progress=False)
        )
        if not data.empty:
            close = _extract_close(data, yf_ticker)
            if close:
                return Decimal(str(close))
        return None

    async def _save_fx_rate(self, currency: CurrencyCode, rate: Decimal) -> None:
        key_prefix = currency.value.lower()
        await _upsert_system_setting(self.db, f"{key_prefix}_brl_rate", str(rate))
        await _upsert_system_setting(
            self.db,
            f"{key_prefix}_brl_rate_updated_at",
            datetime.now(timezone.utc).isoformat(),
        )

    async def _get_rate_to_brl(self, currency: CurrencyCode) -> Decimal | None:
        if currency == CurrencyCode.BRL:
            return Decimal("1")
        val = await _get_system_setting(self.db, f"{currency.value.lower()}_brl_rate")
        return Decimal(val) if val else None

    async def _fetch_yf_prices(self, assets: list[Asset], fx_rates: dict[CurrencyCode, Decimal]) -> dict:
        results = {"updated": [], "failed": []}
        ticker_map: dict[str, Asset] = {}
        for asset in assets:
            yf_ticker = self._price_symbol_for(asset)
            ticker_map[yf_ticker] = asset

        yf_tickers = list(ticker_map.keys())
        loop = asyncio.get_running_loop()
        now = datetime.now(timezone.utc)

        for i in range(0, len(yf_tickers), 10):
            batch = yf_tickers[i : i + 10]
            try:
                data = await loop.run_in_executor(
                    None,
                    lambda b=batch: yf.download(b, period="1d", progress=False),
                )
                if data.empty:
                    for t in batch:
                        asset = ticker_map[t]
                        results["failed"].append({"ticker": asset.ticker, "error": "No data returned"})
                    continue

                for yf_ticker in batch:
                    asset = ticker_map[yf_ticker]
                    close_val = _extract_close(data, yf_ticker)
                    if not close_val:
                        results["failed"].append({"ticker": asset.ticker, "error": "No close price"})
                        continue
                    _asset_class, _market, quote_currency = resolve_asset_metadata(
                        legacy_type=asset.type,
                        asset_class=asset.asset_class,
                        market=asset.market,
                        quote_currency=asset.quote_currency,
                    )
                    fx_rate = fx_rates.get(quote_currency)
                    if fx_rate is None:
                        results["failed"].append({
                            "ticker": asset.ticker,
                            "error": f"No FX rate available for {quote_currency.value}/BRL",
                        })
                        continue
                    native_price = Decimal(str(round(close_val, 6)))
                    asset.current_price_native = native_price
                    asset.fx_rate_to_brl = fx_rate
                    asset.current_price = round(native_price * fx_rate, 4)
                    asset.price_updated_at = now
                    results["updated"].append({"ticker": asset.ticker, "price": float(asset.current_price)})
            except Exception as exc:
                for t in batch:
                    asset = ticker_map[t]
                    results["failed"].append({"ticker": asset.ticker, "error": str(exc)})

            if i + 10 < len(yf_tickers):
                await asyncio.sleep(2)

        return results

    def _price_symbol_for(self, asset: Asset) -> str:
        if asset.price_symbol:
            return asset.price_symbol
        asset_class, market, _quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        if market == Market.BR and asset_class.value in {"STOCK", "ETF", "FII"}:
            return f"{asset.ticker}.SA"
        return asset.ticker

    async def _fetch_historical_fx(self, currency: CurrencyCode, target_date: date) -> Decimal | None:
        if currency == CurrencyCode.BRL:
            return Decimal("1")
        yf_ticker = FX_TICKERS[currency]
        loop = asyncio.get_running_loop()
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)
        data = await loop.run_in_executor(
            None,
            lambda: yf.download(yf_ticker, start=start.isoformat(), end=end.isoformat(), progress=False),
        )
        if not data.empty:
            close = _extract_close(data, yf_ticker)
            if close:
                return Decimal(str(close))
        return None

    async def fetch_historical_price_details(
        self, assets: list[Asset], target_date: date
    ) -> dict[int, tuple[Decimal, Decimal, Decimal]]:
        prices: dict[int, tuple[Decimal, Decimal, Decimal]] = {}
        if not assets:
            return prices

        currencies_needed = {
            resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )[2]
            for asset in assets
        }
        fx_rates: dict[CurrencyCode, Decimal] = {}
        for currency in currencies_needed:
            rate = await self._fetch_historical_fx(currency, target_date)
            if not rate:
                rate = await self._get_rate_to_brl(currency)
            if rate:
                fx_rates[currency] = rate

        ticker_map: dict[str, Asset] = {self._price_symbol_for(asset): asset for asset in assets}
        yf_tickers = list(ticker_map.keys())
        loop = asyncio.get_running_loop()
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)

        for i in range(0, len(yf_tickers), 10):
            batch = yf_tickers[i : i + 10]
            try:
                data = await loop.run_in_executor(
                    None,
                    lambda b=batch, s=start.isoformat(), e=end.isoformat(): yf.download(
                        b, start=s, end=e, progress=False
                    ),
                )
                if data.empty:
                    continue

                for yf_ticker in batch:
                    asset = ticker_map[yf_ticker]
                    close_val = _extract_close(data, yf_ticker)
                    if not close_val:
                        continue
                    _asset_class, _market, quote_currency = resolve_asset_metadata(
                        legacy_type=asset.type,
                        asset_class=asset.asset_class,
                        market=asset.market,
                        quote_currency=asset.quote_currency,
                    )
                    fx_rate = fx_rates.get(quote_currency)
                    if not fx_rate:
                        continue
                    native_price = Decimal(str(round(close_val, 6)))
                    brl_price = round(native_price * fx_rate, 4)
                    prices[asset.id] = (native_price, fx_rate, brl_price)
            except Exception:
                logger.warning("Failed to fetch historical prices for batch", exc_info=True)

            if i + 10 < len(yf_tickers):
                await asyncio.sleep(2)

        return prices

    async def fetch_historical_prices(self, assets: list[Asset], target_date: date) -> dict[int, Decimal]:
        details = await self.fetch_historical_price_details(assets, target_date)
        return {asset_id: item[2] for asset_id, item in details.items()}
