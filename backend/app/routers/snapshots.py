from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.daily_snapshot import DailySnapshot
from app.models.monthly_snapshot import MonthlySnapshot
from app.models.user import User
from app.schemas.snapshot import (
    DailyEvolutionPoint,
    SnapshotGenerateRequest,
    SnapshotResponse,
    PatrimonioEvolutionPoint,
    SnapshotAssetItem,
)
from app.services.snapshot_service import SnapshotService

router = APIRouter()


@router.get("", response_model=list[SnapshotResponse])
async def list_snapshots(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonthlySnapshot)
        .where(MonthlySnapshot.user_id == user.id)
        .order_by(MonthlySnapshot.month.desc())
    )
    return [
        SnapshotResponse.model_validate(s, from_attributes=True)
        for s in result.scalars().all()
    ]


@router.post("/generate", response_model=SnapshotResponse)
async def generate_snapshot(
    data: SnapshotGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        year, month = int(data.month[:4]), int(data.month[5:7])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    service = SnapshotService(db, user)
    snapshot = await service.generate_snapshot(year, month)
    return SnapshotResponse.model_validate(snapshot, from_attributes=True)


@router.post("/generate-all", response_model=list[SnapshotResponse])
async def generate_all_snapshots(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = SnapshotService(db, user)
    snapshots = await service.generate_all()
    return [SnapshotResponse.model_validate(s, from_attributes=True) for s in snapshots]


@router.get("/evolution", response_model=list[PatrimonioEvolutionPoint])
async def get_evolution(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonthlySnapshot)
        .where(MonthlySnapshot.user_id == user.id)
        .order_by(MonthlySnapshot.month.asc())
    )
    return [
        PatrimonioEvolutionPoint(
            month=s.month,
            total_patrimonio=s.total_patrimonio,
            total_invested=s.total_invested,
            total_pnl=s.total_pnl,
            pnl_pct=s.pnl_pct,
            aportes_do_mes=s.aportes_do_mes,
        )
        for s in result.scalars().all()
    ]


@router.get("/assets", response_model=list[SnapshotAssetItem])
async def get_snapshot_assets(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonthlySnapshot).where(
            MonthlySnapshot.user_id == user.id,
            MonthlySnapshot.month == month,
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot or not snapshot.asset_breakdown:
        return []
    return [SnapshotAssetItem(**item) for item in snapshot.asset_breakdown]


@router.get("/daily-evolution", response_model=list[DailyEvolutionPoint])
async def get_daily_evolution(
    days: int = Query(default=90, ge=1, le=3650),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(DailySnapshot)
        .where(DailySnapshot.user_id == user.id, DailySnapshot.date >= cutoff)
        .order_by(DailySnapshot.date.asc())
    )
    return [
        DailyEvolutionPoint(
            date=s.date,
            total_patrimonio=s.total_patrimonio,
            total_invested=s.total_invested,
            total_pnl=s.total_pnl,
            pnl_pct=s.pnl_pct,
        )
        for s in result.scalars().all()
    ]
