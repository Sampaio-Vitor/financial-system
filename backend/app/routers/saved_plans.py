from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.saved_plan import SavedPlan, SavedPlanItem
from app.models.user import User
from app.schemas.saved_plan import (
    SavePlanRequest,
    SavedPlanOut,
    SavedPlanSummary,
    UpdateChecksRequest,
)

router = APIRouter()


async def _get_plan_with_items(
    db: AsyncSession,
    user_id: int,
    plan_id: int,
) -> SavedPlan:
    stmt = (
        select(SavedPlan)
        .options(selectinload(SavedPlan.items))
        .where(SavedPlan.id == plan_id, SavedPlan.user_id == user_id)
    )
    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return plan


@router.post("", response_model=SavedPlanOut, status_code=201)
async def create_saved_plan(
    body: SavePlanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = SavedPlan(
        user_id=user.id,
        label=body.label,
        contribution=body.contribution,
        patrimonio_atual=body.patrimonio_atual,
        patrimonio_pos_aporte=body.patrimonio_pos_aporte,
        reserva_valor=body.reserva_valor,
        reserva_target=body.reserva_target,
        reserva_gap=body.reserva_gap,
        total_planned=body.total_planned,
        class_breakdown_json=body.class_breakdown_json,
    )
    for item in body.items:
        plan.items.append(
            SavedPlanItem(
                ticker=item.ticker,
                asset_class=item.asset_class,
                current_value=item.current_value,
                target_value=item.target_value,
                gap=item.gap,
                amount_to_invest=item.amount_to_invest,
                amount_to_invest_usd=item.amount_to_invest_usd,
                amount_to_invest_native=item.amount_to_invest_native,
                quote_currency=item.quote_currency,
                is_reserve=item.is_reserve,
            )
        )
    db.add(plan)
    await db.commit()
    return await _get_plan_with_items(db, user.id, plan.id)


@router.get("", response_model=list[SavedPlanSummary])
async def list_saved_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(
            SavedPlan.id,
            SavedPlan.label,
            SavedPlan.contribution,
            func.coalesce(func.sum(SavedPlanItem.amount_to_invest), SavedPlan.total_planned).label("total_planned"),
            SavedPlan.created_at,
            func.count(SavedPlanItem.id).label("items_count"),
            func.sum(func.IF(SavedPlanItem.checked, 1, 0)).label("checked_count"),
            func.coalesce(func.sum(func.IF(SavedPlanItem.checked, SavedPlanItem.amount_to_invest, 0)), 0).label("checked_amount"),
        )
        .outerjoin(SavedPlanItem, SavedPlanItem.plan_id == SavedPlan.id)
        .where(SavedPlan.user_id == user.id)
        .group_by(SavedPlan.id)
        .order_by(SavedPlan.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        SavedPlanSummary(
            id=r.id,
            label=r.label,
            contribution=r.contribution,
            total_planned=r.total_planned,
            created_at=r.created_at,
            items_count=r.items_count,
            checked_count=int(r.checked_count or 0),
            checked_amount=r.checked_amount or 0,
        )
        for r in rows
    ]


@router.get("/{plan_id}", response_model=SavedPlanOut)
async def get_saved_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _get_plan_with_items(db, user.id, plan_id)


@router.put("/{plan_id}/checks", response_model=SavedPlanOut)
async def update_checks(
    plan_id: int,
    body: UpdateChecksRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = await _get_plan_with_items(db, user.id, plan_id)

    checked_set = set(body.checked_item_ids)
    for item in plan.items:
        item.checked = item.id in checked_set

    await db.commit()
    return await _get_plan_with_items(db, user.id, plan_id)


@router.delete("/{plan_id}", status_code=204)
async def delete_saved_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = await _get_plan_with_items(db, user.id, plan_id)
    await db.delete(plan)
    await db.commit()
