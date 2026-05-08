from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.config import settings
from app.services import auth_service


pytestmark = pytest.mark.unit


def test_hash_password_round_trip():
    h = auth_service.hash_password("hunter2!")
    assert h != "hunter2!"
    assert auth_service.verify_password("hunter2!", h) is True
    assert auth_service.verify_password("wrong", h) is False


def test_hash_password_uses_unique_salt():
    a = auth_service.hash_password("samepass")
    b = auth_service.hash_password("samepass")
    assert a != b
    assert auth_service.verify_password("samepass", a)
    assert auth_service.verify_password("samepass", b)


def test_create_access_token_payload_and_expiry():
    token = auth_service.create_access_token(user_id=42, is_admin=True)
    decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert decoded["sub"] == "42"
    assert decoded["is_admin"] is True
    assert decoded["type"] == "access"
    exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
    delta = exp - datetime.now(timezone.utc)
    assert timedelta(minutes=settings.JWT_EXPIRATION_MINUTES - 1) <= delta <= timedelta(
        minutes=settings.JWT_EXPIRATION_MINUTES + 1
    )


def test_create_access_token_signed_with_wrong_secret_fails():
    token = auth_service.create_access_token(user_id=1, is_admin=False)
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, "different", algorithms=[settings.JWT_ALGORITHM])


def test_refresh_token_generation_and_hash():
    token_a = auth_service.generate_refresh_token()
    token_b = auth_service.generate_refresh_token()
    assert token_a != token_b
    assert len(token_a) >= 40
    assert auth_service.hash_refresh_token(token_a) == auth_service.hash_refresh_token(token_a)
    assert auth_service.hash_refresh_token(token_a) != auth_service.hash_refresh_token(token_b)


def test_refresh_token_expiry_in_future():
    expiry = auth_service.refresh_token_expiry()
    assert expiry > datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRATION_DAYS - 1)
