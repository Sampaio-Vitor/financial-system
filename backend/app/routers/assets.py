from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.user_asset import UserAsset
from app.models.user import User
from app.schemas.asset import (
    AssetCreate,
    AssetUpdate,
    AssetResponse,
    BulkAssetRequest,
    BulkAssetResponse,
    BulkAssetCreated,
    BulkAssetLinked,
    BulkAssetSkipped,
)

router = APIRouter()


def _to_response(asset: Asset, paused: bool) -> dict:
    return {
        "id": asset.id,
        "ticker": asset.ticker,
        "type": asset.type,
        "description": asset.description,
        "paused": paused,
        "current_price": asset.current_price,
        "price_updated_at": asset.price_updated_at,
        "created_at": asset.created_at,
    }


@router.get("", response_model=list[AssetResponse])
async def list_assets(
    type: AssetType | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Asset, UserAsset.paused)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(UserAsset.user_id == user.id)
        .order_by(Asset.type, Asset.ticker)
    )
    if type:
        query = query.where(Asset.type == type)
    result = await db.execute(query)
    return [_to_response(asset, paused) for asset, paused in result.all()]


@router.post("/bulk", response_model=BulkAssetResponse)
async def bulk_create_assets(
    data: BulkAssetRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
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

    # Check existing global assets in one query
    tickers = [t for t, _ in unique_items]
    result = await db.execute(select(Asset).where(Asset.ticker.in_(tickers)))
    existing_assets = {a.ticker: a for a in result.scalars().all()}

    # Check existing user links in one query
    if existing_assets:
        existing_ids = [a.id for a in existing_assets.values()]
        link_result = await db.execute(
            select(UserAsset.asset_id).where(
                UserAsset.user_id == user.id,
                UserAsset.asset_id.in_(existing_ids),
            )
        )
        linked_asset_ids = {row[0] for row in link_result.all()}
    else:
        linked_asset_ids = set()

    created: list[BulkAssetCreated] = []
    linked: list[BulkAssetLinked] = []
    skipped: list[BulkAssetSkipped] = []

    for ticker, asset_type in unique_items:
        if ticker in existing_assets:
            asset = existing_assets[ticker]
            if asset.id in linked_asset_ids:
                skipped.append(BulkAssetSkipped(ticker=ticker, reason="Já está no seu catálogo"))
            else:
                # Global exists, create user link
                db.add(UserAsset(user_id=user.id, asset_id=asset.id))
                linked_asset_ids.add(asset.id)
                linked.append(BulkAssetLinked(ticker=ticker, type=asset.type))
        else:
            # Create new global asset + user link
            asset = Asset(ticker=ticker, type=asset_type, description="")
            db.add(asset)
            await db.flush()  # get asset.id
            db.add(UserAsset(user_id=user.id, asset_id=asset.id))
            created.append(BulkAssetCreated(ticker=ticker, type=asset_type))

    for ticker in intra_dupes:
        skipped.append(BulkAssetSkipped(ticker=ticker, reason="Duplicado no CSV"))

    await db.commit()
    return BulkAssetResponse(created=created, linked=linked, skipped=skipped)


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset, UserAsset.paused)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(Asset.id == asset_id, UserAsset.user_id == user.id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset, paused = row
    return _to_response(asset, paused)


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticker = data.ticker.strip().upper()

    # Check if global asset exists
    result = await db.execute(select(Asset).where(Asset.ticker == ticker))
    asset = result.scalar_one_or_none()

    if asset:
        # Check if user already has a link
        link_result = await db.execute(
            select(UserAsset).where(
                UserAsset.user_id == user.id, UserAsset.asset_id == asset.id
            )
        )
        if link_result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Você já rastreia este ativo")
    else:
        # Create new global asset
        asset = Asset(ticker=ticker, type=data.type, description=data.description)
        db.add(asset)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            # Race condition: another request created the same ticker
            result = await db.execute(select(Asset).where(Asset.ticker == ticker))
            asset = result.scalar_one()

    # Create user link
    user_asset = UserAsset(user_id=user.id, asset_id=asset.id)
    db.add(user_asset)
    await db.commit()
    await db.refresh(asset)
    return _to_response(asset, False)


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: int,
    data: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Fetch asset + user link
    result = await db.execute(
        select(Asset, UserAsset)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(Asset.id == asset_id, UserAsset.user_id == user.id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")

    asset, user_asset = row

    # Update global fields
    if data.ticker is not None:
        asset.ticker = data.ticker.upper()
    if data.description is not None:
        asset.description = data.description

    # Update per-user field
    if data.paused is not None:
        user_asset.paused = data.paused

    await db.commit()
    await db.refresh(asset)
    return _to_response(asset, user_asset.paused)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Check user link exists
    result = await db.execute(
        select(UserAsset)
        .join(Asset, Asset.id == UserAsset.asset_id)
        .where(UserAsset.asset_id == asset_id, UserAsset.user_id == user.id)
    )
    user_asset = result.scalar_one_or_none()
    if not user_asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Get asset type to determine position check strategy
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = asset_result.scalar_one()

    if asset.type == AssetType.RF:
        # For RF: check if any fixed_income_positions exist
        pos_result = await db.execute(
            select(func.count())
            .select_from(FixedIncomePosition)
            .where(FixedIncomePosition.user_id == user.id, FixedIncomePosition.asset_id == asset_id)
        )
        count = pos_result.scalar()
        if count > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Não é possível remover: você possui {count} posição(ões) de renda fixa neste ativo",
            )
    else:
        # For STOCK/ACAO/FII: check sum(quantity) = 0
        pos_result = await db.execute(
            select(func.coalesce(func.sum(Purchase.quantity), 0)).where(
                Purchase.user_id == user.id, Purchase.asset_id == asset_id
            )
        )
        position = pos_result.scalar()
        if position != 0:
            qty = f"{float(position):g}"
            raise HTTPException(
                status_code=409,
                detail=f"Não é possível remover: sua posição atual é {qty}",
            )

    await db.delete(user_asset)
    await db.commit()
