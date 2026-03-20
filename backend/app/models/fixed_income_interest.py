from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, String, Date, DateTime, Numeric, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FixedIncomeInterest(Base):
    __tablename__ = "fixed_income_interest"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    fixed_income_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    reference_month: Mapped[date] = mapped_column(Date, nullable=False)
    previous_balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    new_balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("fixed_income_id", "reference_month", name="uq_fi_interest_position_month"),
    )
