import calendar
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_interest import FixedIncomeInterest
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.user import User
from app.schemas.fixed_income import (
    FixedIncomeCreate,
    FixedIncomeUpdate,
    FixedIncomeResgate,
    FixedIncomeResponse,
    FixedIncomeRedemptionResponse,
    FixedIncomeInterestBulkCreate,
    FixedIncomeInterestResponse,
)

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
        quantity=fi.quantity,
        purchase_unit_price=fi.purchase_unit_price,
        maturity_date=fi.maturity_date,
        created_at=fi.created_at,
        updated_at=fi.updated_at,
        ticker=fi.asset.ticker if fi.asset else None,
    )


def _recalc_yield(fi: FixedIncomePosition) -> None:
    if fi.applied_value:
        fi.yield_value = fi.current_balance - fi.applied_value
        fi.yield_pct = fi.yield_value / fi.applied_value
    else:
        fi.yield_value = 0
        fi.yield_pct = 0


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
    asset_row = await db.execute(select(Asset).where(Asset.id == data.asset_id))
    asset = asset_row.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    quantity = None
    purchase_unit_price = data.purchase_unit_price
    current_balance = data.current_balance
    is_tesouro = bool(asset.td_kind)
    if is_tesouro:
        if not purchase_unit_price or purchase_unit_price <= 0:
            raise HTTPException(
                status_code=400,
                detail="Tesouro Direto exige PU na data da compra",
            )
        quantity = data.applied_value / purchase_unit_price
        if asset.current_price:
            current_balance = (quantity * asset.current_price).quantize(Decimal("0.0001"))
        else:
            current_balance = data.applied_value
    elif current_balance is None:
        current_balance = data.applied_value

    fi = FixedIncomePosition(
        asset_id=data.asset_id,
        user_id=user.id,
        description=data.description,
        start_date=data.start_date,
        applied_value=data.applied_value,
        current_balance=current_balance,
        yield_value=data.yield_value,
        yield_pct=data.yield_pct,
        quantity=quantity,
        purchase_unit_price=purchase_unit_price if is_tesouro else None,
        maturity_date=data.maturity_date,
    )
    if is_tesouro:
        _recalc_yield(fi)
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

    asset_row = await db.execute(select(Asset).where(Asset.id == fi.asset_id))
    asset = asset_row.scalar_one_or_none()
    is_tesouro = bool(asset and asset.td_kind)

    if data.description is not None:
        fi.description = data.description
    if data.applied_value is not None:
        fi.applied_value = data.applied_value
    if data.current_balance is not None and not is_tesouro:
        fi.current_balance = data.current_balance
    if data.yield_value is not None:
        fi.yield_value = data.yield_value
    if data.yield_pct is not None:
        fi.yield_pct = data.yield_pct
    if data.purchase_unit_price is not None:
        fi.purchase_unit_price = data.purchase_unit_price
    if data.maturity_date is not None:
        fi.maturity_date = data.maturity_date

    if is_tesouro and fi.purchase_unit_price and fi.purchase_unit_price > 0:
        fi.quantity = fi.applied_value / fi.purchase_unit_price
        if asset.current_price:
            fi.current_balance = (fi.quantity * asset.current_price).quantize(Decimal("0.0001"))

    if fi.applied_value and fi.current_balance:
        fi.yield_value = fi.current_balance - fi.applied_value
        fi.yield_pct = fi.yield_value / fi.applied_value if fi.applied_value else 0

    await db.commit()
    result = await db.execute(select(FixedIncomePosition).where(FixedIncomePosition.id == fi.id))
    return _to_response(result.scalar_one())


