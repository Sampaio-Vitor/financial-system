from datetime import date
from decimal import Decimal
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, AssetClass, AssetType, CurrencyCode, resolve_asset_metadata
from app.models.purchase import Purchase
from app.models.user import User
from app.models.user_asset import UserAsset
from app.schemas.purchase import (
    PurchaseCreate,
    PurchasePageResponse,
    PurchaseResponse,
    PurchaseUpdate,
)

router = APIRouter()


def _to_response(p: Purchase) -> PurchaseResponse:
    return PurchaseResponse(
        id=p.id,
        asset_id=p.asset_id,
        purchase_date=p.purchase_date,
        quantity=p.quantity,
        trade_currency=p.trade_currency,
        unit_price=p.unit_price,
        total_value=p.total_value,
        unit_price_native=p.unit_price_native,
        total_value_native=p.total_value_native,
        fx_rate=p.fx_rate,
        created_at=p.created_at,
        ticker=p.asset.ticker if p.asset else None,
        asset_type=p.asset.type if p.asset else None,
        asset_class=p.asset.asset_class if p.asset else None,
        market=p.asset.market if p.asset else None,
        quote_currency=p.asset.quote_currency if p.asset else None,
    )


def _normalize_purchase_values(
    *,
    quote_currency: CurrencyCode,
    quantity: Decimal,
    trade_currency: str | None,
    unit_price: Decimal | None,
    unit_price_native: Decimal | None,
    fx_rate: Decimal | None,
) -> dict[str, Decimal | str]:
    currency = trade_currency or quote_currency.value
    if currency not in {"BRL", "USD", "EUR", "GBP"}:
        raise HTTPException(status_code=400, detail="Moeda de operacao invalida")

    if currency != quote_currency.value:
        raise HTTPException(
            status_code=400,
            detail=f"Operacao deve usar a moeda do ativo ({quote_currency.value})",
        )

    if currency != "BRL":
        if unit_price_native is None or unit_price_native <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Preco unitario em {currency} deve ser informado",
            )
        if fx_rate is None or fx_rate <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cotacao {currency}/BRL invalida para esta operacao",
            )

        unit_price_brl = round(unit_price_native * fx_rate, 4)
        return {
            "trade_currency": currency,
            "unit_price": unit_price_brl,
            "total_value": round(quantity * unit_price_brl, 4),
            "unit_price_native": round(unit_price_native, 4),
            "total_value_native": round(quantity * unit_price_native, 4),
            "fx_rate": round(fx_rate, 4),
        }

    price_brl = unit_price if unit_price is not None else unit_price_native
    if price_brl is None or price_brl <= 0:
        raise HTTPException(
            status_code=400,
            detail="Preco unitario em BRL deve ser informado",
        )

    return {
        "trade_currency": "BRL",
        "unit_price": round(price_brl, 4),
        "total_value": round(quantity * price_brl, 4),
        "unit_price_native": round(price_brl, 4),
        "total_value_native": round(quantity * price_brl, 4),
        "fx_rate": Decimal("1.0000"),
    }


@router.get("", response_model=list[PurchaseResponse])
async def list_purchases(
    asset_id: int | None = Query(None),
    asset_type: AssetType | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Purchase)
        .join(Asset)
        .where(Purchase.user_id == user.id)
        .order_by(Purchase.purchase_date.desc())
    )
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


