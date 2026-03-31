import re
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.dividend_event import DividendEvent
from app.models.transaction import Transaction

PROCEEDS_CATEGORY = "Proceeds interests and dividends"

_TICKER_RE = re.compile(r"\b([A-Z]{4,6}\d{1,2})\b")
_QUANTITY_TICKER_RE = re.compile(r"(?P<qty>\d+(?:[.,]\d+)?)\s+(?P<ticker>[A-Z]{4,6}\d{1,2})\s*$")


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _parse_decimal(value: str | None) -> Decimal | None:
    if not value:
        return None
    normalized = value.strip()
    if "." in normalized and "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def _extract_description(txn: Transaction) -> str:
    return _normalize_text(txn.description)


def _extract_source_category(txn: Transaction) -> str | None:
    if txn.pluggy_category:
        return txn.pluggy_category
    if txn.raw_data and isinstance(txn.raw_data, dict):
        category = txn.raw_data.get("category")
        return category if isinstance(category, str) else None
    return None


def is_dividend_candidate(txn: Transaction) -> bool:
    if txn.type.lower() != "credit":
        return False

    source_category = (_extract_source_category(txn) or "").upper()
    description = _extract_description(txn).upper()

    if source_category == PROCEEDS_CATEGORY.upper():
        return True

    keywords = (
        "CRED EVENTO B3",
        " PROV ",
        "DIVID",
        "JCP",
        "JUROS S/CAP",
        "JUROS SOBRE CAPITAL",
        "RENDIMENTO",
    )
    return any(keyword in description for keyword in keywords)


def _extract_ticker(description: str) -> str | None:
    match = _QUANTITY_TICKER_RE.search(description)
    if match:
        return match.group("ticker")

    matches = _TICKER_RE.findall(description)
    return matches[-1] if matches else None


def _extract_quantity(description: str) -> Decimal | None:
    match = _QUANTITY_TICKER_RE.search(description)
    if not match:
        return None
    return _parse_decimal(match.group("qty"))


def _extract_event_type(description: str) -> str:
    upper = description.upper()
    if "JCP" in upper or "JUROS S/CAP" in upper or "JUROS SOBRE CAPITAL" in upper:
        return "JCP"
    if "DIVID" in upper:
        return "DIVIDEND"
    if "RENDIMENTO" in upper:
        return "RENDIMENTO"
    return "UNKNOWN"


def _extract_confidence(source_category: str | None, description: str) -> str:
    upper = description.upper()
    if source_category == PROCEEDS_CATEGORY:
        return "high"
    if "CRED EVENTO B3" in upper and _extract_ticker(description):
        return "high"
    if _extract_ticker(description):
        return "medium"
    return "low"


async def _find_asset_id(db: AsyncSession, ticker: str | None) -> int | None:
    if not ticker:
        return None
    result = await db.execute(select(Asset.id).where(Asset.ticker == ticker))
    return result.scalar_one_or_none()


async def upsert_dividend_event_for_transaction(
    db: AsyncSession,
    txn: Transaction,
) -> DividendEvent | None:
    if not is_dividend_candidate(txn):
        return None

    description = _extract_description(txn)
    source_category = _extract_source_category(txn)
    ticker = _extract_ticker(description)
    quantity = _extract_quantity(description)
    asset_id = await _find_asset_id(db, ticker)
    amount_per_unit = None
    if quantity and quantity != 0:
        amount_per_unit = Decimal(txn.amount) / quantity

    result = await db.execute(
        select(DividendEvent).where(DividendEvent.transaction_id == txn.id)
    )
    event = result.scalar_one_or_none()
    if not event:
        event = DividendEvent(
            user_id=txn.user_id,
            transaction_id=txn.id,
        )
        db.add(event)

    event.asset_id = asset_id
    event.ticker = ticker
    event.event_type = _extract_event_type(description)
    event.credited_amount = txn.amount
    event.gross_amount = txn.amount
    event.withholding_tax = None
    event.quantity_base = quantity
    event.amount_per_unit = amount_per_unit
    event.payment_date = txn.date
    event.description = description
    event.source_category = source_category
    event.source_confidence = _extract_confidence(source_category, description)
    event.raw_data = txn.raw_data
    return event


async def backfill_dividend_events_for_account(
    db: AsyncSession,
    *,
    user_id: int,
    account_id: int,
) -> int:
    result = await db.execute(
        select(Transaction)
        .outerjoin(DividendEvent, DividendEvent.transaction_id == Transaction.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.account_id == account_id,
            Transaction.type == "credit",
            DividendEvent.id.is_(None),
        )
        .order_by(Transaction.date.asc(), Transaction.id.asc())
    )
    created = 0
    for txn in result.scalars().all():
        event = await upsert_dividend_event_for_transaction(db, txn)
        if event is not None:
            created += 1
    return created
