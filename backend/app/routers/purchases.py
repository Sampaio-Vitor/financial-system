from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.user import User
from app.schemas.purchase import PurchaseCreate, PurchaseUpdate, PurchaseResponse

router = APIRouter()


def _to_response(p: Purchase) -> PurchaseResponse:
    return PurchaseResponse(
        id=p.id,
        asset_id=p.asset_id,
        purchase_date=p.purchase_date,
        quantity=p.quantity,
        unit_price=p.unit_price,
        total_value=p.total_value,
        created_at=p.created_at,
        ticker=p.asset.ticker if p.asset else None,
        asset_type=p.asset.type if p.asset else None,
    )


@router.get("", response_model=list[PurchaseResponse])
async def list_purchases(
    asset_id: int | None = Query(None),
    asset_type: AssetType | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Purchase).join(Asset).where(Purchase.user_id == user.id).order_by(Purchase.purchase_date.desc())
    if asset_id:
        query = query.where(Purchase.asset_id == asset_id)
    if asset_type:
        query = query.where(Asset.type == asset_type)
    if date_from:
        query = query.where(Purchase.purchase_date >= date_from)
    if date_to:
        query = query.where(Purchase.purchase_date <= date_to)

    result = await db.execute(query)
    return [_to_response(p) for p in result.scalars().all()]


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    data: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = await db.execute(select(Asset).where(Asset.id == data.asset_id))
    if not asset.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Asset not found")

    total_value = data.quantity * data.unit_price
    purchase = Purchase(
        asset_id=data.asset_id,
        user_id=user.id,
        purchase_date=data.purchase_date,
        quantity=data.quantity,
        unit_price=data.unit_price,
        total_value=total_value,
    )
    db.add(purchase)
    await db.commit()

    result = await db.execute(select(Purchase).where(Purchase.id == purchase.id))
    return _to_response(result.scalar_one())


@router.put("/{purchase_id}", response_model=PurchaseResponse)
async def update_purchase(
    purchase_id: int,
    data: PurchaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id, Purchase.user_id == user.id)
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if data.purchase_date is not None:
        purchase.purchase_date = data.purchase_date
    if data.quantity is not None:
        purchase.quantity = data.quantity
    if data.unit_price is not None:
        purchase.unit_price = data.unit_price
    purchase.total_value = purchase.quantity * purchase.unit_price

    await db.commit()
    result = await db.execute(select(Purchase).where(Purchase.id == purchase.id))
    return _to_response(result.scalar_one())


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(
    purchase_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id, Purchase.user_id == user.id)
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    await db.delete(purchase)
    await db.commit()