@router.get("/rv", response_model=PurchasePageResponse)
async def list_variable_income_purchases(
    asset_type: AssetType | None = Query(None),
    asset_class: AssetClass | None = Query(None),
    ticker: str | None = Query(None),
    operation: str | None = Query(None, pattern="^(compras|vendas)$"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if asset_type == AssetType.RF:
        raise HTTPException(
            status_code=400,
            detail="Este endpoint aceita apenas ativos de renda variável",
        )

    filters = [
        Purchase.user_id == user.id,
        Asset.type != AssetType.RF,
    ]

    if asset_class:
        filters.append(Asset.asset_class == asset_class)
    elif asset_type:
        filters.append(Asset.type == asset_type)
    if ticker:
        filters.append(Asset.ticker.ilike(f"%{ticker.strip()}%"))
    if operation == "compras":
        filters.append(Purchase.quantity >= 0)
    elif operation == "vendas":
        filters.append(Purchase.quantity < 0)
    if date_from:
        filters.append(Purchase.purchase_date >= date_from)
    if date_to:
        filters.append(Purchase.purchase_date <= date_to)

    total_count_query = (
        select(func.count(Purchase.id))
        .select_from(Purchase)
        .join(Asset)
        .where(*filters)
    )
    total_value_query = (
        select(func.coalesce(func.sum(Purchase.total_value), 0))
        .select_from(Purchase)
        .join(Asset)
        .where(*filters)
    )
    items_query = (
        select(Purchase)
        .join(Asset)
        .where(*filters)
        .order_by(Purchase.purchase_date.desc(), Purchase.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    total_count = (await db.execute(total_count_query)).scalar() or 0
    total_value = (await db.execute(total_value_query)).scalar() or 0
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    total_pages = max(1, ceil(total_count / page_size)) if page_size else 1

    return PurchasePageResponse(
        items=[_to_response(p) for p in items],
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_value=total_value,
    )


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    data: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset_result = await db.execute(select(Asset).where(Asset.id == data.asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Validate user has this asset in their catalog
    link = await db.execute(
        select(UserAsset).where(
            UserAsset.user_id == user.id, UserAsset.asset_id == data.asset_id
        )
    )
    if not link.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ativo não está no seu catálogo")

    # Validate sale: quantity negative means selling
    if data.quantity < 0:
        pos_result = await db.execute(
            select(func.sum(Purchase.quantity)).where(
                Purchase.user_id == user.id, Purchase.asset_id == data.asset_id
            )
        )
        current_qty = pos_result.scalar() or 0
        if abs(data.quantity) > current_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Quantidade de venda ({abs(data.quantity)}) excede a posicao atual ({current_qty})",
            )

    normalized = _normalize_purchase_values(
        quote_currency=resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )[2],
        quantity=data.quantity,
        trade_currency=data.trade_currency,
        unit_price=data.unit_price,
        unit_price_native=data.unit_price_native,
        fx_rate=data.fx_rate,
    )
    purchase = Purchase(
        asset_id=data.asset_id,
        user_id=user.id,
        purchase_date=data.purchase_date,
        quantity=data.quantity,
        trade_currency=str(normalized["trade_currency"]),
        unit_price=normalized["unit_price"],
        total_value=normalized["total_value"],
        unit_price_native=normalized["unit_price_native"],
        total_value_native=normalized["total_value_native"],
        fx_rate=normalized["fx_rate"],
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
    next_quantity = data.quantity if data.quantity is not None else purchase.quantity
    next_trade_currency = data.trade_currency or purchase.trade_currency
    next_unit_price = data.unit_price if data.unit_price is not None else purchase.unit_price
    next_unit_price_native = (
        data.unit_price_native
        if data.unit_price_native is not None
        else purchase.unit_price_native
    )
    next_fx_rate = data.fx_rate if data.fx_rate is not None else purchase.fx_rate

    if next_quantity < 0:
        pos_result = await db.execute(
            select(func.sum(Purchase.quantity)).where(
                Purchase.user_id == user.id,
                Purchase.asset_id == purchase.asset_id,
                Purchase.id != purchase.id,
            )
        )
        current_qty_excluding_row = pos_result.scalar() or 0
        if current_qty_excluding_row + next_quantity < 0:
            raise HTTPException(
                status_code=400,
                detail="Quantidade de venda excede a posicao atual disponivel",
            )

    normalized = _normalize_purchase_values(
        quote_currency=resolve_asset_metadata(
            legacy_type=purchase.asset.type,
            asset_class=purchase.asset.asset_class,
            market=purchase.asset.market,
            quote_currency=purchase.asset.quote_currency,
        )[2],
        quantity=next_quantity,
        trade_currency=next_trade_currency,
        unit_price=next_unit_price,
        unit_price_native=next_unit_price_native,
        fx_rate=next_fx_rate,
    )

    purchase.quantity = next_quantity
    purchase.trade_currency = str(normalized["trade_currency"])
    purchase.unit_price = normalized["unit_price"]
    purchase.total_value = normalized["total_value"]
    purchase.unit_price_native = normalized["unit_price_native"]
    purchase.total_value_native = normalized["total_value_native"]
    purchase.fx_rate = normalized["fx_rate"]

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
