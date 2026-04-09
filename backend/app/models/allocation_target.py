from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, DateTime, Numeric, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.asset import AllocationBucket


class AllocationTarget(Base):
    __tablename__ = "allocation_targets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    allocation_bucket: Mapped[AllocationBucket] = mapped_column(Enum(AllocationBucket), nullable=False)
    target_pct: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
