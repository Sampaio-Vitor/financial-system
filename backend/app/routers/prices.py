from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.price_service import _get_system_setting

router = APIRouter()


@router.get("/context")
async def get_price_context(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usd_rate = await _get_system_setting(db, "usd_brl_rate")
    eur_rate = await _get_system_setting(db, "eur_brl_rate")
    gbp_rate = await _get_system_setting(db, "gbp_brl_rate")
    rate_updated = await _get_system_setting(db, "usd_brl_rate_updated_at")
    return {
        "usd_brl_rate": float(usd_rate) if usd_rate else None,
        "eur_brl_rate": float(eur_rate) if eur_rate else None,
        "gbp_brl_rate": float(gbp_rate) if gbp_rate else None,
        "rate_updated_at": rate_updated,
    }


@router.get("/status")
async def get_price_status(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    last_run = await _get_system_setting(db, "last_price_update_at")
    status = await _get_system_setting(db, "last_price_update_status")

    now = datetime.now(timezone.utc)
    next_run = now.replace(hour=21, minute=0, second=0, microsecond=0)
    if now >= next_run:
        next_run += timedelta(days=1)

    return {
        "next_run_utc": next_run.isoformat(),
        "last_run_utc": last_run,
        "last_run_status": status,
    }
