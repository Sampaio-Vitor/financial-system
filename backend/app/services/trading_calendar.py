from datetime import date, timedelta
import logging

from app.models.asset import Market

logger = logging.getLogger(__name__)

MARKET_CALENDARS: dict[Market, str] = {
    Market.US: "NYSE",
    Market.BR: "B3",
}


def _previous_weekday(day: date) -> date:
    cursor = day
    while cursor.weekday() >= 5:
        cursor -= timedelta(days=1)
    return cursor


def last_trading_day(market: Market | None, on_or_before: date) -> date:
    """Return the latest market session date on or before the given date.

    Uses exchange calendars when available and falls back to weekends-only logic
    so price fetching never targets Saturday/Sunday even in degraded environments.
    """
    calendar_name = MARKET_CALENDARS.get(market) if market is not None else None
    if not calendar_name:
        return _previous_weekday(on_or_before)

    try:
        import pandas_market_calendars as mcal
    except ImportError:
        logger.warning(
            "pandas_market_calendars is not installed; using weekday fallback"
        )
        return _previous_weekday(on_or_before)

    start = on_or_before - timedelta(days=14)
    try:
        schedule = mcal.get_calendar(calendar_name).schedule(
            start_date=start.isoformat(),
            end_date=on_or_before.isoformat(),
        )
    except Exception:
        logger.warning(
            "Failed to load market calendar %s; using weekday fallback",
            calendar_name,
            exc_info=True,
        )
        return _previous_weekday(on_or_before)

    if schedule.empty:
        return _previous_weekday(on_or_before)
    return schedule.index[-1].date()
