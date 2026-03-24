from datetime import datetime, timezone

from sqlalchemy import ForeignKey, DateTime, Integer, LargeBinary, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PluggyCredentials(Base):
    __tablename__ = "pluggy_credentials"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    encrypted_client_id: Mapped[bytes] = mapped_column(LargeBinary(512), nullable=False)
    encrypted_client_secret: Mapped[bytes] = mapped_column(LargeBinary(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
