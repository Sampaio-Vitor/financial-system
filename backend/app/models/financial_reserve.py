from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, String, DateTime, Numeric, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinancialReserveEntry(Base):
    __tablename__ = "financial_reserve_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class FinancialReserveTarget(Base):
    __tablename__ = "financial_reserve_targets"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
