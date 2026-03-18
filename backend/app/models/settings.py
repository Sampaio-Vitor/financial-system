from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, DateTime, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    usd_brl_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=5.0)
    rate_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
