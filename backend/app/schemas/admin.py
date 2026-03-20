import re
from datetime import datetime

from pydantic import BaseModel, field_validator


class AllowedUsernameCreate(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Nome de usuário deve ter entre 3 e 30 caracteres")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Nome de usuário deve conter apenas letras, números e underscore")
        return v


class AllowedUsernameResponse(BaseModel):
    id: int
    username: str
    created_at: datetime


class SystemSettingsResponse(BaseModel):
    registration_whitelist_enabled: bool


class SystemSettingsUpdate(BaseModel):
    registration_whitelist_enabled: bool
