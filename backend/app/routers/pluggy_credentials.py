from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.pluggy_credentials import PluggyCredentials
from app.models.user import User
from app.schemas.expenses import PluggyCredentialsCreate, PluggyCredentialsStatus
from app.services.encryption_service import encrypt, decrypt

router = APIRouter()


@router.get("", response_model=PluggyCredentialsStatus)
async def get_credentials_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PluggyCredentials).where(PluggyCredentials.user_id == user.id)
    )
    creds = result.scalar_one_or_none()
    return PluggyCredentialsStatus(has_credentials=creds is not None)


@router.post("", response_model=PluggyCredentialsStatus, status_code=status.HTTP_201_CREATED)
async def save_credentials(
    body: PluggyCredentialsCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PluggyCredentials).where(PluggyCredentials.user_id == user.id)
    )
    existing = result.scalar_one_or_none()

    encrypted_id = encrypt(body.client_id)
    encrypted_secret = encrypt(body.client_secret)

    if existing:
        existing.encrypted_client_id = encrypted_id
        existing.encrypted_client_secret = encrypted_secret
    else:
        creds = PluggyCredentials(
            user_id=user.id,
            encrypted_client_id=encrypted_id,
            encrypted_client_secret=encrypted_secret,
        )
        db.add(creds)

    await db.commit()
    return PluggyCredentialsStatus(has_credentials=True)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credentials(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PluggyCredentials).where(PluggyCredentials.user_id == user.id)
    )
    creds = result.scalar_one_or_none()
    if not creds:
        raise HTTPException(status_code=404, detail="Credenciais não encontradas")
    await db.delete(creds)
    await db.commit()
