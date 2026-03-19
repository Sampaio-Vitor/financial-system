import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetType
from app.models.settings import UserSettings
from app.models.user import User


def _extract_close(data, yf_ticker: str) -> float | None:
    """Extract closing price from yfinance DataFrame (always MultiIndex columns)."""
    try:
        val = data["Close"][yf_ticker].iloc[-1]
        close = float(val)
        return close if close and close > 0 else None
    except Exception:
        return None


class PriceService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def update_all_prices(self) -> dict:
        results = {"updated": [], "failed": [], "usd_brl_rate": None}

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
        assets = asset_result.scalars().all()

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

    async def fetch_single_price(self, asset: Asset) -> Decimal | None:
        """Fetch price for a single newly added asset."""
        try:
            loop = asyncio.get_event_loop()
            if asset.type == AssetType.STOCK:
                rate = await self._get_usd_brl()
                yf_ticker = asset.ticker
                data = await loop.run_in_executor(
                    None, lambda: yf.download(yf_ticker, period="1d", progress=False)
                )
                close = _extract_close(data, yf_ticker) if not data.empty else None
                if close and rate:
                    price_brl = Decimal(str(close)) * rate
                    asset.current_price = round(price_brl, 4)
                    asset.price_updated_at = datetime.now(timezone.utc)
                    return asset.current_price
            elif asset.type in (AssetType.ACAO, AssetType.FII):
                yf_ticker = f"{asset.ticker}.SA"
                data = await loop.run_in_executor(
                    None, lambda: yf.download(yf_ticker, period="1d", progress=False)
                )
                close = _extract_close(data, yf_ticker) if not data.empty else None
                if close:
                    asset.current_price = Decimal(str(close))
                    asset.price_updated_at = datetime.now(timezone.utc)
                    return asset.current_price
        except Exception:
            pass
        return None

    async def _fetch_usd_brl(self) -> Decimal | None:
        """Fetch USD/BRL exchange rate via yfinance."""
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None, lambda: yf.download("USDBRL=X", period="1d", progress=False)
        )
        if not data.empty:
            close = _extract_close(data, "USDBRL=X")
            if close:
                return Decimal(str(close))
        return None

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
        loop = asyncio.get_event_loop()

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
        loop = asyncio.get_event_loop()
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
            loop = asyncio.get_event_loop()
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
                    pass

                if i + 10 < len(yf_tickers):
                    await asyncio.sleep(2)

        return prices
