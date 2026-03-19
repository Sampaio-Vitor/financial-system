import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.auth_service import (
    create_access_token,
    hash_password,
    verify_password,
)

router = APIRouter()

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str) -> None:
    """Verify Cloudflare Turnstile token. Skip if secret key is not configured."""
    if not settings.TURNSTILE_SECRET_KEY:
        return

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verificação CAPTCHA necessária",
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TURNSTILE_VERIFY_URL,
            data={
                "secret": settings.TURNSTILE_SECRET_KEY,
                "response": token,
            },
        )
        result = resp.json()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verificação CAPTCHA falhou. Tente novamente.",
        )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    await verify_turnstile(body.turnstile_token)

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos",
        )

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    await verify_turnstile(body.turnstile_token)

    # Check username uniqueness (case-insensitive)
    result = await db.execute(
        select(User).where(func.lower(User.username) == body.username.lower())
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nome de usuário já existe",
        )

    # Create user
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    # Create default settings
    user_settings = UserSettings(user_id=user.id)
    db.add(user_settings)

    await db.commit()

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)
