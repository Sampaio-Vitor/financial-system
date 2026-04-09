import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

import yfinance as yf
from decimal import Decimal

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import (
    AllocationBucket,
    Asset,
    AssetClass,
    AssetType,
    CurrencyCode,
    Market,
    asset_bucket_for,
    legacy_type_for,
    resolve_asset_metadata,
)
from app.models.allocation_target import AllocationTarget
from app.models.purchase import Purchase
from app.models.fixed_income import FixedIncomePosition
from app.models.user_asset import UserAsset
from app.models.user import User
from app.services.portfolio_service import get_bucket_values
from app.schemas.asset import (
    AssetCreate,
    AssetUpdate,
    AssetResponse,
    AssetRebalancingInfo,
    BulkAssetRequest,
    BulkAssetResponse,
    BulkAssetCreated,
    BulkAssetLinked,
    BulkAssetSkipped,
)

router = APIRouter()


def _validate_asset_shape(
    asset_class: AssetClass,
    market: Market,
    quote_currency: CurrencyCode,
) -> None:
    valid = {
        AssetClass.STOCK: {
            Market.BR: {CurrencyCode.BRL},
            Market.US: {CurrencyCode.USD},
        },
        AssetClass.ETF: {
            Market.BR: {CurrencyCode.BRL},
            Market.US: {CurrencyCode.USD},
            Market.EU: {CurrencyCode.USD, CurrencyCode.EUR, CurrencyCode.GBP},
            Market.UK: {CurrencyCode.USD, CurrencyCode.EUR, CurrencyCode.GBP},
        },
        AssetClass.FII: {
            Market.BR: {CurrencyCode.BRL},
        },
        AssetClass.RF: {
            Market.BR: {CurrencyCode.BRL},
        },
    }
    if quote_currency not in valid.get(asset_class, {}).get(market, set()):
        raise HTTPException(
            status_code=422,
            detail="Combinacao invalida de asset_class, market e quote_currency",
        )


def _resolve_payload_classification(
    data: AssetCreate | AssetUpdate,
) -> tuple[AssetType, AssetClass | None, Market | None, CurrencyCode | None]:
    if (
        data.asset_class is not None
        or data.market is not None
        or data.quote_currency is not None
    ):
        if (
            data.asset_class is None
            or data.market is None
            or data.quote_currency is None
        ):
            raise HTTPException(
                status_code=422,
                detail="asset_class, market e quote_currency devem ser informados juntos",
            )
        _validate_asset_shape(data.asset_class, data.market, data.quote_currency)
        return (
            legacy_type_for(data.asset_class, data.market),
            data.asset_class,
            data.market,
            data.quote_currency,
        )

    if isinstance(data, AssetCreate) and data.type is not None:
        asset_class, market, quote_currency = resolve_asset_metadata(
            legacy_type=data.type,
            asset_class=None,
            market=None,
            quote_currency=None,
        )
        return data.type, asset_class, market, quote_currency

    return None, None, None, None


def _to_response(asset: Asset, paused: bool) -> dict:
    return {
        "id": asset.id,
        "ticker": asset.ticker,
        "type": asset.type,
        "asset_class": asset.asset_class,
        "market": asset.market,
        "quote_currency": asset.quote_currency,
        "description": asset.description,
        "paused": paused,
        "price_symbol": asset.price_symbol,
        "current_price": asset.current_price,
        "current_price_native": asset.current_price_native,
        "fx_rate_to_brl": asset.fx_rate_to_brl,
        "price_updated_at": asset.price_updated_at,
        "created_at": asset.created_at,
    }


