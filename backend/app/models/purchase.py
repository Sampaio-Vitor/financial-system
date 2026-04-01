from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Date, DateTime, Numeric, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    trade_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price_native: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_value_native: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=Decimal("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    asset = relationship("Asset", lazy="joined")
