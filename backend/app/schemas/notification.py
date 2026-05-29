from datetime import datetime

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    severity: str
    link: str | None = None
    metadata: dict | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
    total_count: int


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int = Field(ge=0)


class PushPublicKeyResponse(BaseModel):
    enabled: bool
    public_key: str | None = None


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class PushSubscriptionResponse(BaseModel):
    subscribed: bool
