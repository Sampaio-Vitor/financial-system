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
from app.models.asset import CurrencyCode


class AssetPriceHistory(Base):
    __tablename__ = "asset_price_history"
    __table_args__ = (
        UniqueConstraint("asset_id", "date", name="uq_asset_price_history_asset_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id"), nullable=False, index=True
    )
    yf_ticker: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    price_native: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    low_native: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    high_native: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    fx_rate_to_brl: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    price_brl: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    low_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    high_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    quote_currency: Mapped[CurrencyCode] = mapped_column(Enum(CurrencyCode), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="yfinance")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
