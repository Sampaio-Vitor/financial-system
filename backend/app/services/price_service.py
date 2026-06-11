import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import (
    Asset,
    AssetClass,
    AssetType,
    CurrencyCode,
    Market,
    TesouroKind,
    resolve_asset_metadata,
)
from app.models.asset_price_history import AssetPriceHistory
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.services.crypto_price_service import (
    UnsupportedCryptoAsset,
    coingecko_id_for_btc,
    fetch_current_prices,
    fetch_historical_prices_brl,
    fetch_historical_prices_usd,
)
from app.services.tesouro_price_service import fetch_tesouro_price
from app.services.trading_calendar import last_trading_day

logger = logging.getLogger(__name__)

FX_TICKERS: dict[CurrencyCode, str] = {
    CurrencyCode.USD: "USDBRL=X",
    CurrencyCode.EUR: "EURBRL=X",
    CurrencyCode.GBP: "GBPBRL=X",
}
YF_BATCH_SIZE = 10
YF_BATCH_SLEEP_SECONDS = 3
YF_RETRY_DELAYS_SECONDS = (2, 5, 10)


def _is_demo_asset(asset: Asset) -> bool:
    return asset.description.strip().endswith(" Demo")


def _parse_tesouro_ticker(ticker: str) -> tuple[TesouroKind, int] | None:
    parts = ticker.strip().upper().split("-")
    if len(parts) != 3 or parts[0] != "TD":
        return None

    kind_slug = parts[1]
    if kind_slug == "SELIC":
        kind = TesouroKind.SELIC
    elif kind_slug in {"IPCA", "IPCA+"}:
        kind = TesouroKind.IPCA
    else:
        return None

    try:
        maturity_year = int(parts[2])
    except ValueError:
        return None
    if not 2025 <= maturity_year <= 2100:
        return None
    return kind, maturity_year


def _tesouro_details_for(asset: Asset) -> tuple[TesouroKind, int] | None:
    if asset.td_kind and asset.td_maturity_year:
        return asset.td_kind, asset.td_maturity_year
    return _parse_tesouro_ticker(asset.ticker)


def _is_tesouro_asset(asset: Asset) -> bool:
    return _tesouro_details_for(asset) is not None


def _is_fixed_income_asset(asset: Asset) -> bool:
    asset_class, _market, _quote_currency = resolve_asset_metadata(
        legacy_type=asset.type,
        asset_class=asset.asset_class,
        market=asset.market,
        quote_currency=asset.quote_currency,
    )
    return asset_class == AssetClass.RF or _is_tesouro_asset(asset)


def _is_non_tesouro_fixed_income(asset: Asset) -> bool:
    return _is_fixed_income_asset(asset) and not _is_tesouro_asset(asset)


def _is_crypto(asset: Asset) -> bool:
    asset_class, _market, _quote_currency = resolve_asset_metadata(
        legacy_type=asset.type,
        asset_class=asset.asset_class,
        market=asset.market,
        quote_currency=asset.quote_currency,
    )
    return asset_class == AssetClass.CRYPTO


def _btc_coingecko_id_for(asset: Asset) -> str | None:
    try:
        return coingecko_id_for_btc(asset.ticker, asset.price_symbol)
    except UnsupportedCryptoAsset as exc:
        logger.warning("Unsupported crypto asset %s: %s", asset.ticker, exc)
        return None


def _crypto_usd_fx_rate(price_brl: Decimal, price_usd: Decimal | None) -> Decimal:
    if price_usd and price_usd > 0:
        return price_brl / price_usd
    return Decimal("1")


def _extract_close(data, yf_ticker: str) -> float | None:
    try:
        close_data = data["Close"]
        val = (
            close_data[yf_ticker].iloc[-1]
            if hasattr(close_data, "columns")
            else close_data.iloc[-1]
        )
        close = float(val)
        return close if close and close > 0 else None
    except Exception:
        logger.warning("Failed to extract close price", exc_info=True)
        return None


