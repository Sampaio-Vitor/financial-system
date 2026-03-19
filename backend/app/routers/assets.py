from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.schemas.asset import AssetCreate, AssetUpdate, AssetResponse

router = APIRouter()


@router.get("", response_model=list[AssetResponse])
async def list_assets(
    type: AssetType | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(Asset).order_by(Asset.type, Asset.ticker)
    if type:
        query = query.where(Asset.type == type)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    existing = await db.execute(select(Asset).where(Asset.ticker == data.ticker.upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Asset with ticker '{data.ticker}' already exists")

    asset = Asset(ticker=data.ticker.upper(), type=data.type, description=data.description)
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: int,
    data: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if data.ticker is not None:
        asset.ticker = data.ticker.upper()
    if data.description is not None:
        asset.description = data.description

    await db.commit()
    await db.refresh(asset)
    return asset
