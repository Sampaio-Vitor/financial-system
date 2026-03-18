from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, String, Date, DateTime, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FixedIncomePosition(Base):
    __tablename__ = "fixed_income_positions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    applied_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    yield_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    yield_pct: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False, default=0)
    maturity_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    asset = relationship("Asset", lazy="joined")
