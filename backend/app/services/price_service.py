import asyncio
from datetime import datetime, timezone
from decimal import Decimal

import httpx
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.settings import UserSettings
from app.models.user import User


class PriceService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def update_all_prices(self) -> dict:
        results = {"updated": [], "failed": [], "usd_brl_rate": None}

        # Fetch USD/BRL rate first
        try:
            rate = await self._fetch_usd_brl()
            if rate:
                results["usd_brl_rate"] = float(rate)
                await self._save_usd_brl(rate)
        except Exception as e:
            results["failed"].append({"ticker": "USDBRL=X", "error": str(e)})

        # Get all assets
        asset_result = await self.db.execute(select(Asset))
        assets = asset_result.scalars().all()

        # Split by type
        us_stocks = [a for a in assets if a.type == AssetType.STOCK]
        br_assets = [a for a in assets if a.type in (AssetType.ACAO, AssetType.FII)]

        # Fetch US stock prices via yfinance (batched)
        if us_stocks:
            us_results = await self._fetch_us_prices(us_stocks, rate)
            results["updated"].extend(us_results["updated"])
            results["failed"].extend(us_results["failed"])

        # Fetch BR prices via brapi
        if br_assets:
            br_results = await self._fetch_br_prices(br_assets)
            results["updated"].extend(br_results["updated"])
            results["failed"].extend(br_results["failed"])

        await self.db.commit()
        return results

    async def fetch_single_price(self, asset: Asset) -> Decimal | None:
        """Fetch price for a single newly added asset."""
        try:
            if asset.type == AssetType.STOCK:
                rate = await self._get_usd_brl()
                ticker = yf.Ticker(asset.ticker)
                info = ticker.info
                price_usd = info.get("currentPrice") or info.get("regularMarketPrice")
                if price_usd and rate:
                    price_brl = Decimal(str(price_usd)) * rate
                    asset.current_price = price_brl
                    asset.price_updated_at = datetime.now(timezone.utc)
                    return price_brl
            elif asset.type in (AssetType.ACAO, AssetType.FII):
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"https://brapi.dev/api/quote/{asset.ticker}",
                        timeout=10,
                    )
                    data = resp.json()
                    if data.get("results"):
                        price = data["results"][0].get("regularMarketPrice")
                        if price:
                            asset.current_price = Decimal(str(price))
                            asset.price_updated_at = datetime.now(timezone.utc)
                            return asset.current_price
        except Exception:
            pass
        return None

    async def _fetch_usd_brl(self) -> Decimal | None:
        """Fetch USD/BRL exchange rate via yfinance."""
        loop = asyncio.get_event_loop()
        ticker = await loop.run_in_executor(None, lambda: yf.Ticker("USDBRL=X"))
        info = await loop.run_in_executor(None, lambda: ticker.info)
        price = info.get("regularMarketPrice") or info.get("previousClose")
        return Decimal(str(price)) if price else None

    async def _save_usd_brl(self, rate: Decimal):
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == self.user.id)
        )
        user_settings = result.scalar_one_or_none()
        if user_settings:
            user_settings.usd_brl_rate = rate
            user_settings.rate_updated_at = datetime.now(timezone.utc)
        else:
            user_settings = UserSettings(
                user_id=self.user.id, usd_brl_rate=rate,
                rate_updated_at=datetime.now(timezone.utc),
            )
            self.db.add(user_settings)

    async def _get_usd_brl(self) -> Decimal | None:
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == self.user.id)
        )
        s = result.scalar_one_or_none()
        return s.usd_brl_rate if s else None

    async def _fetch_us_prices(self, assets: list[Asset], usd_brl_rate: Decimal | None) -> dict:
        results = {"updated": [], "failed": []}
        if not usd_brl_rate:
            usd_brl_rate = await self._get_usd_brl()
        if not usd_brl_rate:
            for a in assets:
                results["failed"].append({"ticker": a.ticker, "error": "No USD/BRL rate available"})
            return results

        # Batch fetch via yf.download
        tickers = [a.ticker for a in assets]
        loop = asyncio.get_event_loop()

        # Process in batches of 10
        for i in range(0, len(tickers), 10):
            batch = tickers[i : i + 10]
            try:
                data = await loop.run_in_executor(
                    None,
                    lambda b=batch: yf.download(b, period="1d", progress=False),
                )
                if data.empty:
                    for t in batch:
                        results["failed"].append({"ticker": t, "error": "No data returned"})
                    continue

                for asset in assets:
                    if asset.ticker not in batch:
                        continue
                    try:
                        if len(batch) == 1:
                            close = data["Close"].iloc[-1]
                        else:
                            close = data["Close"][asset.ticker].iloc[-1]
                        if close and not (hasattr(close, '__iter__') and len(close) == 0):
                            price_brl = Decimal(str(float(close))) * usd_brl_rate
                            asset.current_price = round(price_brl, 4)
                            asset.price_updated_at = datetime.now(timezone.utc)
                            results["updated"].append({"ticker": asset.ticker, "price": float(asset.current_price)})
                        else:
                            results["failed"].append({"ticker": asset.ticker, "error": "No close price"})
                    except Exception as e:
                        results["failed"].append({"ticker": asset.ticker, "error": str(e)})
            except Exception as e:
                for t in batch:
                    results["failed"].append({"ticker": t, "error": str(e)})

            # Rate limit between batches
            if i + 10 < len(tickers):
                await asyncio.sleep(2)

        return results

    async def _fetch_br_prices(self, assets: list[Asset]) -> dict:
        results = {"updated": [], "failed": []}
        tickers = [a.ticker for a in assets]
        ticker_map = {a.ticker: a for a in assets}

        # brapi supports batch: /api/quote/TICKER1,TICKER2,...
        # Process in batches of 20
        async with httpx.AsyncClient() as client:
            for i in range(0, len(tickers), 20):
                batch = tickers[i : i + 20]
                try:
                    tickers_str = ",".join(batch)
                    resp = await client.get(
                        f"https://brapi.dev/api/quote/{tickers_str}",
                        timeout=15,
                    )
                    data = resp.json()
                    if data.get("results"):
                        for item in data["results"]:
                            symbol = item.get("symbol", "")
                            price = item.get("regularMarketPrice")
                            if symbol in ticker_map and price:
                                asset = ticker_map[symbol]
                                asset.current_price = Decimal(str(price))
                                asset.price_updated_at = datetime.now(timezone.utc)
                                results["updated"].append({"ticker": symbol, "price": float(price)})
                            elif symbol in ticker_map:
                                results["failed"].append({"ticker": symbol, "error": "No price in response"})
                    else:
                        for t in batch:
                            results["failed"].append({"ticker": t, "error": "No results from brapi"})
                except Exception as e:
                    for t in batch:
                        results["failed"].append({"ticker": t, "error": str(e)})

        return results
