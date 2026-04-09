from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RetirementGoal(Base):
    __tablename__ = "retirement_goals"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    patrimonio_meta: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    taxa_retirada: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("4.00"))
    rentabilidade_anual: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("8.00"))
