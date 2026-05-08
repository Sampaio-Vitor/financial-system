from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetType, CurrencyCode
from app.models.fixed_income import FixedIncomePosition
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


def _td_total_value(position: FixedIncomePosition) -> Decimal:
    if position.quantity is not None and position.purchase_unit_price is not None:
        return Decimal(position.quantity) * Decimal(position.purchase_unit_price)
    return Decimal(position.applied_value)


def _td_quantity(position: FixedIncomePosition) -> Decimal:
    if position.quantity is not None:
        return Decimal(position.quantity)
    return Decimal(0)


def _td_to_purchase_like(position: FixedIncomePosition) -> SimpleNamespace:
    """Wrap a tesouro fixed_income_position so it quacks like a Purchase for the service layer."""
    return SimpleNamespace(
        id=position.id,
        asset=position.asset,
        quantity=_td_quantity(position),
        purchase_date=position.start_date,
        total_value=_td_total_value(position),
        total_value_native=_td_total_value(position),
        trade_currency=CurrencyCode.BRL.value,
        bastter_synced_at=position.bastter_synced_at,
    )


def _td_preview_item(position: FixedIncomePosition) -> BastterSyncPreviewItem:
    asset = position.asset
    return BastterSyncPreviewItem(
        id=position.id,
        source="fixed_income",
        ticker=asset.ticker if asset else "",
        asset_type=asset.type.value if asset else "",
        asset_class=asset.asset_class if asset else None,
        market=asset.market if asset else None,
        purchase_date=position.start_date.isoformat(),
        quantity=_td_quantity(position),
        total_value=_td_total_value(position),
        total_value_native=_td_total_value(position),
        trade_currency=CurrencyCode.BRL.value,
        bastter_synced_at=position.bastter_synced_at,
    )


def _purchase_preview_item(purchase: Purchase) -> BastterSyncPreviewItem:
    return BastterSyncPreviewItem(
        id=purchase.id,
        source="purchase",
        ticker=purchase.asset.ticker if purchase.asset else "",
        asset_type=purchase.asset.type.value if purchase.asset else "",
        asset_class=purchase.asset.asset_class if purchase.asset else None,
        market=purchase.asset.market if purchase.asset else None,
        purchase_date=purchase.purchase_date.isoformat(),
        quantity=purchase.quantity,
        total_value=purchase.total_value,
        total_value_native=purchase.total_value_native,
        trade_currency=purchase.trade_currency,
        bastter_synced_at=purchase.bastter_synced_at,
    )


def _sort_preview_items(
    items: list[BastterSyncPreviewItem],
    sort_by: str | None,
    sort_dir: str | None,
) -> list[BastterSyncPreviewItem]:
    reverse = sort_dir != "asc"
    key_fn: Any
    if sort_by == "ticker":
        key_fn = lambda x: x.ticker  # noqa: E731
    elif sort_by == "asset_type":
        key_fn = lambda x: x.asset_type  # noqa: E731
    elif sort_by == "quantity":
        key_fn = lambda x: x.quantity  # noqa: E731
    elif sort_by == "total_value":
        key_fn = lambda x: x.total_value  # noqa: E731
    elif sort_by == "bastter_synced_at":
        key_fn = lambda x: (x.bastter_synced_at is None, x.bastter_synced_at or datetime.min)  # noqa: E731
    else:
        key_fn = lambda x: x.purchase_date  # noqa: E731
        reverse = sort_dir != "asc"
    return sorted(items, key=key_fn, reverse=reverse)


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
    if asset_type and asset_type not in supported_asset_types:
        raise HTTPException(status_code=400, detail="Tipo de ativo nao suportado para sync Bastter")

    purchase_filters = [
        Purchase.user_id == user.id,
        Purchase.quantity > 0,
        Asset.type.in_([t for t in supported_asset_types if t != AssetType.RF]),
    ]
    if asset_type and asset_type != AssetType.RF:
        purchase_filters.append(Asset.type == asset_type)
    if ticker:
        purchase_filters.append(Asset.ticker.ilike(f"%{ticker.strip()}%"))
    if date_from:
        purchase_filters.append(Purchase.purchase_date >= date_from)
    if date_to:
        purchase_filters.append(Purchase.purchase_date <= date_to)
    if sync_status == "pending":
        purchase_filters.append(Purchase.bastter_synced_at.is_(None))
    elif sync_status == "synced":
        purchase_filters.append(Purchase.bastter_synced_at.is_not(None))

    td_filters = [
        FixedIncomePosition.user_id == user.id,
        Asset.td_kind.is_not(None),
        Asset.td_maturity_year.is_not(None),
    ]
    if ticker:
        td_filters.append(Asset.ticker.ilike(f"%{ticker.strip()}%"))
    if date_from:
        td_filters.append(FixedIncomePosition.start_date >= date_from)
    if date_to:
        td_filters.append(FixedIncomePosition.start_date <= date_to)
    if sync_status == "pending":
        td_filters.append(FixedIncomePosition.bastter_synced_at.is_(None))
    elif sync_status == "synced":
        td_filters.append(FixedIncomePosition.bastter_synced_at.is_not(None))

    include_purchases = asset_type != AssetType.RF
    include_td = asset_type is None or asset_type == AssetType.RF

    purchases: list[Purchase] = []
    if include_purchases:
        purchases = list(
            (
                await db.execute(
                    select(Purchase).join(Asset).where(*purchase_filters)
                )
            ).scalars().all()
        )

    td_positions: list[FixedIncomePosition] = []
    if include_td:
        td_positions = list(
            (
                await db.execute(
                    select(FixedIncomePosition).join(Asset).where(*td_filters)
                )
            ).scalars().all()
        )

    combined: list[BastterSyncPreviewItem] = [
        _purchase_preview_item(p) for p in purchases
    ] + [_td_preview_item(t) for t in td_positions]
    combined = _sort_preview_items(combined, sort_by, sort_dir)
    total_count = len(combined)
    paginated = combined[(page - 1) * page_size : page * page_size]

    return BastterSyncPreviewResponse(items=paginated, total_count=total_count)


