import base64
import json
import uuid
from datetime import date
from decimal import Decimal

from arq.jobs import Job, JobStatus
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.asset import Asset, resolve_asset_metadata
from app.models.purchase import Purchase
from app.models.user import User
from app.models.user_asset import UserAsset
from app.schemas.ocr import (
    BulkPurchaseItem,
    BulkPurchaseRequest,
    OcrBatchStatus,
    OcrJobStatus,
    OcrResult,
    OcrUploadResponse,
    TickerResolveRequest,
    TickerResolveResponse,
    TickerResolution,
)
from app.schemas.purchase import PurchaseResponse
from app.routers.purchases import _normalize_purchase_values, _to_response

router = APIRouter()

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_IMAGES = 5

# Magic bytes for MIME validation
MAGIC_BYTES = {
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",  # WebP starts with RIFF....WEBP
}


def _detect_mime(data: bytes) -> str | None:
    for magic, mime in MAGIC_BYTES.items():
        if data[:len(magic)] == magic:
            return mime
    return None


@router.post("/upload", response_model=OcrUploadResponse)
async def upload_images(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Upload 1-5 images for OCR processing. Returns batch_id and job_ids."""
    form = await request.form()
    files = form.getlist("files")

    if not files:
        raise HTTPException(status_code=400, detail="Nenhuma imagem enviada")
    if len(files) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximo de {MAX_IMAGES} imagens por upload",
        )

    validated_images: list[tuple[str, str]] = []

    for f in files:
        data = await f.read()

        if len(data) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Imagem {f.filename} excede o limite de 5MB",
            )

        mime = _detect_mime(data)
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Formato de imagem nao suportado: {f.filename}. Use PNG, JPG ou WebP.",
            )

        image_b64 = base64.b64encode(data).decode("ascii")
        validated_images.append((image_b64, mime))

    batch_id = str(uuid.uuid4())
    job_ids = []
    pool = request.app.state.arq_pool

    for image_b64, mime in validated_images:
        job_id = f"{batch_id}:{uuid.uuid4()}"

        await pool.enqueue_job(
            "process_image_ocr",
            image_b64,
            mime,
            _job_id=job_id,
            _expires=3600,
        )
        job_ids.append(job_id)

    # Store batch metadata in Redis
    batch_meta = json.dumps({"user_id": user.id, "job_ids": job_ids})
    await pool.set(f"ocr:batch:{batch_id}", batch_meta, ex=3600)

    return OcrUploadResponse(batch_id=batch_id, job_ids=job_ids)


ARQ_STATUS_MAP = {
    JobStatus.queued: "queued",
    JobStatus.deferred: "queued",
    JobStatus.in_progress: "processing",
    JobStatus.complete: "completed",
    JobStatus.not_found: "not_found",
}


@router.get("/batch/{batch_id}", response_model=OcrBatchStatus)
async def get_batch_status(
    batch_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Poll batch status. Returns per-job status and results."""
    pool = request.app.state.arq_pool

    # Verify batch belongs to user
    batch_raw = await pool.get(f"ocr:batch:{batch_id}")
    if not batch_raw:
        raise HTTPException(status_code=404, detail="Batch nao encontrado")

    batch_meta = json.loads(batch_raw)
    if batch_meta["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    job_ids = batch_meta["job_ids"]
    jobs_status = []
    all_done = True
    any_failed = False

    for jid in job_ids:
        job = Job(jid, redis=pool)
        st = await job.status()
        mapped = ARQ_STATUS_MAP.get(st, "queued")

        result = None
        error = None

        if st == JobStatus.complete:
            info = await job.result_info()
            if info and info.success:
                result = OcrResult(**info.result)
            elif info:
                error = str(info.result) if info.result else "Erro desconhecido"
                mapped = "failed"
                any_failed = True
        else:
            all_done = False

        jobs_status.append(OcrJobStatus(
            job_id=jid,
            status=mapped,
            result=result,
            error=error,
        ))

    if all_done:
        batch_status = "failed" if any_failed and not any(j.status == "completed" for j in jobs_status) else "completed"
    else:
        batch_status = "processing"

    return OcrBatchStatus(
        batch_id=batch_id,
        status=batch_status,
        jobs=jobs_status,
    )


@router.post("/resolve-tickers", response_model=TickerResolveResponse)
async def resolve_tickers(
    data: TickerResolveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resolve a list of tickers to asset_id, currency, and link state."""
    resolutions = []
    seen = set()

    for raw_ticker in data.tickers:
        ticker = raw_ticker.strip().upper()
        if ticker in seen:
            continue
        seen.add(ticker)

        # Look up global asset
        result = await db.execute(select(Asset).where(Asset.ticker == ticker))
        asset = result.scalar_one_or_none()

        if asset is None:
            resolutions.append(TickerResolution(
                ticker=ticker,
                state="unknown",
            ))
            continue

        # Check user link
        link_result = await db.execute(
            select(UserAsset).where(
                UserAsset.user_id == user.id,
                UserAsset.asset_id == asset.id,
            )
        )
        linked = link_result.scalar_one_or_none() is not None

        _ac, _m, qc = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )

        resolutions.append(TickerResolution(
            ticker=ticker,
            asset_id=asset.id,
            quote_currency=qc.value,
            fx_rate_to_brl=float(asset.fx_rate_to_brl) if asset.fx_rate_to_brl else None,
            state="linked" if linked else "global_unlinked",
        ))

    return TickerResolveResponse(resolutions=resolutions)


@router.post("/link-asset")
async def link_asset(
    ticker: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Link an existing global asset to the current user's catalog."""
    ticker = ticker.strip().upper()
    result = await db.execute(select(Asset).where(Asset.ticker == ticker))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Ativo {ticker} nao encontrado")

    # Check if already linked
    existing = await db.execute(
        select(UserAsset).where(
            UserAsset.user_id == user.id,
            UserAsset.asset_id == asset.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"detail": "Ativo ja esta no catalogo", "asset_id": asset.id}

    link = UserAsset(user_id=user.id, asset_id=asset.id)
    db.add(link)
    await db.commit()
    return {"detail": "Ativo adicionado ao catalogo", "asset_id": asset.id}


@router.post("/purchases/bulk", response_model=list[PurchaseResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_purchases(
    data: BulkPurchaseRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create multiple purchases atomically."""
    if not data.items:
        raise HTTPException(status_code=400, detail="Lista de aportes vazia")

    created = []

    # Pre-load all needed assets
    asset_ids = list({item.asset_id for item in data.items})
    assets_result = await db.execute(select(Asset).where(Asset.id.in_(asset_ids)))
    assets_map = {a.id: a for a in assets_result.scalars().all()}

    # Pre-load user links
    links_result = await db.execute(
        select(UserAsset).where(
            UserAsset.user_id == user.id,
            UserAsset.asset_id.in_(asset_ids),
        )
    )
    linked_ids = {link.asset_id for link in links_result.scalars().all()}

    # Track cumulative position changes within this batch for sale validation
    batch_position_delta: dict[int, Decimal] = {}

    for idx, item in enumerate(data.items):
        asset = assets_map.get(item.asset_id)
        if not asset:
            raise HTTPException(
                status_code=400,
                detail=f"Linha {idx + 1}: Ativo com id {item.asset_id} nao encontrado",
            )
        if item.asset_id not in linked_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Linha {idx + 1}: Ativo {asset.ticker} nao esta no seu catalogo",
            )

        quantity = Decimal(str(item.quantity))

        # Validate sales against current position + batch delta
        if quantity < 0:
            pos_result = await db.execute(
                select(func.sum(Purchase.quantity)).where(
                    Purchase.user_id == user.id,
                    Purchase.asset_id == item.asset_id,
                )
            )
            db_position = pos_result.scalar() or Decimal("0")
            batch_delta = batch_position_delta.get(item.asset_id, Decimal("0"))
            available = db_position + batch_delta

            if abs(quantity) > available:
                raise HTTPException(
                    status_code=400,
                    detail=f"Linha {idx + 1}: Venda de {abs(quantity)} {asset.ticker} excede posicao disponivel ({available})",
                )

        batch_position_delta[item.asset_id] = batch_position_delta.get(item.asset_id, Decimal("0")) + quantity

        _ac, _m, quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )

        # Derive unit_price from total_value / abs(quantity)
        total = Decimal(str(item.total_value))
        unit_price = round(total / abs(quantity), 4) if quantity != 0 else Decimal("0")

        fx_rate = Decimal(str(item.fx_rate)) if item.fx_rate else None
        trade_currency = item.trade_currency

        if quote_currency.value != "BRL":
            # Non-BRL asset: total_value is in native currency
            normalized = _normalize_purchase_values(
                quote_currency=quote_currency,
                quantity=quantity,
                trade_currency=trade_currency,
                unit_price=None,
                unit_price_native=unit_price,
                fx_rate=fx_rate,
            )
        else:
            normalized = _normalize_purchase_values(
                quote_currency=quote_currency,
                quantity=quantity,
                trade_currency=trade_currency,
                unit_price=unit_price,
                unit_price_native=None,
                fx_rate=None,
            )

        purchase = Purchase(
            asset_id=item.asset_id,
            user_id=user.id,
            purchase_date=date.fromisoformat(item.purchase_date),
            quantity=quantity,
            trade_currency=str(normalized["trade_currency"]),
            unit_price=normalized["unit_price"],
            total_value=normalized["total_value"],
            unit_price_native=normalized["unit_price_native"],
            total_value_native=normalized["total_value_native"],
            fx_rate=normalized["fx_rate"],
        )
        db.add(purchase)
        created.append(purchase)

    await db.commit()

    # Reload with relationships
    result_purchases = []
    for p in created:
        res = await db.execute(select(Purchase).where(Purchase.id == p.id))
        result_purchases.append(_to_response(res.scalar_one()))

    return result_purchases
