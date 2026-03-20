from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_user
from app.models.allowed_username import AllowedUsername
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.admin import (
    AllowedUsernameCreate,
    AllowedUsernameResponse,
    SystemSettingsResponse,
    SystemSettingsUpdate,
)

router = APIRouter()


# --- Whitelist CRUD ---


@router.get("/whitelist", response_model=list[AllowedUsernameResponse])
async def list_whitelist(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AllowedUsername).order_by(AllowedUsername.created_at.desc())
    )
    return result.scalars().all()


@router.post("/whitelist", response_model=AllowedUsernameResponse, status_code=status.HTTP_201_CREATED)
async def add_to_whitelist(
    body: AllowedUsernameCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    entry = AllowedUsername(username=body.username)
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username já está na whitelist",
        )
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/whitelist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_whitelist(
    entry_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AllowedUsername).where(AllowedUsername.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrada não encontrada")
    await db.delete(entry)
    await db.commit()


# --- System Settings ---


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_settings(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "registration_whitelist_enabled")
    )
    row = result.scalar_one_or_none()
    return SystemSettingsResponse(
        registration_whitelist_enabled=row.value == "true" if row else False,
    )


@router.patch("/settings", response_model=SystemSettingsResponse)
async def update_settings(
    body: SystemSettingsUpdate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "registration_whitelist_enabled")
    )
    row = result.scalar_one_or_none()
    value = "true" if body.registration_whitelist_enabled else "false"

    if row:
        row.value = value
    else:
        db.add(SystemSetting(key="registration_whitelist_enabled", value=value))

    await db.commit()
    return SystemSettingsResponse(registration_whitelist_enabled=body.registration_whitelist_enabled)
