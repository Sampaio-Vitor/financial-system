from cryptography.fernet import Fernet
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+aiomysql://portfolio_user:portfolio_pass@localhost:3307/portfolio"
    CORS_ORIGINS: str = "http://localhost:3000"
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRATION_DAYS: int = 30
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "change-me"
    TURNSTILE_SECRET_KEY: str = ""
    TURNSTILE_REQUIRED: bool = False
    ENCRYPTION_KEY: str
    SESSION_COOKIE_NAME: str = "access_token"
    REFRESH_COOKIE_NAME: str = "refresh_token"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_SAMESITE: str = "strict"
    API_DOCS_ENABLED: bool = True
    CSRF_TRUSTED_ORIGINS: str = ""

    # OCR / Redis
    REDIS_URL: str = "redis://redis:6379"
    GEMINI_API_KEY: str = ""
    OCR_MODEL: str = "gemini-3.1-flash-lite-preview"

    model_config = {"env_file": "../.env", "extra": "ignore"}

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, value: str) -> str:
        try:
            Fernet(value.encode())
        except Exception as exc:
            raise ValueError(
                "ENCRYPTION_KEY must be a valid Fernet key."
            ) from exc
        return value

    @field_validator("SESSION_COOKIE_SAMESITE")
    @classmethod
    def validate_session_cookie_samesite(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("SESSION_COOKIE_SAMESITE must be one of: lax, strict, none.")
        return normalized


settings = Settings()
