import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.system_setting import SystemSetting
from app.models.user import User

logger = logging.getLogger(__name__)


def _is_demo_asset(asset: Asset) -> bool:
    return asset.description.strip().endswith(" Demo")


def _extract_close(data, yf_ticker: str) -> float | None:
    """Extract closing price from yfinance DataFrame (always MultiIndex columns)."""
    try:
        val = data["Close"][yf_ticker].iloc[-1]
        close = float(val)
        return close if close and close > 0 else None
    except Exception:
        logger.warning("Failed to extract close price", exc_info=True)
        return None


async def _get_system_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def _upsert_system_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
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
        results = {"updated": [], "failed": [], "skipped": [], "usd_brl_rate": None}

        # Fetch USD/BRL rate first
        rate = None
        try:
            rate = await self._fetch_usd_brl()
            if rate:
                results["usd_brl_rate"] = float(rate)
                await self._save_usd_brl(rate)
        except Exception as e:
            results["failed"].append({"ticker": "USDBRL=X", "error": str(e)})

        # Get all assets
        asset_result = await self.db.execute(select(Asset))
        all_assets = asset_result.scalars().all()
        assets = [asset for asset in all_assets if not _is_demo_asset(asset)]
        results["skipped"].extend(
            {"ticker": asset.ticker, "reason": "demo asset"}
            for asset in all_assets
            if _is_demo_asset(asset)
        )

        # Split by type
        us_stocks = [a for a in assets if a.type == AssetType.STOCK]
        br_assets = [a for a in assets if a.type in (AssetType.ACAO, AssetType.FII)]

        # Fetch US stock prices via yfinance (batched, converted to BRL)
        if us_stocks:
            us_results = await self._fetch_yf_prices(us_stocks, usd_brl_rate=rate, convert_to_brl=True)
            results["updated"].extend(us_results["updated"])
            results["failed"].extend(us_results["failed"])

        # Fetch BR prices via yfinance with .SA suffix (already in BRL)
        if br_assets:
            br_results = await self._fetch_yf_prices(br_assets, usd_brl_rate=None, convert_to_brl=False)
            results["updated"].extend(br_results["updated"])
            results["failed"].extend(br_results["failed"])

        await self.db.commit()
        return results

    async def _fetch_usd_brl(self) -> Decimal | None:
        """Fetch USD/BRL exchange rate via yfinance."""
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(
            None, lambda: yf.download("USDBRL=X", period="1d", progress=False)
        )
        if not data.empty:
            close = _extract_close(data, "USDBRL=X")
            if close:
                return Decimal(str(close))
        return None

    async def _save_usd_brl(self, rate: Decimal):
        await _upsert_system_setting(self.db, "usd_brl_rate", str(rate))
        await _upsert_system_setting(
            self.db, "usd_brl_rate_updated_at", datetime.now(timezone.utc).isoformat()
        )

    async def _get_usd_brl(self) -> Decimal | None:
        val = await _get_system_setting(self.db, "usd_brl_rate")
        return Decimal(val) if val else None

    async def _fetch_yf_prices(self, assets: list[Asset], usd_brl_rate: Decimal | None, convert_to_brl: bool) -> dict:
        results = {"updated": [], "failed": []}

        if convert_to_brl:
            if not usd_brl_rate:
                usd_brl_rate = await self._get_usd_brl()
            if not usd_brl_rate:
                for a in assets:
                    results["failed"].append({"ticker": a.ticker, "error": "No USD/BRL rate available"})
                return results

        # Map DB ticker -> yfinance ticker
        ticker_map = {}  # yf_ticker -> asset
        for a in assets:
            if a.type in (AssetType.ACAO, AssetType.FII):
                ticker_map[f"{a.ticker}.SA"] = a
            else:
                ticker_map[a.ticker] = a

        yf_tickers = list(ticker_map.keys())
        loop = asyncio.get_running_loop()

        # Process in batches of 10
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
                    if close_val:
                        if convert_to_brl:
                            price = Decimal(str(close_val)) * usd_brl_rate
                            asset.current_price = round(price, 4)
                        else:
                            asset.current_price = Decimal(str(round(close_val, 4)))
                        asset.price_updated_at = datetime.now(timezone.utc)
                        results["updated"].append({"ticker": asset.ticker, "price": float(asset.current_price)})
                    else:
                        results["failed"].append({"ticker": asset.ticker, "error": "No close price"})
            except Exception as e:
                for t in batch:
                    asset = ticker_map[t]
                    results["failed"].append({"ticker": asset.ticker, "error": str(e)})

            # Rate limit between batches
            if i + 10 < len(yf_tickers):
                await asyncio.sleep(2)

        return results

    # ── Historical prices ────────────────────────────────────────────

    async def _fetch_historical_usd_brl(self, target_date: date) -> Decimal | None:
        """Fetch USD/BRL closing rate for target_date (tries a 7-day window to find last trading day)."""
        loop = asyncio.get_running_loop()
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)
        data = await loop.run_in_executor(
            None,
            lambda: yf.download("USDBRL=X", start=start.isoformat(), end=end.isoformat(), progress=False),
        )
        if not data.empty:
            close = _extract_close(data, "USDBRL=X")
            if close:
                return Decimal(str(close))
        return None

    async def fetch_historical_prices(
        self, assets: list[Asset], target_date: date
    ) -> dict[int, Decimal]:
        """Return {asset_id: price_brl} for each asset on target_date."""
        prices: dict[int, Decimal] = {}
        if not assets:
            return prices

        us_stocks = [a for a in assets if a.type == AssetType.STOCK]
        br_assets = [a for a in assets if a.type in (AssetType.ACAO, AssetType.FII)]

        usd_brl = None
        if us_stocks:
            usd_brl = await self._fetch_historical_usd_brl(target_date)
            if not usd_brl:
                usd_brl = await self._get_usd_brl()  # fallback to cached

        for group, convert in [(us_stocks, True), (br_assets, False)]:
            if not group:
                continue
            ticker_map: dict[str, Asset] = {}
            for a in group:
                yf_ticker = f"{a.ticker}.SA" if a.type in (AssetType.ACAO, AssetType.FII) else a.ticker
                ticker_map[yf_ticker] = a

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
                        if close_val:
                            if convert and usd_brl:
                                prices[asset.id] = round(Decimal(str(close_val)) * usd_brl, 4)
                            elif not convert:
                                prices[asset.id] = Decimal(str(round(close_val, 4)))
                except Exception:
                    logger.warning("Failed to fetch historical prices for batch", exc_info=True)

                if i + 10 < len(yf_tickers):
                    await asyncio.sleep(2)

        return prices
