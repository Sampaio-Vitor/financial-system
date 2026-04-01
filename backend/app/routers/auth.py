from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models.allowed_username import AllowedUsername
from app.models.refresh_token import RefreshToken
from app.models.settings import UserSettings
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, SessionResponse
from app.services.auth_service import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    hash_password,
    refresh_token_expiry,
    verify_password,
)

router = APIRouter()

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _build_session_response(user: User) -> SessionResponse:
    return SessionResponse(
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin,
    )


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        max_age=settings.JWT_EXPIRATION_MINUTES * 60,
        path="/",
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        httponly=True,
    )
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        httponly=True,
    )


async def _issue_session(response: Response, db: AsyncSession, user: User) -> None:
    access_token = create_access_token(user.id, user.is_admin)
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expiry(),
        )
    )
    await db.flush()
    _set_auth_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)


async def _revoke_refresh_token(db: AsyncSession, refresh_cookie: str | None) -> None:
    if not refresh_cookie:
        return
    now = _utcnow()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(refresh_cookie)
        )
    )
    token_row = result.scalar_one_or_none()
    if token_row and token_row.revoked_at is None:
        token_row.revoked_at = now


async def verify_turnstile(token: str) -> None:
    """Verify Cloudflare Turnstile token. Skip if secret key is not configured."""
    if settings.TURNSTILE_REQUIRED and not settings.TURNSTILE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA obrigatório, mas não configurado no servidor",
        )
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


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    await verify_turnstile(body.turnstile_token)

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos",
        )

    await _issue_session(response, db, user)
    await db.commit()
    return AuthResponse(user=_build_session_response(user))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    await verify_turnstile(body.turnstile_token)

    # Check whitelist if enabled
    setting_result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "registration_whitelist_enabled")
    )
    setting_row = setting_result.scalar_one_or_none()
    if setting_row and setting_row.value == "true":
        allowed = await db.execute(
            select(AllowedUsername).where(
                func.lower(AllowedUsername.username) == body.username.lower()
            )
        )
        if not allowed.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Pau no seu cu, o que vc ta fazendo aqui arrombado? Some inseto!",
            )

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
        is_admin=False,
    )
    db.add(user)
    await db.flush()

    # Create default settings
    user_settings = UserSettings(user_id=user.id)
    db.add(user_settings)

    await _issue_session(response, db, user)
    await db.commit()
    return AuthResponse(user=_build_session_response(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    await _revoke_refresh_token(db, request.cookies.get(settings.REFRESH_COOKIE_NAME))
    await db.commit()
    _clear_auth_cookies(response)


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/minute")
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    refresh_cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token ausente",
        )

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(refresh_cookie)
        )
    )
    token_row = result.scalar_one_or_none()
    now = _utcnow()
    if not token_row or token_row.revoked_at is not None or token_row.expires_at <= now:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
        )

    user_result = await db.execute(select(User).where(User.id == token_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inválido",
        )

    token_row.last_used_at = now
    token_row.revoked_at = now
    await _issue_session(response, db, user)
    await db.commit()
    return AuthResponse(user=_build_session_response(user))


@router.get("/me", response_model=SessionResponse)
async def get_session(
    user: User = Depends(get_current_user),
):
    return _build_session_response(user)
