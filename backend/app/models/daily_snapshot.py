from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, Date, DateTime, Numeric, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DailySnapshot(Base):
    __tablename__ = "daily_snapshots"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_snapshot_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_patrimonio: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_invested: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    pnl_pct: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=0)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
