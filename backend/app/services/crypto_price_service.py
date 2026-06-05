"""Crypto price fetching via CoinGecko free API (no key required).

Supports:
- Current price: simple/price endpoint
- Historical daily closes: market_chart/range endpoint

CoinGecko identifies assets by coingecko_id (e.g. 'bitcoin'), not by ticker.
The mapping is stored on the Asset's price_symbol field.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.coingecko.com/api/v3"
_TIMEOUT = 10.0
_MIN_INTER_CALL_SLEEP = 1.5  # CoinGecko free API rate limit


def _datetime_to_unix_millis(dt: datetime | date) -> int:
    """Convert datetime or date to Unix timestamp in milliseconds."""
    if isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


async def _fetch_json(client: httpx.AsyncClient, url: str) -> dict | None:
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("CoinGecko fetch failed for %s: %s", url, exc)
        return None


async def fetch_current_price_brl(coingecko_id: str) -> Decimal | None:
    """Fetch the current BTC/BRL price from CoinGecko. Returns None on failure."""
    url = f"{_BASE_URL}/simple/price?ids={coingecko_id}&vs_currencies=brl"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _fetch_json(client, url)
    if not data:
        return None
    price = data.get(coingecko_id, {}).get("brl")
    if price is None:
        logger.warning("CoinGecko returned no brl price for %s", coingecko_id)
        return None
    try:
        return Decimal(str(price))
    except (ValueError, ArithmeticError) as exc:
        logger.warning("CoinGecko invalid price for %s: %r (%s)", coingecko_id, price, exc)
        return None


async def fetch_historical_prices_brl(
    coingecko_id: str, start_date: date, end_date: date
) -> dict[date, Decimal]:
    """Fetch daily BRL close prices for a date range from CoinGecko.

    Returns a dict of date → closing price (Decimal). Missing dates were not
    returned by the API. The free API returns hourly granularity for short ranges
    and gradually lower resolution for longer ranges. Callers should treat dates
    not in the result as unavailable.
    """
    # CoinGecko's to parameter can exclude the end date when data is
    # intraday-incomplete. Extend by 1 day to ensure end_date rows are included.
    query_end = end_date + timedelta(days=1)
    url = (
        f"{_BASE_URL}/coins/{coingecko_id}/market_chart/range"
        f"?vs_currency=brl"
        f"&from={_datetime_to_unix_millis(start_date)}"
        f"&to={_datetime_to_unix_millis(query_end)}"
    )
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _fetch_json(client, url)
    if not data:
        return {}

    prices: list[tuple[int, float]] = data.get("prices", [])
    if not prices:
        return {}

    # Group by day, taking the last price per day as close
    daily_prices: dict[date, Decimal] = {}
    for ts_ms, price in prices:
        if price <= 0:
            continue
        dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
        quote_date = dt.date()
        if start_date <= quote_date <= end_date:
            daily_prices[quote_date] = Decimal(str(round(price, 6)))

    return daily_prices
