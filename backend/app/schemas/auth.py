import re

from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str
    turnstile_token: str = ""


class RegisterRequest(BaseModel):
    username: str
    password: str
    turnstile_token: str = ""

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Nome de usuário deve ter entre 3 e 30 caracteres")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Nome de usuário deve conter apenas letras, números e underscore")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6 or len(v) > 72:
            raise ValueError("Senha deve ter entre 6 e 72 caracteres")
        return v


class SessionResponse(BaseModel):
    user_id: int
    username: str
    is_admin: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: SessionResponse
