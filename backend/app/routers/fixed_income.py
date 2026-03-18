from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset
from app.models.fixed_income import FixedIncomePosition
from app.models.user import User
from app.schemas.fixed_income import FixedIncomeCreate, FixedIncomeUpdate, FixedIncomeResponse

router = APIRouter()


def _to_response(fi: FixedIncomePosition) -> FixedIncomeResponse:
    return FixedIncomeResponse(
        id=fi.id,
        asset_id=fi.asset_id,
        description=fi.description,
        start_date=fi.start_date,
        applied_value=fi.applied_value,
        current_balance=fi.current_balance,
        yield_value=fi.yield_value,
        yield_pct=fi.yield_pct,
        maturity_date=fi.maturity_date,
        created_at=fi.created_at,
        updated_at=fi.updated_at,
        ticker=fi.asset.ticker if fi.asset else None,
    )


@router.get("", response_model=list[FixedIncomeResponse])
async def list_fixed_income(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomePosition)
        .where(FixedIncomePosition.user_id == user.id)
        .order_by(FixedIncomePosition.start_date.desc())
    )
    return [_to_response(fi) for fi in result.scalars().all()]


@router.post("", response_model=FixedIncomeResponse, status_code=status.HTTP_201_CREATED)
async def create_fixed_income(
    data: FixedIncomeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = await db.execute(select(Asset).where(Asset.id == data.asset_id))
    if not asset.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Asset not found")

    fi = FixedIncomePosition(
        asset_id=data.asset_id,
        user_id=user.id,
        description=data.description,
        start_date=data.start_date,
        applied_value=data.applied_value,
        current_balance=data.current_balance,
        yield_value=data.yield_value,
        yield_pct=data.yield_pct,
        maturity_date=data.maturity_date,
    )
    db.add(fi)
    await db.commit()

    result = await db.execute(select(FixedIncomePosition).where(FixedIncomePosition.id == fi.id))
    return _to_response(result.scalar_one())


@router.put("/{fi_id}", response_model=FixedIncomeResponse)
async def update_fixed_income(
    fi_id: int,
    data: FixedIncomeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomePosition).where(FixedIncomePosition.id == fi_id, FixedIncomePosition.user_id == user.id)
    )
    fi = result.scalar_one_or_none()
    if not fi:
        raise HTTPException(status_code=404, detail="Fixed income position not found")

    if data.description is not None:
        fi.description = data.description
    if data.current_balance is not None:
        fi.current_balance = data.current_balance
    if data.yield_value is not None:
        fi.yield_value = data.yield_value
    if data.yield_pct is not None:
        fi.yield_pct = data.yield_pct
    if data.maturity_date is not None:
        fi.maturity_date = data.maturity_date

    await db.commit()
    result = await db.execute(select(FixedIncomePosition).where(FixedIncomePosition.id == fi.id))
    return _to_response(result.scalar_one())


@router.delete("/{fi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fixed_income(
    fi_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomePosition).where(FixedIncomePosition.id == fi_id, FixedIncomePosition.user_id == user.id)
    )
    fi = result.scalar_one_or_none()
    if not fi:
        raise HTTPException(status_code=404, detail="Fixed income position not found")

    await db.delete(fi)
    await db.commit()
