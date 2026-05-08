from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.asset import AssetClass, Market


class AssetDailySnapshot(Base):
    __tablename__ = "asset_daily_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "asset_id", "date", name="uq_asset_daily_snapshot_user_asset_date"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    price_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    position_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=0
    )
    invested_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=0
    )
    asset_class: Mapped[Optional[AssetClass]] = mapped_column(
        Enum(AssetClass), nullable=True
    )
    market: Mapped[Optional[Market]] = mapped_column(Enum(Market), nullable=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
