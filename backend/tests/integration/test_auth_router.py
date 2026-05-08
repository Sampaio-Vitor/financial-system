from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.auth_service import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
)


pytestmark = pytest.mark.integration


async def test_register_creates_user_and_sets_cookies(client):
    r = await client.post(
        "/api/auth/register",
        json={"username": "newbie", "password": "secret123"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["username"] == "newbie"
    assert body["user"]["is_admin"] is False
    cookies = client.cookies
    assert settings.SESSION_COOKIE_NAME in cookies
    assert settings.REFRESH_COOKIE_NAME in cookies


async def test_register_rejects_short_username(client):
    r = await client.post(
        "/api/auth/register",
        json={"username": "ab", "password": "secret123"},
    )
    assert r.status_code == 422


async def test_register_rejects_short_password(client):
    r = await client.post(
        "/api/auth/register",
        json={"username": "abcde", "password": "x"},
    )
    assert r.status_code == 422


async def test_register_username_conflict(client, db, user):
    r = await client.post(
        "/api/auth/register",
        json={"username": user.username, "password": "secret123"},
    )
    assert r.status_code == 409


async def test_login_success(client, db, user):
    r = await client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "password123"},
    )
    assert r.status_code == 200
    assert r.json()["user"]["username"] == user.username


async def test_login_wrong_password(client, user):
    r = await client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "WRONG"},
    )
    assert r.status_code == 401


async def test_login_unknown_user(client):
    r = await client.post(
        "/api/auth/login",
        json={"username": "nobody", "password": "password123"},
    )
    assert r.status_code == 401


async def test_me_requires_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


async def test_me_with_bearer_token(client, user):
    token = create_access_token(user.id, user.is_admin)
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["user_id"] == user.id


async def test_logout_clears_cookies(client, user):
    await client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "password123"},
    )
    r = await client.post("/api/auth/logout")
    assert r.status_code == 204


async def test_refresh_rotates_token(client, db, user):
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expiry(),
        )
    )
    await db.commit()
    client.cookies.set(settings.REFRESH_COOKIE_NAME, refresh_token)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200
    rows = (await db.execute(select(RefreshToken))).scalars().all()
    revoked = [t for t in rows if t.revoked_at is not None]
    assert len(revoked) == 1


async def test_refresh_missing_cookie(client):
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_refresh_expired_token(client, db, user):
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.utcnow() - timedelta(days=1),
        )
    )
    await db.commit()
    client.cookies.set(settings.REFRESH_COOKIE_NAME, refresh_token)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_register_whitelist_blocks(client, db):
    from app.models.system_setting import SystemSetting

    db.add(SystemSetting(key="registration_whitelist_enabled", value="true"))
    await db.commit()
    r = await client.post(
        "/api/auth/register",
        json={"username": "denied", "password": "secret123"},
    )
    assert r.status_code == 403


async def test_register_whitelist_allows_listed_user(client, db):
    from app.models.allowed_username import AllowedUsername
    from app.models.system_setting import SystemSetting

    db.add(SystemSetting(key="registration_whitelist_enabled", value="true"))
    db.add(AllowedUsername(username="permitted"))
    await db.commit()
    r = await client.post(
        "/api/auth/register",
        json={"username": "permitted", "password": "secret123"},
    )
    assert r.status_code == 201
