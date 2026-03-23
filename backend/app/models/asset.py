from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import String, DateTime, Numeric, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AssetType(str, PyEnum):
    STOCK = "STOCK"
    ACAO = "ACAO"
    FII = "FII"
    RF = "RF"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    current_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    price_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
