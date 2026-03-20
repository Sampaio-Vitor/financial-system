from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+aiomysql://portfolio_user:portfolio_pass@localhost:3307/portfolio"
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 1440
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "change-me"
    TURNSTILE_SECRET_KEY: str = ""

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