def _extract_price_curve(
    data, yf_ticker: str
) -> dict[date, tuple[Decimal, Decimal | None, Decimal | None]]:
    curve: dict[date, tuple[Decimal, Decimal | None, Decimal | None]] = {}
    if data is None or data.empty:
        return curve
    try:
        close_data = data["Close"]
        close_series = (
            close_data[yf_ticker] if hasattr(close_data, "columns") else close_data
        )
    except Exception:
        logger.warning("Failed to extract price curve for %s", yf_ticker, exc_info=True)
        return curve

    def _field_series(field: str):
        try:
            field_data = data[field]
            return (
                field_data[yf_ticker] if hasattr(field_data, "columns") else field_data
            )
        except Exception:
            return None

    low_series = _field_series("Low")
    high_series = _field_series("High")

    for idx, val in close_series.items():
        try:
            close_price = float(val)
            low_value = low_series.get(idx) if low_series is not None else None
            high_value = high_series.get(idx) if high_series is not None else None
            low_price = float(low_value) if low_value is not None else 0
            high_price = float(high_value) if high_value is not None else 0
            if close_price > 0:
                curve[idx.date()] = (
                    Decimal(str(round(close_price, 6))),
                    Decimal(str(round(low_price, 6))) if low_price > 0 else None,
                    Decimal(str(round(high_price, 6))) if high_price > 0 else None,
                )
        except Exception:
            continue
    return curve