def _asset_metadata_matches(
    asset: Asset,
    asset_class: AssetClass | None,
    market: Market | None,
    quote_currency: CurrencyCode | None,
) -> bool:
    existing_class, existing_market, existing_currency = resolve_asset_metadata(
        legacy_type=asset.type,
        asset_class=asset.asset_class,
        market=asset.market,
        quote_currency=asset.quote_currency,
    )
    return (
        existing_class == asset_class
        and existing_market == market
        and existing_currency == quote_currency
    )


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
    normalized_items = []
    for item in data.assets:
        ticker = item.ticker.strip().upper()
        asset_type, asset_class, market, quote_currency = (
            _resolve_payload_classification(item)
        )
        normalized_items.append(
            (
                ticker,
                asset_type,
                asset_class,
                market,
                quote_currency,
                item.price_symbol,
            )
        )

    # Deduplicate within request (keep first occurrence)
    seen: set[str] = set()
    unique_items: list[
        tuple[
            str,
            AssetType,
            AssetClass | None,
            Market | None,
            CurrencyCode | None,
            str | None,
        ]
    ] = []
    intra_dupes: list[str] = []
    for (
        ticker,
        asset_type,
        asset_class,
        market,
        quote_currency,
        price_symbol,
    ) in normalized_items:
        if ticker in seen:
            intra_dupes.append(ticker)
        else:
            seen.add(ticker)
            unique_items.append(
                (ticker, asset_type, asset_class, market, quote_currency, price_symbol)
            )

    # Check existing global assets in one query
    tickers = [t for t, *_ in unique_items]
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

    for (
        ticker,
        asset_type,
        asset_class,
        market,
        quote_currency,
        price_symbol,
    ) in unique_items:
        if ticker in existing_assets:
            asset = existing_assets[ticker]
            existing_class, existing_market, existing_currency = resolve_asset_metadata(
                legacy_type=asset.type,
                asset_class=asset.asset_class,
                market=asset.market,
                quote_currency=asset.quote_currency,
            )
            if (
                asset.type != asset_type
                or existing_class != asset_class
                or existing_market != market
                or existing_currency != quote_currency
            ):
                skipped.append(
                    BulkAssetSkipped(
                        ticker=ticker,
                        reason=(
                            f"Já existe no catálogo como "
                            f"{existing_class.value}/{existing_market.value}/{existing_currency.value}"
                        ),
                    )
                )
                continue
            if asset.id in linked_asset_ids:
                skipped.append(
                    BulkAssetSkipped(ticker=ticker, reason="Já está no seu catálogo")
                )
            else:
                # Global exists, create user link
                db.add(UserAsset(user_id=user.id, asset_id=asset.id))
                linked_asset_ids.add(asset.id)
                linked.append(
                    BulkAssetLinked(
                        ticker=ticker,
                        type=asset.type,
                        asset_class=asset.asset_class,
                        market=asset.market,
                        quote_currency=asset.quote_currency,
                    )
                )
        else:
            if not user.is_admin:
                skipped.append(
                    BulkAssetSkipped(
                        ticker=ticker,
                        reason="Ativo ainda não existe no catálogo global",
                    )
                )
                continue
            # Create new global asset + user link
            asset = Asset(
                ticker=ticker,
                type=asset_type,
                asset_class=asset_class,
                market=market,
                quote_currency=quote_currency,
                price_symbol=price_symbol,
                description="",
            )
            db.add(asset)
            await db.flush()  # get asset.id
            db.add(UserAsset(user_id=user.id, asset_id=asset.id))
            created.append(
                BulkAssetCreated(
                    ticker=ticker,
                    type=asset_type,
                    asset_class=asset_class,
                    market=market,
                    quote_currency=quote_currency,
                )
            )

    for ticker in intra_dupes:
        skipped.append(BulkAssetSkipped(ticker=ticker, reason="Duplicado no CSV"))

    await db.commit()
    return BulkAssetResponse(created=created, linked=linked, skipped=skipped)


