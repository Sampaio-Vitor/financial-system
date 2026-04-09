from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.purchase import Purchase
from app.models.retirement_goal import RetirementGoal
from app.dependencies import get_current_user

router = APIRouter()


# --- Schemas ---


class RetirementGoalResponse(BaseModel):
    patrimonio_meta: float | None
    taxa_retirada: float
    rentabilidade_anual: float


class RetirementGoalUpdate(BaseModel):
    patrimonio_meta: float = Field(gt=0)
    taxa_retirada: float = Field(default=4.0, gt=0, le=100)
    rentabilidade_anual: float = Field(default=8.0, ge=0, le=100)


class RetirementOverview(BaseModel):
    # Goal settings
    patrimonio_meta: float | None
    taxa_retirada: float
    rentabilidade_anual: float
    # Computed
    patrimonio_atual: float
    renda_passiva_atual: float
    renda_passiva_meta: float
    progresso: float
    aporte_medio_mensal: float
    meses_com_aporte: int
    anos_para_meta: float | None  # null = unreachable in 50y


# --- Endpoints ---


@router.get("/goal", response_model=RetirementGoalResponse)
async def get_retirement_goal(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RetirementGoal).where(RetirementGoal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    return RetirementGoalResponse(
        patrimonio_meta=float(goal.patrimonio_meta) if goal else None,
        taxa_retirada=float(goal.taxa_retirada) if goal else 4.0,
        rentabilidade_anual=float(goal.rentabilidade_anual) if goal else 8.0,
    )


@router.put("/goal", response_model=RetirementGoalResponse)
async def set_retirement_goal(
    data: RetirementGoalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RetirementGoal).where(RetirementGoal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if goal:
        goal.patrimonio_meta = Decimal(str(data.patrimonio_meta))
        goal.taxa_retirada = Decimal(str(data.taxa_retirada))
        goal.rentabilidade_anual = Decimal(str(data.rentabilidade_anual))
    else:
        goal = RetirementGoal(
            user_id=user.id,
            patrimonio_meta=Decimal(str(data.patrimonio_meta)),
            taxa_retirada=Decimal(str(data.taxa_retirada)),
            rentabilidade_anual=Decimal(str(data.rentabilidade_anual)),
        )
        db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return RetirementGoalResponse(
        patrimonio_meta=float(goal.patrimonio_meta),
        taxa_retirada=float(goal.taxa_retirada),
        rentabilidade_anual=float(goal.rentabilidade_anual),
    )


@router.get("/overview", response_model=RetirementOverview)
async def get_retirement_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 1. Get goal settings
    result = await db.execute(
        select(RetirementGoal).where(RetirementGoal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()

    taxa_retirada = float(goal.taxa_retirada) / 100 if goal else 0.04
    rentabilidade = float(goal.rentabilidade_anual) / 100 if goal else 0.08
    patrimonio_meta = float(goal.patrimonio_meta) if goal else None

    # 2. Get current patrimonio
    from app.services.portfolio_service import get_class_values, get_reserve_for_date

    class_values = await get_class_values(db, user)
    reserva_entry = await get_reserve_for_date(db, user.id, date.today())
    reserva = reserva_entry.amount if reserva_entry else Decimal("0")
    patrimonio_atual = float(sum(class_values.values()) + reserva)

    # 3. Calculate average monthly contribution from purchase history
    result = await db.execute(
        select(
            func.sum(Purchase.total_value),
            func.min(Purchase.purchase_date),
            func.max(Purchase.purchase_date),
        )
        .where(Purchase.user_id == user.id, Purchase.quantity > 0)
    )
    row = result.one()
    total_invested = float(row[0]) if row[0] else 0
    first_date: date | None = row[1]
    last_date: date | None = row[2]

    if first_date and last_date:
        total_months = (last_date.year - first_date.year) * 12 + (last_date.month - first_date.month) + 1
        meses_com_aporte = max(total_months, 1)
        aporte_medio = total_invested / meses_com_aporte
    else:
        meses_com_aporte = 0
        aporte_medio = 0

    # 4. Calculate derived values
    renda_passiva_atual = patrimonio_atual * taxa_retirada / 12
    renda_passiva_meta = (patrimonio_meta * taxa_retirada / 12) if patrimonio_meta else 0
    progresso = (patrimonio_atual / patrimonio_meta * 100) if patrimonio_meta and patrimonio_meta > 0 else 0

    # 5. Project years to goal
    anos_para_meta = None
    if patrimonio_meta and patrimonio_meta > 0:
        if patrimonio_atual >= patrimonio_meta:
            anos_para_meta = 0.0
        elif aporte_medio > 0 or rentabilidade > 0:
            taxa_mensal = (1 + rentabilidade) ** (1 / 12) - 1
            p = patrimonio_atual
            for m in range(1, 601):  # 50 years max
                p = p * (1 + taxa_mensal) + aporte_medio
                if p >= patrimonio_meta:
                    anos_para_meta = round(m / 12, 1)
                    break

    return RetirementOverview(
        patrimonio_meta=patrimonio_meta,
        taxa_retirada=round(taxa_retirada * 100, 2),
        rentabilidade_anual=round(rentabilidade * 100, 2),
        patrimonio_atual=patrimonio_atual,
        renda_passiva_atual=round(renda_passiva_atual, 2),
        renda_passiva_meta=round(renda_passiva_meta, 2),
        progresso=round(progresso, 2),
        aporte_medio_mensal=round(aporte_medio, 2),
        meses_com_aporte=meses_com_aporte,
        anos_para_meta=anos_para_meta,
    )