@router.post("/{fi_id}/resgate", response_model=FixedIncomeResponse | None)
async def resgate_fixed_income(
    fi_id: int,
    data: FixedIncomeResgate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomePosition).where(FixedIncomePosition.id == fi_id, FixedIncomePosition.user_id == user.id)
    )
    fi = result.scalar_one_or_none()
    if not fi:
        raise HTTPException(status_code=404, detail="Fixed income position not found")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor de resgate deve ser positivo")

    if data.amount > fi.current_balance:
        raise HTTPException(status_code=400, detail="Valor de resgate excede o saldo atual")

    # Record redemption history
    redemption = FixedIncomeRedemption(
        user_id=user.id,
        fixed_income_id=fi.id,
        ticker=fi.asset.ticker if fi.asset else "N/A",
        description=fi.description,
        redemption_date=data.redemption_date or date.today(),
        amount=data.amount,
    )
    db.add(redemption)

    if data.amount >= fi.current_balance:
        # Total redemption: delete position, orphan related records
        redemption.fixed_income_id = None
        # Orphan interest entries for this position
        interest_entries = await db.execute(
            select(FixedIncomeInterest).where(FixedIncomeInterest.fixed_income_id == fi.id)
        )
        for ie in interest_entries.scalars().all():
            ie.fixed_income_id = None
        await db.delete(fi)
        await db.commit()
        return None

    # Partial redemption
    ratio = data.amount / fi.current_balance
    fi.applied_value -= fi.applied_value * ratio
    fi.current_balance -= data.amount
    fi.yield_value = fi.current_balance - fi.applied_value
    fi.yield_pct = fi.yield_value / fi.applied_value if fi.applied_value else 0

    await db.commit()
    result = await db.execute(select(FixedIncomePosition).where(FixedIncomePosition.id == fi.id))
    return _to_response(result.scalar_one())


@router.get("/redemptions", response_model=list[FixedIncomeRedemptionResponse])
async def list_redemptions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomeRedemption)
        .where(FixedIncomeRedemption.user_id == user.id)
        .order_by(FixedIncomeRedemption.redemption_date.desc(), FixedIncomeRedemption.id.desc())
    )
    return result.scalars().all()


@router.delete("/redemptions/{redemption_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_redemption(
    redemption_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomeRedemption).where(
            FixedIncomeRedemption.id == redemption_id,
            FixedIncomeRedemption.user_id == user.id,
        )
    )
    redemption = result.scalar_one_or_none()
    if not redemption:
        raise HTTPException(status_code=404, detail="Redemption not found")

    # Reverse the effect on the position if it still exists
    if redemption.fixed_income_id is not None:
        fi_result = await db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.id == redemption.fixed_income_id,
                FixedIncomePosition.user_id == user.id,
            )
        )
        fi = fi_result.scalar_one_or_none()
        if fi:
            old_balance = fi.current_balance
            fi.current_balance += redemption.amount
            if old_balance > 0:
                fi.applied_value = fi.applied_value * fi.current_balance / old_balance
            fi.yield_value = fi.current_balance - fi.applied_value
            fi.yield_pct = fi.yield_value / fi.applied_value if fi.applied_value else 0

    await db.delete(redemption)
    await db.commit()


