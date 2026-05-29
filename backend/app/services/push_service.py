from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


async def upsert_subscription(
    db: AsyncSession,
    *,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
) -> PushSubscription:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.user_id = user_id
        subscription.p256dh = p256dh
        subscription.auth = auth
        subscription.user_agent = user_agent
        subscription.enabled = True
        subscription.last_seen_at = now
        subscription.failed_at = None
        return subscription

    subscription = PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
        enabled=True,
        created_at=now,
        last_seen_at=now,
    )
    db.add(subscription)
    return subscription


async def unsubscribe_endpoint(
    db: AsyncSession,
    *,
    user_id: int,
    endpoint: str,
) -> bool:
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        return False
    subscription.enabled = False
    subscription.failed_at = datetime.now(timezone.utc)
    return True


async def send_notification_pushes(
    db: AsyncSession,
    *,
    notification: Notification,
) -> int:
    if not push_enabled():
        return 0

    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == notification.user_id,
            PushSubscription.enabled.is_(True),
        )
    )
    subscriptions = result.scalars().all()
    if not subscriptions:
        return 0

    payload = {
        "id": notification.id,
        "title": notification.title,
        "body": notification.message,
        "severity": notification.severity,
        "link": notification.link or "/carteira",
        "created_at": notification.created_at.isoformat(),
    }
    sent = 0
    for subscription in subscriptions:
        try:
            await _send_web_push(subscription, payload)
            sent += 1
        except Exception as exc:
            logger.warning(
                "Disabling failed push subscription %s: %s", subscription.id, exc
            )
            subscription.enabled = False
            subscription.failed_at = datetime.now(timezone.utc)
    return sent


async def _send_web_push(subscription: PushSubscription, payload: dict) -> None:
    await asyncio.to_thread(_send_web_push_sync, subscription, payload)


def _send_web_push_sync(subscription: PushSubscription, payload: dict) -> None:
    from pywebpush import webpush

    webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        },
        data=json.dumps(payload),
        vapid_private_key=settings.VAPID_PRIVATE_KEY,
        vapid_claims={"sub": settings.VAPID_SUBJECT},
    )
