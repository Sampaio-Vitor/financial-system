from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType
from app.models.purchase import Purchase
from app.models.user import User
from app.schemas.bastter_sync import (
    BastterIncludeAssetResult,
    BastterIncludeAssetsRequest,
    BastterIncludeAssetsResponse,
    BastterSyncBatchResponse,
    BastterSyncItemResult,
    BastterSyncPreviewItem,
    BastterSyncPreviewResponse,
    BastterSyncRequest,
)
from app.services.bastter_sync_service import (
    BastterAssetNotInCatalogError,
    BastterAuthenticationError,
    BastterSyncError,
    BastterSyncService,
    SUPPORTED_TYPES,
    tesouro_descricao_for,
)

router = APIRouter()


SORT_COLUMNS = {
    "ticker": Asset.ticker,
    "asset_type": Asset.type,
    "purchase_date": Purchase.purchase_date,
    "quantity": Purchase.quantity,
    "total_value": Purchase.total_value,
    "bastter_synced_at": Purchase.bastter_synced_at,
}


@router.get("/purchases", response_model=BastterSyncPreviewResponse)
async def list_syncable_purchases(
    asset_type: AssetType | None = Query(None),
    ticker: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    sync_status: Literal["pending", "synced"] | None = Query(None),
    sort_by: Literal["ticker", "asset_type", "purchase_date", "quantity", "total_value", "bastter_synced_at"] | None = Query(None),
    sort_dir: Literal["asc", "desc"] | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    supported_asset_types = list(SUPPORTED_TYPES.keys())
    filters = [
        Purchase.user_id == user.id,
        Purchase.quantity > 0,
        Asset.type.in_(supported_asset_types),
        or_(Asset.type != AssetType.RF, Asset.td_kind.is_not(None)),
    ]
    if asset_type:
        if asset_type not in supported_asset_types:
            raise HTTPException(status_code=400, detail="Tipo de ativo nao suportado para sync Bastter")
        filters.append(Asset.type == asset_type)
    if ticker:
        filters.append(Asset.ticker.ilike(f"%{ticker.strip()}%"))
    if date_from:
        filters.append(Purchase.purchase_date >= date_from)
    if date_to:
        filters.append(Purchase.purchase_date <= date_to)
    if sync_status == "pending":
        filters.append(Purchase.bastter_synced_at.is_(None))
    elif sync_status == "synced":
        filters.append(Purchase.bastter_synced_at.is_not(None))

    total_count = (
        await db.execute(
            select(func.count(Purchase.id))
            .select_from(Purchase)
            .join(Asset)
            .where(*filters)
        )
    ).scalar() or 0

    items = (
        await db.execute(
            select(Purchase)
            .join(Asset)
            .where(*filters)
            .order_by(
                *(
                    [SORT_COLUMNS[sort_by].asc() if sort_dir == "asc" else SORT_COLUMNS[sort_by].desc()]
                    if sort_by and sort_by in SORT_COLUMNS
                    else [Purchase.purchase_date.desc()]
                ),
                Purchase.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return BastterSyncPreviewResponse(
        items=[
            BastterSyncPreviewItem(
                id=item.id,
                ticker=item.asset.ticker if item.asset else "",
                asset_type=item.asset.type.value if item.asset else "",
                asset_class=item.asset.asset_class if item.asset else None,
                market=item.asset.market if item.asset else None,
                purchase_date=item.purchase_date.isoformat(),
                quantity=item.quantity,
                total_value=item.total_value,
                total_value_native=item.total_value_native,
                trade_currency=item.trade_currency,
                bastter_synced_at=item.bastter_synced_at,
            )
            for item in items
        ],
        total_count=total_count,
    )


@router.post("/sync", response_model=BastterSyncBatchResponse, status_code=status.HTTP_200_OK)
async def sync_bastter_purchases(
    body: BastterSyncRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase_ids = list(dict.fromkeys(body.purchase_ids))
    result = await db.execute(
        select(Purchase)
        .join(Asset)
        .where(Purchase.user_id == user.id, Purchase.id.in_(purchase_ids))
    )
    purchases = result.scalars().all()
    purchases_by_id = {purchase.id: purchase for purchase in purchases}

    missing_ids = [purchase_id for purchase_id in purchase_ids if purchase_id not in purchases_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Movimentacoes nao encontradas: {', '.join(str(item) for item in missing_ids)}",
        )

    ordered_purchases = [purchases_by_id[purchase_id] for purchase_id in purchase_ids]
    for purchase in ordered_purchases:
        if purchase.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Movimentacao {purchase.id} nao e uma compra elegivel para sync",
            )
        if purchase.asset is None or purchase.asset.type not in SUPPORTED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Movimentacao {purchase.id} possui tipo de ativo nao suportado",
            )

    service = BastterSyncService()
    needs_catalog = any(
        p.asset is not None and p.asset.type != AssetType.RF for p in ordered_purchases
    )
    catalog_items: list = []
    if needs_catalog:
        try:
            catalog_items = await service.fetch_assets_catalog(body.cookie)
        except BastterAuthenticationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except BastterSyncError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Erro inesperado ao consultar Bastter") from exc

    results: list[BastterSyncItemResult] = []
    success_count = 0

    for purchase in ordered_purchases:
        ticker = purchase.asset.ticker if purchase.asset else ""
        local_type = purchase.asset.type.value if purchase.asset else ""
        result_payload: dict | None = None
        endpoint_name: str | None = None
        ativo_id: int | None = None
        bastter_tipo = ""
        bastter_response = None
        error = None
        success = False
        missing_in_catalog = False

        try:
            if purchase.bastter_synced_at is not None:
                raise BastterSyncError("Movimentacao ja sincronizada anteriormente com o Bastter")
            bastter_tipo = service.resolve_bastter_tipo(purchase)
            if bastter_tipo == "rendafixa":
                descricao = tesouro_descricao_for(
                    ticker,
                    purchase.asset.td_kind,
                    purchase.asset.td_maturity_year,
                )
                salvar_response = await service.save_tesouro_asset(
                    body.cookie, descricao=descricao
                )
                ativo_id = salvar_response.get("AtivoID")
                if not isinstance(ativo_id, int) or ativo_id <= 0:
                    raise BastterSyncError(
                        f"Bastter nao retornou AtivoID para '{descricao}'"
                    )
            else:
                ativo_id = service.resolve_ativo_id(
                    catalog_items,
                    ticker=ticker,
                    bastter_tipo=bastter_tipo,
                )
            endpoint, result_payload, bastter_tipo = service.build_payload(
                purchase,
                ativo_id=ativo_id,
            )
            endpoint_name = endpoint.rsplit("/", 1)[-1]
            bastter_response = await service.submit_purchase(
                body.cookie,
                endpoint=endpoint,
                payload=result_payload,
                bastter_tipo=bastter_tipo,
            )
            success = bool(bastter_response.get("Return"))
            if success:
                purchase.bastter_synced_at = datetime.now(timezone.utc)
                success_count += 1
            else:
                error = "Bastter retornou falha ao gravar a movimentacao"
        except BastterAssetNotInCatalogError as exc:
            missing_in_catalog = True
            bastter_tipo = exc.bastter_tipo
            error = str(exc)
        except BastterSyncError as exc:
            error = str(exc)
        except Exception as exc:
            error = f"Erro inesperado: {exc}"

        results.append(
            BastterSyncItemResult(
                purchase_id=purchase.id,
                ticker=ticker,
                local_type=local_type,
                asset_class=purchase.asset.asset_class if purchase.asset else None,
                market=purchase.asset.market if purchase.asset else None,
                bastter_tipo=bastter_tipo or local_type.lower(),
                ativo_id=ativo_id,
                endpoint=endpoint_name,
                payload=result_payload,
                success=success,
                bastter_response=bastter_response,
                error=error,
                bastter_synced_at=purchase.bastter_synced_at,
                missing_in_catalog=missing_in_catalog,
            )
        )

    await db.commit()
    failure_count = len(results) - success_count
    missing_in_catalog_count = sum(1 for item in results if item.missing_in_catalog)
    return BastterSyncBatchResponse(
        catalog_items_count=len(catalog_items),
        selected_count=len(results),
        success_count=success_count,
        failure_count=failure_count,
        missing_in_catalog_count=missing_in_catalog_count,
        results=results,
    )


@router.post("/include-assets", response_model=BastterIncludeAssetsResponse, status_code=status.HTTP_200_OK)
async def include_bastter_assets(
    body: BastterIncludeAssetsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase_ids = list(dict.fromkeys(body.purchase_ids))
    result = await db.execute(
        select(Purchase)
        .join(Asset)
        .where(Purchase.user_id == user.id, Purchase.id.in_(purchase_ids))
    )
    purchases = result.scalars().all()
    purchases_by_id = {purchase.id: purchase for purchase in purchases}

    missing_ids = [purchase_id for purchase_id in purchase_ids if purchase_id not in purchases_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Movimentacoes nao encontradas: {', '.join(str(item) for item in missing_ids)}",
        )

    service = BastterSyncService()

    unique: dict[tuple[str, str], str] = {}
    for purchase in purchases_by_id.values():
        if purchase.asset is None or purchase.asset.type not in SUPPORTED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Movimentacao {purchase.id} possui tipo de ativo nao suportado",
            )
        try:
            bastter_tipo = service.resolve_bastter_tipo(purchase)
        except BastterSyncError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        ticker = purchase.asset.ticker.strip().upper()
        if bastter_tipo == "rendafixa":
            descricao = tesouro_descricao_for(
                ticker,
                purchase.asset.td_kind,
                purchase.asset.td_maturity_year,
            )
        else:
            descricao = ticker
        unique.setdefault((bastter_tipo, ticker), descricao)

    needs_carteira = any(tipo != "rendafixa" for (tipo, _ticker) in unique)
    carteira_id = 0
    if needs_carteira:
        try:
            carteira_id = await service.fetch_carteira_id(body.cookie)
        except BastterAuthenticationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except BastterSyncError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    results: list[BastterIncludeAssetResult] = []
    success_count = 0
    for (bastter_tipo, ticker), descricao in unique.items():
        item_success = False
        item_error: str | None = None
        item_response: dict | None = None
        try:
            if bastter_tipo == "rendafixa":
                item_response = await service.save_tesouro_asset(
                    body.cookie, descricao=descricao
                )
                ativo_id = item_response.get("AtivoID")
                item_success = isinstance(ativo_id, int) and ativo_id > 0
                if not item_success:
                    item_error = "Bastter nao retornou AtivoID ao salvar Tesouro"
            else:
                item_response = await service.include_asset(
                    body.cookie,
                    tipo=bastter_tipo,
                    descricao=descricao,
                    carteira_id=carteira_id,
                )
                item_success = bool(item_response.get("Return"))
                if not item_success:
                    item_error = "Bastter retornou falha ao incluir o ativo"
        except BastterAuthenticationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except BastterSyncError as exc:
            item_error = str(exc)
        except Exception as exc:
            item_error = f"Erro inesperado: {exc}"

        if item_success:
            success_count += 1
        results.append(
            BastterIncludeAssetResult(
                ticker=ticker,
                bastter_tipo=bastter_tipo,
                success=item_success,
                bastter_response=item_response,
                error=item_error,
            )
        )

    return BastterIncludeAssetsResponse(
        carteira_id=carteira_id,
        success_count=success_count,
        failure_count=len(results) - success_count,
        results=results,
    )
