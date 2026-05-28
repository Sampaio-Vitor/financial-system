from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DividendEvent(Base):
    __tablename__ = "dividend_events"
    __table_args__ = (
        UniqueConstraint("transaction_id", name="uq_dividend_event_transaction"),
        UniqueConstraint(
            "user_id",
            "asset_id",
            "source",
            "source_event_key",
            name="uq_dividend_event_source_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    transaction_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    asset_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("assets.id"), nullable=True, index=True
    )
    ticker: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UNKNOWN"
    )
    credited_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    gross_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    withholding_tax: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    quantity_base: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 8), nullable=True
    )
    amount_per_unit: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 8), nullable=True
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="BANK_TRANSACTION", index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="CONFIRMED", index=True
    )
    source_event_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ex_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    declared_currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    amount_per_unit_native: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 8), nullable=True
    )
    gross_amount_native: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    withholding_tax_native: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    credited_amount_native: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    fx_rate_to_brl: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    source_category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_confidence: Mapped[str] = mapped_column(
        String(10), nullable=False, default="low"
    )
    raw_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    transaction = relationship("Transaction", lazy="joined")
    asset = relationship("Asset", lazy="joined")
