from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PurchasePriceAnomalyIgnore(Base):
    __tablename__ = "purchase_price_anomaly_ignores"
    __table_args__ = (
        UniqueConstraint("purchase_id", name="uq_purchase_price_anomaly_ignore_purchase"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    purchase_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    ignored_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
