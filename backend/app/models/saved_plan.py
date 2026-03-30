from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavedPlan(Base):
    __tablename__ = "saved_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(120))
    contribution: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    patrimonio_atual: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    patrimonio_pos_aporte: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    reserva_valor: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    reserva_target: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    reserva_gap: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_planned: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    class_breakdown_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    items: Mapped[list["SavedPlanItem"]] = relationship(
        "SavedPlanItem", back_populates="plan", cascade="all, delete-orphan", lazy="selectin"
    )


class SavedPlanItem(Base):
    __tablename__ = "saved_plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("saved_plans.id", ondelete="CASCADE"), index=True)
    ticker: Mapped[str] = mapped_column(String(20))
    asset_class: Mapped[str] = mapped_column(String(10))
    current_value: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    target_value: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    gap: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    amount_to_invest: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    amount_to_invest_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    is_reserve: Mapped[bool] = mapped_column(Boolean, default=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False)

    plan: Mapped["SavedPlan"] = relationship("SavedPlan", back_populates="items")
