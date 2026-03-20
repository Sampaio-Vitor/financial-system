from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import ForeignKey, String, DateTime, Numeric, Integer, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MonthlySnapshot(Base):
    __tablename__ = "monthly_snapshots"
    __table_args__ = (
        UniqueConstraint("user_id", "month", name="uq_snapshot_user_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    total_patrimonio: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_invested: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    pnl_pct: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=0)
    aportes_do_mes: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    allocation_breakdown: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    asset_breakdown: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    daily_patrimonio: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