@router.post("/sync", response_model=BastterSyncBatchResponse, status_code=status.HTTP_200_OK)
async def sync_bastter_purchases(
    body: BastterSyncRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not body.has_any():
        raise HTTPException(status_code=400, detail="Selecione ao menos uma movimentacao")

    purchase_ids = list(dict.fromkeys(body.purchase_ids))
    td_ids = list(dict.fromkeys(body.fixed_income_position_ids))

    purchases_by_id: dict[int, Purchase] = {}
    if purchase_ids:
        result = await db.execute(
            select(Purchase)
            .join(Asset)
            .where(Purchase.user_id == user.id, Purchase.id.in_(purchase_ids))
        )
        purchases_by_id = {p.id: p for p in result.scalars().all()}
        missing = [pid for pid in purchase_ids if pid not in purchases_by_id]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Movimentacoes nao encontradas: {', '.join(str(i) for i in missing)}",
            )

    td_by_id: dict[int, FixedIncomePosition] = {}
    if td_ids:
        result = await db.execute(
            select(FixedIncomePosition)
            .join(Asset)
            .where(
                FixedIncomePosition.user_id == user.id,
                FixedIncomePosition.id.in_(td_ids),
            )
        )
        td_by_id = {t.id: t for t in result.scalars().all()}
        missing_td = [tid for tid in td_ids if tid not in td_by_id]
        if missing_td:
            raise HTTPException(
                status_code=404,
                detail=f"Posicoes de Tesouro nao encontradas: {', '.join(str(i) for i in missing_td)}",
            )

    ordered_purchases = [purchases_by_id[pid] for pid in purchase_ids]
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

    ordered_td = [td_by_id[tid] for tid in td_ids]
    for position in ordered_td:
        if position.asset is None or position.asset.td_kind is None or position.asset.td_maturity_year is None:
            raise HTTPException(
                status_code=400,
                detail=f"Posicao {position.id} nao e Tesouro Direto valido",
            )
        if position.quantity is None or position.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Posicao {position.id} sem quantidade — registre quantidade e preco unitario",
            )

    service = BastterSyncService()
    needs_catalog = any(p.asset is not None and p.asset.type != AssetType.RF for p in ordered_purchases)
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

    async def process_item(
        movement_obj: Purchase | SimpleNamespace,
        *,
        source: str,
        item_id: int,
    ) -> None:
        nonlocal success_count
        ticker = movement_obj.asset.ticker if movement_obj.asset else ""
        local_type = movement_obj.asset.type.value if movement_obj.asset else ""
        result_payload: dict | None = None
        endpoint_name: str | None = None
        ativo_id: int | None = None
        bastter_tipo = ""
        bastter_response = None
        error = None
        success = False
        missing_in_catalog = False

        try:
            if movement_obj.bastter_synced_at is not None:
                raise BastterSyncError("Movimentacao ja sincronizada anteriormente com o Bastter")
            bastter_tipo = service.resolve_bastter_tipo(movement_obj)
            if bastter_tipo == "rendafixa":
                descricao = tesouro_descricao_for(
                    ticker,
                    movement_obj.asset.td_kind,
                    movement_obj.asset.td_maturity_year,
                )
                salvar_response = await service.save_tesouro_asset(
                    body.cookie, descricao=descricao
                )
                ativo_id = salvar_response.get("AtivoID")
                if not isinstance(ativo_id, int) or ativo_id <= 0:
                    raise BastterSyncError(f"Bastter nao retornou AtivoID para '{descricao}'")
            else:
                ativo_id = service.resolve_ativo_id(
                    catalog_items,
                    ticker=ticker,
                    bastter_tipo=bastter_tipo,
                )
            endpoint, result_payload, bastter_tipo = service.build_payload(
                movement_obj,
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
                synced_at = datetime.now(timezone.utc)
                if source == "purchase":
                    movement_obj.bastter_synced_at = synced_at
                else:
                    td_by_id[item_id].bastter_synced_at = synced_at
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

        synced_at_value = (
            movement_obj.bastter_synced_at
            if source == "purchase"
            else td_by_id[item_id].bastter_synced_at
        )
        results.append(
            BastterSyncItemResult(
                purchase_id=item_id,
                source=source,
                ticker=ticker,
                local_type=local_type,
                asset_class=movement_obj.asset.asset_class if movement_obj.asset else None,
                market=movement_obj.asset.market if movement_obj.asset else None,
                bastter_tipo=bastter_tipo or local_type.lower(),
                ativo_id=ativo_id,
                endpoint=endpoint_name,
                payload=result_payload,
                success=success,
                bastter_response=bastter_response,
                error=error,
                bastter_synced_at=synced_at_value,
                missing_in_catalog=missing_in_catalog,
            )
        )

    for purchase in ordered_purchases:
        await process_item(purchase, source="purchase", item_id=purchase.id)
    for position in ordered_td:
        await process_item(_td_to_purchase_like(position), source="fixed_income", item_id=position.id)

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
    td_ids = list(dict.fromkeys(body.fixed_income_position_ids))
    if not purchase_ids and not td_ids:
        raise HTTPException(status_code=400, detail="Selecione ao menos uma movimentacao")

    purchases_by_id: dict[int, Purchase] = {}
    if purchase_ids:
        result = await db.execute(
            select(Purchase)
            .join(Asset)
            .where(Purchase.user_id == user.id, Purchase.id.in_(purchase_ids))
        )
        purchases_by_id = {p.id: p for p in result.scalars().all()}
        missing = [pid for pid in purchase_ids if pid not in purchases_by_id]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Movimentacoes nao encontradas: {', '.join(str(i) for i in missing)}",
            )

    td_by_id: dict[int, FixedIncomePosition] = {}
    if td_ids:
        result = await db.execute(
            select(FixedIncomePosition)
            .join(Asset)
            .where(
                FixedIncomePosition.user_id == user.id,
                FixedIncomePosition.id.in_(td_ids),
            )
        )
        td_by_id = {t.id: t for t in result.scalars().all()}
        missing_td = [tid for tid in td_ids if tid not in td_by_id]
        if missing_td:
            raise HTTPException(
                status_code=404,
                detail=f"Posicoes de Tesouro nao encontradas: {', '.join(str(i) for i in missing_td)}",
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
        unique.setdefault((bastter_tipo, ticker), ticker)

    for position in td_by_id.values():
        asset = position.asset
        if asset is None or asset.td_kind is None or asset.td_maturity_year is None:
            raise HTTPException(
                status_code=400,
                detail=f"Posicao {position.id} nao e Tesouro Direto valido",
            )
        ticker = asset.ticker.strip().upper()
        descricao = tesouro_descricao_for(ticker, asset.td_kind, asset.td_maturity_year)
        unique.setdefault(("rendafixa", ticker), descricao)

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
