"""Pytest fixtures for the FastAPI backend.

Tests run against an in-memory SQLite database so they're hermetic and fast.
External integrations (yfinance, brapi, Bastter, Pluggy, Gemini, Redis/arq) are
patched per-test or via fixtures that replace the relevant module-level
functions.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# Configure required env BEFORE importing app.config
os.environ.setdefault("SECRET_KEY", "test-secret-key-please-do-not-use-in-prod")
os.environ.setdefault("ENCRYPTION_KEY", "ZmDfcTF7_60GrrY167zsiPd67pEvs0aGOv2oasOM1Pg=")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("CORS_ORIGINS", "http://testserver")
os.environ.setdefault("CSRF_TRUSTED_ORIGINS", "http://testserver")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("API_DOCS_ENABLED", "false")
os.environ.setdefault("TURNSTILE_SECRET_KEY", "")
os.environ.setdefault("TURNSTILE_REQUIRED", "false")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401 — side-effect: registers tables
from app.database import Base, get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.user import User
from app.services.auth_service import hash_password


@asynccontextmanager
async def _noop_lifespan(app):
    yield


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def user(db: AsyncSession) -> User:
    u = User(
        username="alice",
        password_hash=hash_password("password123"),
        is_admin=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    u = User(
        username="root",
        password_hash=hash_password("rootpass123"),
        is_admin=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def app(session_factory, monkeypatch):
    """FastAPI app with DB swapped for SQLite and rate limiter disabled."""
    from app import limiter as limiter_mod
    from app.main import app as fastapi_app

    monkeypatch.setattr(limiter_mod.limiter, "enabled", False, raising=False)
    fastapi_app.router.lifespan_context = _noop_lifespan

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"Origin": "http://testserver"},
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_client(app, client, user) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_current_user] = lambda: user
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture
async def admin_client(app, client, admin_user) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_current_user] = lambda: admin_user
    app.dependency_overrides[get_admin_user] = lambda: admin_user
    yield client
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_admin_user, None)
