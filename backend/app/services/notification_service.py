from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.services.push_service import send_notification_pushes


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    severity: str = "info",
    link: str | None = None,
    metadata: dict | None = None,
    dedupe_key: str | None = None,
) -> Notification:
    if dedupe_key:
        result = await db.execute(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.dedupe_key == dedupe_key,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        severity=severity,
        link=link,
        notification_metadata=metadata,
        dedupe_key=dedupe_key,
    )
    db.add(notification)
    await db.flush()
    await send_notification_pushes(db, notification=notification)
    return notification


async def unread_count(db: AsyncSession, *, user_id: int) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    )
    return int(result.scalar() or 0)


def mark_read(notification: Notification) -> None:
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
