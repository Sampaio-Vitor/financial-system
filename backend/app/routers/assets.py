from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.schemas.asset import (
    AssetCreate,
    AssetUpdate,
    AssetResponse,
    BulkAssetRequest,
    BulkAssetResponse,
    BulkAssetCreated,
    BulkAssetSkipped,
)

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


@router.post("/bulk", response_model=BulkAssetResponse)
async def bulk_create_assets(
    data: BulkAssetRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    # Normalize tickers
    items = [(item.ticker.strip().upper(), item.type) for item in data.assets]

    # Deduplicate within request (keep first occurrence)
    seen: set[str] = set()
    unique_items: list[tuple[str, AssetType]] = []
    intra_dupes: list[str] = []
    for ticker, asset_type in items:
        if ticker in seen:
            intra_dupes.append(ticker)
        else:
            seen.add(ticker)
            unique_items.append((ticker, asset_type))

    # Check existing tickers in one query
    tickers = [t for t, _ in unique_items]
    result = await db.execute(select(Asset.ticker).where(Asset.ticker.in_(tickers)))
    existing = {row[0] for row in result.all()}

    created: list[BulkAssetCreated] = []
    skipped: list[BulkAssetSkipped] = []

    for ticker, asset_type in unique_items:
        if ticker in existing:
            skipped.append(BulkAssetSkipped(ticker=ticker, reason="Já existe no catálogo"))
        else:
            asset = Asset(ticker=ticker, type=asset_type, description="")
            db.add(asset)
            created.append(BulkAssetCreated(ticker=ticker, type=asset_type))

    for ticker in intra_dupes:
        skipped.append(BulkAssetSkipped(ticker=ticker, reason="Duplicado no CSV"))

    await db.commit()
    return BulkAssetResponse(created=created, skipped=skipped)


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