@router.post("/interest", response_model=list[FixedIncomeInterestResponse], status_code=status.HTTP_201_CREATED)
async def bulk_register_interest(
    data: FixedIncomeInterestBulkCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Parse reference_month string to last day of month
    try:
        year, month = int(data.reference_month[:4]), int(data.reference_month[5:7])
        last_day = calendar.monthrange(year, month)[1]
        ref_date = date(year, month, last_day)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Formato de mes invalido. Use YYYY-MM")

    results = []
    for entry in data.entries:
        # Fetch position and validate ownership
        fi_result = await db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.id == entry.fixed_income_id,
                FixedIncomePosition.user_id == user.id,
            )
        )
        fi = fi_result.scalar_one_or_none()
        if not fi:
            raise HTTPException(
                status_code=404,
                detail=f"Posicao {entry.fixed_income_id} nao encontrada",
            )

        # Compute previous_balance from the most recent interest entry before ref_date
        prev_result = await db.execute(
            select(FixedIncomeInterest)
            .where(
                FixedIncomeInterest.fixed_income_id == fi.id,
                FixedIncomeInterest.reference_month < ref_date,
            )
            .order_by(FixedIncomeInterest.reference_month.desc())
            .limit(1)
        )
        prev_entry = prev_result.scalar_one_or_none()
        previous_balance = prev_entry.new_balance if prev_entry else fi.applied_value

        interest_amount = entry.new_balance - previous_balance

        # Skip zero-change entries
        if interest_amount == 0:
            continue

        # Check for existing entry (upsert)
        existing_result = await db.execute(
            select(FixedIncomeInterest).where(
                FixedIncomeInterest.fixed_income_id == fi.id,
                FixedIncomeInterest.reference_month == ref_date,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            # Update existing entry
            existing.previous_balance = previous_balance
            existing.new_balance = entry.new_balance
            existing.interest_amount = interest_amount
            interest_record = existing
        else:
            # Create new entry
            interest_record = FixedIncomeInterest(
                user_id=user.id,
                fixed_income_id=fi.id,
                ticker=fi.asset.ticker if fi.asset else "N/A",
                description=fi.description,
                reference_month=ref_date,
                previous_balance=previous_balance,
                new_balance=entry.new_balance,
                interest_amount=interest_amount,
            )
            db.add(interest_record)

        # Forward cascade: update the next entry's previous_balance if it exists
        next_result = await db.execute(
            select(FixedIncomeInterest)
            .where(
                FixedIncomeInterest.fixed_income_id == fi.id,
                FixedIncomeInterest.reference_month > ref_date,
            )
            .order_by(FixedIncomeInterest.reference_month.asc())
            .limit(1)
        )
        next_entry = next_result.scalar_one_or_none()
        if next_entry:
            next_entry.previous_balance = entry.new_balance
            next_entry.interest_amount = next_entry.new_balance - entry.new_balance

        # Only update position balance if no later interest entry exists
        if not next_entry:
            fi.current_balance = entry.new_balance
            fi.yield_value = fi.current_balance - fi.applied_value
            fi.yield_pct = fi.yield_value / fi.applied_value if fi.applied_value else 0

        results.append(interest_record)

    await db.commit()

    # Refresh to get generated IDs
    for r in results:
        await db.refresh(r)

    return results


@router.get("/interest", response_model=list[FixedIncomeInterestResponse])
async def list_interest(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomeInterest)
        .where(FixedIncomeInterest.user_id == user.id)
        .order_by(FixedIncomeInterest.reference_month.desc(), FixedIncomeInterest.id.desc())
    )
    return result.scalars().all()


@router.delete("/interest/{interest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interest(
    interest_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedIncomeInterest).where(
            FixedIncomeInterest.id == interest_id,
            FixedIncomeInterest.user_id == user.id,
        )
    )
    interest = result.scalar_one_or_none()
    if not interest:
        raise HTTPException(status_code=404, detail="Registro de juros nao encontrado")

    # If position still exists, validate and revert
    if interest.fixed_income_id is not None:
        # Check this is the most recent entry for the position
        latest_result = await db.execute(
            select(FixedIncomeInterest)
            .where(
                FixedIncomeInterest.fixed_income_id == interest.fixed_income_id,
                FixedIncomeInterest.user_id == user.id,
            )
            .order_by(FixedIncomeInterest.reference_month.desc())
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()
        if latest and latest.id != interest.id:
            raise HTTPException(
                status_code=400,
                detail="Apenas o registro de juros mais recente pode ser removido",
            )

        # Check no redemptions exist after this interest date
        redemption_after = await db.execute(
            select(FixedIncomeRedemption)
            .where(
                FixedIncomeRedemption.fixed_income_id == interest.fixed_income_id,
                FixedIncomeRedemption.redemption_date > interest.reference_month,
            )
            .limit(1)
        )
        if redemption_after.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Nao e possivel remover juros com resgates posteriores",
            )

        # Revert position balance
        fi_result = await db.execute(
            select(FixedIncomePosition).where(
                FixedIncomePosition.id == interest.fixed_income_id,
                FixedIncomePosition.user_id == user.id,
            )
        )
        fi = fi_result.scalar_one_or_none()
        if fi:
            fi.current_balance = interest.previous_balance
            fi.yield_value = fi.current_balance - fi.applied_value
            fi.yield_pct = fi.yield_value / fi.applied_value if fi.applied_value else 0

    await db.delete(interest)
    await db.commit()


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

    interest_entries = await db.execute(
        select(FixedIncomeInterest).where(FixedIncomeInterest.fixed_income_id == fi.id)
    )
    for ie in interest_entries.scalars().all():
        await db.delete(ie)

    redemption_entries = await db.execute(
        select(FixedIncomeRedemption).where(FixedIncomeRedemption.fixed_income_id == fi.id)
    )
    for re in redemption_entries.scalars().all():
        await db.delete(re)

    await db.delete(fi)
    await db.commit()