def _extract_close_curve(data, yf_ticker: str) -> dict[date, Decimal]:
    return {
        quote_date: values[0]
        for quote_date, values in _extract_price_curve(data, yf_ticker).items()
    }


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

    async def _download_yf(self, tickers: str | list[str], **kwargs):
        loop = asyncio.get_running_loop()
        last_data = None
        for attempt, delay in enumerate((0, *YF_RETRY_DELAYS_SECONDS)):
            if delay:
                await asyncio.sleep(delay)
            try:
                call_kwargs = dict(kwargs)
                data = await loop.run_in_executor(
                    None,
                    lambda t=tickers, kw=call_kwargs: yf.download(
                        t, progress=False, threads=False, **kw
                    ),
                )
                last_data = data
                if not data.empty:
                    return data
            except Exception:
                logger.warning(
                    "Yahoo Finance download failed for %s on attempt %s",
                    tickers,
                    attempt + 1,
                    exc_info=True,
                )
        return last_data

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

        tesouro_assets = [a for a in assets if _is_tesouro_asset(a)]
        non_tesouro_rf_assets = [a for a in assets if _is_non_tesouro_fixed_income(a)]
        crypto_assets = [
            a for a in assets if not _is_tesouro_asset(a) and _is_crypto(a)
        ]
        results["skipped"].extend(
            {"ticker": asset.ticker, "reason": "non-Tesouro fixed income"}
            for asset in non_tesouro_rf_assets
        )
        other_assets = [
            a
            for a in assets
            if not _is_tesouro_asset(a)
            and not _is_non_tesouro_fixed_income(a)
            and not _is_crypto(a)
        ]

        td_results = await self._fetch_tesouro_prices(tesouro_assets)
        results["updated"].extend(td_results["updated"])
        results["failed"].extend(td_results["failed"])

        price_results = await self._fetch_yf_prices(other_assets, fx_rates)
        results["updated"].extend(price_results["updated"])
        results["failed"].extend(price_results["failed"])

        crypto_results = await self._fetch_crypto_prices(crypto_assets)
        results["updated"].extend(crypto_results["updated"])
        results["failed"].extend(crypto_results["failed"])

        await self.db.commit()
        return results

    async def _fetch_tesouro_prices(self, assets: list[Asset]) -> dict:
        results: dict = {"updated": [], "failed": []}
        if not assets:
            return results
        now = datetime.now(timezone.utc)
        for asset in assets:
            details = _tesouro_details_for(asset)
            if details is None:
                results["failed"].append(
                    {"ticker": asset.ticker, "error": "Tesouro metadata unavailable"}
                )
                continue
            td_kind, td_maturity_year = details
            price = await fetch_tesouro_price(td_kind, td_maturity_year)
            if price is None:
                results["failed"].append(
                    {"ticker": asset.ticker, "error": "Tesouro price unavailable"}
                )
                continue
            asset.type = AssetType.RF
            asset.asset_class = AssetClass.RF
            asset.market = Market.BR
            asset.quote_currency = CurrencyCode.BRL
            asset.price_symbol = None
            asset.td_kind = td_kind
            asset.td_maturity_year = td_maturity_year
            asset.current_price_native = price
            asset.fx_rate_to_brl = Decimal("1")
            asset.current_price = round(price, 4)
            asset.price_updated_at = now
            await self._upsert_asset_price_history(
                asset=asset,
                yf_ticker=asset.ticker,
                quote_date=now.date(),
                native_price=price,
                fx_rate=Decimal("1"),
                quote_currency=CurrencyCode.BRL,
                source="tesouro",
            )
            results["updated"].append(
                {"ticker": asset.ticker, "price": float(asset.current_price)}
            )
        return results

    async def _fetch_crypto_prices(self, assets: list[Asset]) -> dict:
        """Fetch current BRL price for crypto assets via CoinGecko."""
        results: dict = {"updated": [], "failed": []}
        if not assets:
            return results
        now = datetime.now(timezone.utc)
        for asset in assets:
            coingecko_id = _btc_coingecko_id_for(asset)
            if coingecko_id is None:
                results["failed"].append(
                    {"ticker": asset.ticker, "error": "Only BTC is supported"}
                )
                continue
            current_prices = await fetch_current_prices(coingecko_id, ("brl", "usd"))
            price_brl = current_prices.get("brl")
            if price_brl is None:
                results["failed"].append(
                    {
                        "ticker": asset.ticker,
                        "error": f"CoinGecko price unavailable for {coingecko_id}",
                    }
                )
                continue
            price_usd = current_prices.get("usd")
            asset.current_price_native = price_usd or price_brl
            asset.fx_rate_to_brl = _crypto_usd_fx_rate(price_brl, price_usd)
            asset.current_price = round(price_brl, 4)
            asset.price_updated_at = now
            await self._upsert_asset_price_history(
                asset=asset,
                yf_ticker=coingecko_id,
                quote_date=now.date(),
                native_price=price_brl,
                fx_rate=Decimal("1"),
                quote_currency=CurrencyCode.BRL,
                source="coingecko",
            )
            results["updated"].append(
                {"ticker": asset.ticker, "price": float(asset.current_price)}
            )
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
        data = await self._download_yf(yf_ticker, period="1d")
        if data is not None and not data.empty:
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

    async def _fetch_yf_prices(
        self, assets: list[Asset], fx_rates: dict[CurrencyCode, Decimal]
    ) -> dict:
        results = {"updated": [], "failed": []}
        ticker_map: dict[str, Asset] = {}
        for asset in assets:
            yf_ticker = self._price_symbol_for(asset)
            ticker_map[yf_ticker] = asset

        yf_tickers = list(ticker_map.keys())
        now = datetime.now(timezone.utc)

        for i in range(0, len(yf_tickers), YF_BATCH_SIZE):
            batch = yf_tickers[i : i + YF_BATCH_SIZE]
            try:
                data = await self._download_yf(batch, period="1d")
                if data is None or data.empty:
                    for t in batch:
                        asset = ticker_map[t]
                        results["failed"].append(
                            {"ticker": asset.ticker, "error": "No data returned"}
                        )
                    continue

                missing_tickers: list[str] = []
                for yf_ticker in batch:
                    asset = ticker_map[yf_ticker]
                    close_val = _extract_close(data, yf_ticker)
                    if not close_val:
                        missing_tickers.append(yf_ticker)
                        continue
                    _asset_class, _market, quote_currency = resolve_asset_metadata(
                        legacy_type=asset.type,
                        asset_class=asset.asset_class,
                        market=asset.market,
                        quote_currency=asset.quote_currency,
                    )
                    fx_rate = fx_rates.get(quote_currency)
                    if fx_rate is None:
                        results["failed"].append(
                            {
                                "ticker": asset.ticker,
                                "error": f"No FX rate available for {quote_currency.value}/BRL",
                            }
                        )
                        continue
                    native_price = Decimal(str(round(close_val, 6)))
                    asset.current_price_native = native_price
                    asset.fx_rate_to_brl = fx_rate
                    asset.current_price = round(native_price * fx_rate, 4)
                    asset.price_updated_at = now
                    await self._upsert_asset_price_history(
                        asset=asset,
                        yf_ticker=yf_ticker,
                        quote_date=now.date(),
                        native_price=native_price,
                        fx_rate=fx_rate,
                        quote_currency=quote_currency,
                    )
                    results["updated"].append(
                        {"ticker": asset.ticker, "price": float(asset.current_price)}
                    )

                for yf_ticker in missing_tickers:
                    asset = ticker_map[yf_ticker]
                    retry_data = await self._download_yf(yf_ticker, period="1d")
                    close_val = (
                        _extract_close(retry_data, yf_ticker)
                        if retry_data is not None and not retry_data.empty
                        else None
                    )
                    if not close_val:
                        results["failed"].append(
                            {"ticker": asset.ticker, "error": "No close price"}
                        )
                        continue
                    _asset_class, _market, quote_currency = resolve_asset_metadata(
                        legacy_type=asset.type,
                        asset_class=asset.asset_class,
                        market=asset.market,
                        quote_currency=asset.quote_currency,
                    )
                    fx_rate = fx_rates.get(quote_currency)
                    if fx_rate is None:
                        results["failed"].append(
                            {
                                "ticker": asset.ticker,
                                "error": f"No FX rate available for {quote_currency.value}/BRL",
                            }
                        )
                        continue
                    native_price = Decimal(str(round(close_val, 6)))
                    asset.current_price_native = native_price
                    asset.fx_rate_to_brl = fx_rate
                    asset.current_price = round(native_price * fx_rate, 4)
                    asset.price_updated_at = now
                    await self._upsert_asset_price_history(
                        asset=asset,
                        yf_ticker=yf_ticker,
                        quote_date=now.date(),
                        native_price=native_price,
                        fx_rate=fx_rate,
                        quote_currency=quote_currency,
                    )
                    results["updated"].append(
                        {"ticker": asset.ticker, "price": float(asset.current_price)}
                    )
            except Exception as exc:
                for t in batch:
                    asset = ticker_map[t]
                    results["failed"].append(
                        {"ticker": asset.ticker, "error": str(exc)}
                    )

            if i + YF_BATCH_SIZE < len(yf_tickers):
                await asyncio.sleep(YF_BATCH_SLEEP_SECONDS)

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
        if market == Market.UK and asset_class.value in {"STOCK", "ETF"}:
            return f"{asset.ticker}.L"
        return asset.ticker

    async def _fetch_historical_fx(
        self, currency: CurrencyCode, target_date: date
    ) -> Decimal | None:
        if currency == CurrencyCode.BRL:
            return Decimal("1")
        yf_ticker = FX_TICKERS[currency]
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)
        data = await self._download_yf(
            yf_ticker, start=start.isoformat(), end=end.isoformat()
        )
        if data is not None and not data.empty:
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

        tesouro_assets = [a for a in assets if _is_tesouro_asset(a)]
        crypto_assets = [
            a for a in assets if not _is_tesouro_asset(a) and _is_crypto(a)
        ]
        yf_assets = [
            a
            for a in assets
            if not _is_tesouro_asset(a)
            and not _is_non_tesouro_fixed_income(a)
            and not _is_crypto(a)
        ]

        # Historical Tesouro curves are not available from yfinance. Use the latest
        # cached/current PU as a conservative fallback for snapshot calculations.
        for asset in tesouro_assets:
            if asset.current_price is None:
                continue
            native_price = asset.current_price_native or asset.current_price
            fx_rate = asset.fx_rate_to_brl or Decimal("1")
            prices[asset.id] = (native_price, fx_rate, asset.current_price)

        # Crypto: fetch from CoinGecko for the target date (BRL, fx_rate=1)
        for asset in crypto_assets:
            coingecko_id = _btc_coingecko_id_for(asset)
            if coingecko_id is None:
                continue
            historical = await fetch_historical_prices_brl(
                coingecko_id, target_date, target_date
            )
            price_brl = historical.get(target_date)
            if price_brl is not None:
                prices[asset.id] = (price_brl, Decimal("1"), round(price_brl, 4))

        # Non-crypto: fetch via yfinance as before
        if not yf_assets:
            return prices

        currencies_needed = {
            resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )[2]
            for asset in yf_assets
        }
        fx_rates: dict[CurrencyCode, Decimal] = {}
        for currency in currencies_needed:
            rate = await self._fetch_historical_fx(currency, target_date)
            if not rate:
                rate = await self._get_rate_to_brl(currency)
            if rate:
                fx_rates[currency] = rate

        ticker_map: dict[str, Asset] = {
            self._price_symbol_for(asset): asset for asset in yf_assets
        }
        yf_tickers = list(ticker_map.keys())
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)

        for i in range(0, len(yf_tickers), YF_BATCH_SIZE):
            batch = yf_tickers[i : i + YF_BATCH_SIZE]
            try:
                data = await self._download_yf(
                    batch, start=start.isoformat(), end=end.isoformat()
                )
                if data is None or data.empty:
                    continue

                missing_tickers: list[str] = []
                for yf_ticker in batch:
                    asset = ticker_map[yf_ticker]
                    close_val = _extract_close(data, yf_ticker)
                    if not close_val:
                        missing_tickers.append(yf_ticker)
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

                for yf_ticker in missing_tickers:
                    asset = ticker_map[yf_ticker]
                    retry_data = await self._download_yf(
                        yf_ticker, start=start.isoformat(), end=end.isoformat()
                    )
                    close_val = (
                        _extract_close(retry_data, yf_ticker)
                        if retry_data is not None and not retry_data.empty
                        else None
                    )
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
                logger.warning(
                    "Failed to fetch historical prices for batch", exc_info=True
                )

            if i + YF_BATCH_SIZE < len(yf_tickers):
                await asyncio.sleep(YF_BATCH_SLEEP_SECONDS)

        return prices

    async def fetch_historical_prices(
        self, assets: list[Asset], target_date: date
    ) -> dict[int, Decimal]:
        details = await self.fetch_historical_price_details(assets, target_date)
        return {asset_id: item[2] for asset_id, item in details.items()}

    async def _upsert_asset_price_history(
        self,
        *,
        asset: Asset,
        yf_ticker: str,
        quote_date: date,
        native_price: Decimal,
        fx_rate: Decimal,
        quote_currency: CurrencyCode,
        low_native: Decimal | None = None,
        high_native: Decimal | None = None,
        source: str = "yfinance",
    ) -> None:
        brl_price = round(native_price * fx_rate, 4)
        low_brl = round(low_native * fx_rate, 4) if low_native is not None else None
        high_brl = round(high_native * fx_rate, 4) if high_native is not None else None
        existing_result = await self.db.execute(
            select(AssetPriceHistory).where(
                AssetPriceHistory.asset_id == asset.id,
                AssetPriceHistory.date == quote_date,
            )
        )
        row = existing_result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if row:
            row.yf_ticker = yf_ticker
            row.price_native = round(native_price, 6)
            if low_native is not None:
                row.low_native = round(low_native, 6)
                row.low_brl = low_brl
            if high_native is not None:
                row.high_native = round(high_native, 6)
                row.high_brl = high_brl
            row.fx_rate_to_brl = round(fx_rate, 6)
            row.price_brl = brl_price
            row.quote_currency = quote_currency
            row.source = source
            row.updated_at = now
            return

        self.db.add(
            AssetPriceHistory(
                asset_id=asset.id,
                yf_ticker=yf_ticker,
                date=quote_date,
                price_native=round(native_price, 6),
                low_native=round(low_native, 6) if low_native is not None else None,
                high_native=round(high_native, 6) if high_native is not None else None,
                fx_rate_to_brl=round(fx_rate, 6),
                price_brl=brl_price,
                low_brl=low_brl,
                high_brl=high_brl,
                quote_currency=quote_currency,
                source=source,
                created_at=now,
                updated_at=now,
            )
        )

    async def get_asset_price_history(self, asset: Asset, days: int) -> list[dict]:
        _asset_class, market, quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        end_date = last_trading_day(market, datetime.now(timezone.utc).date())
        start_date = end_date - timedelta(days=days)
        fetch_end_date = max(start_date, end_date - timedelta(days=1))

        if _is_crypto(asset):
            coingecko_id = _btc_coingecko_id_for(asset)
            if coingecko_id is None:
                return []
            return await self._get_crypto_price_history(
                asset=asset,
                coingecko_id=coingecko_id,
                start_date=start_date,
                end_date=end_date,
                fetch_end_date=fetch_end_date,
            )

        if _is_fixed_income_asset(asset):
            cached = await self._get_cached_asset_price_history(
                asset.id, start_date, end_date
            )
            return [
                {
                    "date": row.date.isoformat(),
                    "price": float(round(row.price_brl, 2)),
                    "price_native": float(round(row.price_native, 4)),
                }
                for row in sorted(cached, key=lambda item: item.date)
            ]

        yf_ticker = self._price_symbol_for(asset)
        cached = await self._get_cached_asset_price_history(
            asset.id, start_date, end_date
        )
        missing_ranges = self._missing_cache_ranges(
            [row for row in cached if start_date <= row.date <= fetch_end_date],
            start_date,
            fetch_end_date,
            require_ohlc=False,
            market=market,
        )

        for missing_start, missing_end in missing_ranges:
            await self._fetch_and_cache_asset_history(
                asset=asset,
                yf_ticker=yf_ticker,
                quote_currency=quote_currency,
                start_date=missing_start,
                end_date=missing_end,
            )
        if missing_ranges:
            cached = await self._get_cached_asset_price_history(
                asset.id, start_date, end_date
            )
            await self.db.commit()

        return [
            {
                "date": row.date.isoformat(),
                "price": float(round(row.price_brl, 2)),
                "price_native": float(round(row.price_native, 4)),
            }
            for row in sorted(cached, key=lambda item: item.date)
        ]

    async def _get_crypto_price_history(
        self,
        *,
        asset: Asset,
        coingecko_id: str,
        start_date: date,
        end_date: date,
        fetch_end_date: date,
    ) -> list[dict]:
        cached = await self._get_cached_asset_price_history(
            asset.id, start_date, end_date
        )
        missing_ranges = self._missing_cache_ranges(
            [row for row in cached if start_date <= row.date <= fetch_end_date],
            start_date,
            fetch_end_date,
            require_ohlc=False,
            market=Market.CRYPTO,
        )

        for missing_start, missing_end in missing_ranges:
            await self._fetch_and_cache_crypto_history(
                asset=asset,
                coingecko_id=coingecko_id,
                start_date=missing_start,
                end_date=missing_end,
            )
        if missing_ranges:
            cached = await self._get_cached_asset_price_history(
                asset.id, start_date, end_date
            )
            await self.db.commit()

        usd_prices = await fetch_historical_prices_usd(
            coingecko_id, start_date, end_date
        )
        sorted_rows = sorted(cached, key=lambda item: item.date)
        if sorted_rows:
            latest = sorted_rows[-1]
            latest_usd = usd_prices.get(latest.date)
            asset.current_price = round(latest.price_brl, 4)
            asset.current_price_native = latest_usd or latest.price_brl
            asset.fx_rate_to_brl = _crypto_usd_fx_rate(latest.price_brl, latest_usd)
            asset.price_updated_at = datetime.now(timezone.utc)
            await self.db.flush()

        return [
            {
                "date": row.date.isoformat(),
                "price": float(round(row.price_brl, 2)),
                "price_native": float(round(row.price_native, 4)),
                "price_usd": (
                    float(round(usd_prices[row.date], 2))
                    if row.date in usd_prices
                    else None
                ),
            }
            for row in sorted_rows
        ]

    async def _fetch_and_cache_crypto_history(
        self,
        *,
        asset: Asset,
        coingecko_id: str,
        start_date: date,
        end_date: date,
    ) -> None:
        prices = await fetch_historical_prices_brl(coingecko_id, start_date, end_date)
        if not prices:
            return
        for quote_date, price_brl in prices.items():
            await self._upsert_asset_price_history(
                asset=asset,
                yf_ticker=coingecko_id,
                quote_date=quote_date,
                native_price=price_brl,
                fx_rate=Decimal("1"),
                quote_currency=CurrencyCode.BRL,
                source="coingecko",
            )
        await self.db.flush()

    def _missing_cache_ranges(
        self,
        cached: list[AssetPriceHistory],
        start_date: date,
        end_date: date,
        *,
        require_ohlc: bool,
        market: Optional[Market] = None,
    ) -> list[tuple[date, date]]:
        if not cached:
            ranges = [(start_date, end_date)]
        else:
            cached_dates = [row.date for row in cached]
            ranges = []
            first_cached = min(cached_dates)
            last_cached = max(cached_dates)

            if first_cached > start_date:
                ranges.append((start_date, first_cached - timedelta(days=1)))
            if last_cached < end_date:
                ranges.append((last_cached + timedelta(days=1), end_date))
            if require_ohlc:
                missing_ohlc_dates = [
                    row.date
                    for row in cached
                    if row.low_native is None or row.high_native is None
                ]
                if missing_ohlc_dates:
                    ranges.append((min(missing_ohlc_dates), max(missing_ohlc_dates)))
        # Drop ranges with no trading session (e.g. a window starting on a
        # holiday/weekend) — they can never be filled, so fetching them would
        # hit the price provider on every single request.
        return [
            (range_start, range_end)
            for range_start, range_end in ranges
            if last_trading_day(market, range_end) >= range_start
        ]

    async def _get_cached_asset_price_history(
        self, asset_id: int, start_date: date, end_date: date
    ) -> list[AssetPriceHistory]:
        result = await self.db.execute(
            select(AssetPriceHistory)
            .where(
                AssetPriceHistory.asset_id == asset_id,
                AssetPriceHistory.date >= start_date,
                AssetPriceHistory.date <= end_date,
            )
            .order_by(AssetPriceHistory.date)
        )
        return list(result.scalars().all())

    async def _fetch_and_cache_asset_history(
        self,
        *,
        asset: Asset,
        yf_ticker: str,
        quote_currency: CurrencyCode,
        start_date: date,
        end_date: date,
    ) -> None:
        # yfinance's end date is exclusive.
        fetch_end = end_date + timedelta(days=1)
        try:
            data = await self._download_yf(
                yf_ticker, start=start_date.isoformat(), end=fetch_end.isoformat()
            )
        except Exception:
            logger.warning(
                "Failed to fetch historical prices for %s", yf_ticker, exc_info=True
            )
            return

        price_curve = _extract_price_curve(data, yf_ticker)
        if not price_curve:
            return

        fx_curve: dict[date, Decimal] = {}
        fallback_fx_rate: Decimal | None = None
        if quote_currency == CurrencyCode.BRL:
            fallback_fx_rate = Decimal("1")
        else:
            fallback_fx_rate = await self._get_rate_to_brl(quote_currency)
            fx_ticker = FX_TICKERS[quote_currency]
            try:
                fx_data = await self._download_yf(
                    fx_ticker,
                    start=start_date.isoformat(),
                    end=fetch_end.isoformat(),
                )
                fx_curve = _extract_close_curve(fx_data, fx_ticker)
            except Exception:
                logger.warning(
                    "Failed to fetch historical FX for %s", fx_ticker, exc_info=True
                )

        for quote_date, (native_price, low_native, high_native) in price_curve.items():
            fx_rate = (
                Decimal("1")
                if quote_currency == CurrencyCode.BRL
                else fx_curve.get(quote_date, fallback_fx_rate)
            )
            if not fx_rate:
                continue
            await self._upsert_asset_price_history(
                asset=asset,
                yf_ticker=yf_ticker,
                quote_date=quote_date,
                native_price=native_price,
                fx_rate=fx_rate,
                quote_currency=quote_currency,
                low_native=low_native,
                high_native=high_native,
            )
        await self.db.flush()

    async def ensure_asset_price_history_range(
        self, asset: Asset, start_date: date, end_date: date, *, require_ohlc: bool
    ) -> list[AssetPriceHistory]:
        _asset_class, market, quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        end_date = last_trading_day(market, end_date)
        if start_date > end_date:
            start_date = end_date
        cached = await self._get_cached_asset_price_history(
            asset.id, start_date, end_date
        )
        missing_ranges = self._missing_cache_ranges(
            cached, start_date, end_date, require_ohlc=require_ohlc, market=market
        )
        if _is_fixed_income_asset(asset):
            return cached
        if _is_crypto(asset):
            coingecko_id = _btc_coingecko_id_for(asset)
            if coingecko_id is None:
                return cached
            for missing_start, missing_end in missing_ranges:
                await self._fetch_and_cache_crypto_history(
                    asset=asset,
                    coingecko_id=coingecko_id,
                    start_date=missing_start,
                    end_date=missing_end,
                )
        else:
            yf_ticker = self._price_symbol_for(asset)
            for missing_start, missing_end in missing_ranges:
                await self._fetch_and_cache_asset_history(
                    asset=asset,
                    yf_ticker=yf_ticker,
                    quote_currency=quote_currency,
                    start_date=missing_start,
                    end_date=missing_end,
                )
        if missing_ranges:
            await self.db.flush()
            cached = await self._get_cached_asset_price_history(
                asset.id, start_date, end_date
            )
        return cached
