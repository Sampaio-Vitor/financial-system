from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.expenses import (
    TransactionListResponse,
    TransactionResponse,
    TransactionSummaryItem,
    TransactionSummaryResponse,
)

router = APIRouter()


def _month_filter(year: int, month: int):
    """Return SQLAlchemy filter for a given year/month."""
    return and_(
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
    )


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    category: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            _month_filter(year, month),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )

    if category:
        query = query.where(Transaction.category == category)

    result = await db.execute(query)
    transactions = result.scalars().all()

    return TransactionListResponse(
        transactions=[TransactionResponse.model_validate(t) for t in transactions],
        total_count=len(transactions),
    )


@router.get("/summary", response_model=TransactionSummaryResponse)
async def get_summary(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_filter = and_(
        Transaction.user_id == user.id,
        _month_filter(year, month),
    )

    # Category breakdown (debits only = expenses)
    cat_query = (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
            func.count().label("count"),
        )
        .where(base_filter, Transaction.type == "debit")
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    cat_result = await db.execute(cat_query)
    categories = [
        TransactionSummaryItem(category=row.category, total=row.total, count=row.count)
        for row in cat_result.all()
    ]

    # Total expenses (debits)
    expense_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        base_filter, Transaction.type == "debit"
    )
    total_expenses = (await db.execute(expense_query)).scalar() or Decimal("0")

    # Total income (credits)
    income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        base_filter, Transaction.type == "credit"
    )
    total_income = (await db.execute(income_query)).scalar() or Decimal("0")

    return TransactionSummaryResponse(
        month=f"{year}-{month:02d}",
        total_expenses=total_expenses,
        total_income=total_income,
        categories=categories,
    )
