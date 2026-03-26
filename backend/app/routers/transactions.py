from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.expenses import (
    TransactionListResponse,
    TransactionResponse,
    TransactionSummaryItem,
    TransactionSummaryResponse,
)

router = APIRouter()

# Categorias excluídas dos totais (não são despesas nem receitas reais)
EXCLUDED_CATEGORIES = {"Transferência interna"}


def _month_filter(year: int, month: int):
    """Return SQLAlchemy filter for a given year/month."""
    return and_(
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
    )


def _account_type_filter(account_type: str | None):
    """Return filter to restrict by account type (credit_card, checking, savings)."""
    if not account_type:
        return []
    account_ids_subq = (
        select(BankAccount.id).where(BankAccount.type == account_type).scalar_subquery()
    )
    return [Transaction.account_id.in_(account_ids_subq)]


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    category: Optional[str] = Query(None),
    account_type: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            _month_filter(year, month),
            *_account_type_filter(account_type),
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
    account_type: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_filter = and_(
        Transaction.user_id == user.id,
        _month_filter(year, month),
    )
    acct_filter = _account_type_filter(account_type)

    not_excluded = Transaction.category.notin_(EXCLUDED_CATEGORIES)

    # Category breakdown (debits only = expenses, excluding internal transfers)
    cat_query = (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
            func.count().label("count"),
        )
        .where(base_filter, Transaction.type == "debit", not_excluded, *acct_filter)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    cat_result = await db.execute(cat_query)
    categories = [
        TransactionSummaryItem(category=row.category, total=row.total, count=row.count)
        for row in cat_result.all()
    ]

    # Total expenses (debits, excluding internal transfers)
    expense_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        base_filter, Transaction.type == "debit", not_excluded, *acct_filter
    )
    total_expenses = (await db.execute(expense_query)).scalar() or Decimal("0")

    # Total income (credits, excluding internal transfers)
    income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        base_filter, Transaction.type == "credit", not_excluded, *acct_filter
    )
    total_income = (await db.execute(income_query)).scalar() or Decimal("0")

    return TransactionSummaryResponse(
        month=f"{year}-{month:02d}",
        total_expenses=total_expenses,
        total_income=total_income,
        categories=categories,
    )
