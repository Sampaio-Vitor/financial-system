from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, String, Date, DateTime, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FixedIncomeRedemption(Base):
    __tablename__ = "fixed_income_redemptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    fixed_income_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    redemption_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