@router.get("/rebalancing-info", response_model=list[AssetRebalancingInfo])
async def get_rebalancing_info(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-asset target value and gap based on current portfolio."""
    # Get allocation targets
    targets_result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    targets = {
        t.allocation_bucket: t.target_pct for t in targets_result.scalars().all()
    }

    # Current investable total
    class_values = await get_bucket_values(db, user)
    investable_total = sum(class_values.values())

    # Count active (non-paused) assets per bucket
    all_user_assets = await db.execute(
        select(Asset)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(UserAsset.user_id == user.id, UserAsset.paused.is_(False))
    )
    active_counts_by_bucket: dict[AllocationBucket, int] = {}
    for asset_row in all_user_assets.scalars().all():
        ac, mk, _qc = resolve_asset_metadata(
            legacy_type=asset_row.type,
            asset_class=asset_row.asset_class,
            market=asset_row.market,
            quote_currency=asset_row.quote_currency,
        )
        bucket = asset_bucket_for(ac, mk)
        active_counts_by_bucket[bucket] = active_counts_by_bucket.get(bucket, 0) + 1

    # Get per-asset market values (variable income)
    positions = await db.execute(
        select(
            Asset.id,
            Asset.ticker,
            Asset.type,
            Asset.current_price,
            func.sum(Purchase.quantity).label("qty"),
        )
        .join(Asset, Purchase.asset_id == Asset.id)
        .where(Purchase.user_id == user.id)
        .group_by(Asset.id, Asset.ticker, Asset.type, Asset.current_price)
    )
    asset_values: dict[int, Decimal] = {}
    for asset_id, _, _, price, qty in positions.all():
        asset_values[asset_id] = (price * qty) if price and qty else Decimal("0")

    # Build response for all user assets
    all_assets = await db.execute(
        select(Asset, UserAsset.paused)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(UserAsset.user_id == user.id)
    )

    result = []
    for asset, paused in all_assets.all():
        if paused:
            continue
        asset_class, market, quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        bucket = asset_bucket_for(asset_class, market)
        n_active = active_counts_by_bucket.get(bucket, 1)
        target_pct = targets.get(bucket, Decimal("0"))
        target_value = investable_total * target_pct / n_active
        current_value = asset_values.get(asset.id, Decimal("0"))
        gap = target_value - current_value

        result.append(
            AssetRebalancingInfo(
                asset_id=asset.id,
                ticker=asset.ticker,
                target_value=round(target_value, 2),
                current_value=round(current_value, 2),
                gap=round(gap, 2),
            )
        )

    return result


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
    asset_type, asset_class, market, quote_currency = _resolve_payload_classification(
        data
    )

    # Check if global asset exists
    result = await db.execute(select(Asset).where(Asset.ticker == ticker))
    asset = result.scalar_one_or_none()

    if asset:
        if asset.type != asset_type or not _asset_metadata_matches(
            asset,
            asset_class,
            market,
            quote_currency,
        ):
            raise HTTPException(
                status_code=409,
                detail="Ativo já existe no catálogo com outra classificação",
            )
        # Check if user already has a link
        link_result = await db.execute(
            select(UserAsset).where(
                UserAsset.user_id == user.id, UserAsset.asset_id == asset.id
            )
        )
        if link_result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Você já rastreia este ativo")
    else:
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas administradores podem cadastrar novos ativos globais",
            )
        # Create new global asset
        asset = Asset(
            ticker=ticker,
            type=asset_type,
            asset_class=asset_class,
            market=market,
            quote_currency=quote_currency,
            price_symbol=data.price_symbol,
            description=data.description,
        )
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
    wants_global_update = (
        data.ticker is not None
        or data.description is not None
        or data.asset_class is not None
        or data.market is not None
        or data.quote_currency is not None
        or data.price_symbol is not None
    )
    if wants_global_update and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem editar dados globais do ativo",
        )

    if data.ticker is not None:
        asset.ticker = data.ticker.upper()
    if data.description is not None:
        asset.description = data.description
    if (
        data.asset_class is not None
        or data.market is not None
        or data.quote_currency is not None
    ):
        asset_type, asset_class, market, quote_currency = (
            _resolve_payload_classification(data)
        )
        asset.type = asset_type
        asset.asset_class = asset_class
        asset.market = market
        asset.quote_currency = quote_currency
    if data.price_symbol is not None:
        asset.price_symbol = data.price_symbol

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
            .where(
                FixedIncomePosition.user_id == user.id,
                FixedIncomePosition.asset_id == asset_id,
            )
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


@router.get("/{asset_id}/price-history")
async def get_asset_price_history(
    asset_id: int,
    days: int = Query(default=90, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset)
        .join(UserAsset, UserAsset.asset_id == Asset.id)
        .where(Asset.id == asset_id, UserAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    asset_class, market, quote_currency = resolve_asset_metadata(
        legacy_type=asset.type,
        asset_class=asset.asset_class,
        market=asset.market,
        quote_currency=asset.quote_currency,
    )
    if asset.price_symbol:
        yf_ticker = asset.price_symbol
    elif market == Market.BR and asset_class in (
        AssetClass.STOCK,
        AssetClass.ETF,
        AssetClass.FII,
    ):
        yf_ticker = f"{asset.ticker}.SA"
    else:
        yf_ticker = asset.ticker

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None,
            lambda: yf.download(yf_ticker, period=f"{days}d", progress=False),
        )
    except Exception:
        return []

    if data.empty:
        return []

    fx_rates_by_date: dict[object, float] = {}
    if quote_currency != CurrencyCode.BRL:
        from app.services.price_service import FX_TICKERS, _get_system_setting

        rate_str = await _get_system_setting(
            db, f"{quote_currency.value.lower()}_brl_rate"
        )
        fallback_fx_rate = float(rate_str) if rate_str else None
        try:
            fx_data = await loop.run_in_executor(
                None,
                lambda: yf.download(
                    FX_TICKERS[quote_currency],
                    period=f"{days}d",
                    progress=False,
                ),
            )
            if not fx_data.empty:
                fx_close_series = fx_data["Close"][FX_TICKERS[quote_currency]]
                fx_rates_by_date = {
                    idx.date(): float(val)
                    for idx, val in fx_close_series.items()
                    if float(val) > 0
                }
        except Exception:
            fx_rates_by_date = {}
    else:
        fallback_fx_rate = 1.0

    points = []
    try:
        close_series = data["Close"][yf_ticker]
        for idx, val in close_series.items():
            price = float(val)
            if price <= 0:
                continue
            if quote_currency != CurrencyCode.BRL:
                fx_rate = fx_rates_by_date.get(idx.date(), fallback_fx_rate)
                if not fx_rate:
                    continue
                price *= fx_rate
            date_str = idx.strftime("%Y-%m-%d")
            points.append({"date": date_str, "price": round(price, 2)})
    except Exception:
        return []

    return points
