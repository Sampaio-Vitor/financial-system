from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dividend_event import DividendEvent
from app.models.user import User
from app.schemas.dividend import DividendEventListResponse, DividendEventResponse

router = APIRouter()


def _to_response(event: DividendEvent) -> DividendEventResponse:
    return DividendEventResponse(
        id=event.id,
        transaction_id=event.transaction_id,
        asset_id=event.asset_id,
        ticker=event.ticker,
        asset_type=event.asset.type.value if event.asset else None,
        event_type=event.event_type,
        credited_amount=event.credited_amount,
        gross_amount=event.gross_amount,
        withholding_tax=event.withholding_tax,
        quantity_base=event.quantity_base,
        amount_per_unit=event.amount_per_unit,
        payment_date=event.payment_date,
        description=event.description,
        source_category=event.source_category,
        source_confidence=event.source_confidence,
        created_at=event.created_at,
    )


@router.get("", response_model=DividendEventListResponse)
async def list_dividend_events(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    ticker: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(DividendEvent)
        .where(DividendEvent.user_id == user.id)
        .order_by(DividendEvent.payment_date.desc(), DividendEvent.id.desc())
    )

    if year is not None:
        query = query.where(extract("year", DividendEvent.payment_date) == year)
    if month is not None:
        query = query.where(extract("month", DividendEvent.payment_date) == month)
    if ticker:
        query = query.where(DividendEvent.ticker == ticker.upper())
    if event_type:
        query = query.where(DividendEvent.event_type == event_type.upper())

    result = await db.execute(query)
    events = result.scalars().all()

    return DividendEventListResponse(
        events=[_to_response(event) for event in events],
        total_count=len(events),
    )
