from datetime import datetime, timezone

import pytest

from app.models.notification import Notification
from app.models.user import User
from app.services.auth_service import hash_password
from app.services.notification_service import create_notification


pytestmark = pytest.mark.integration


async def _create_other_user(db):
    user = User(
        username="bob",
        password_hash=hash_password("password123"),
        is_admin=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def test_list_empty(auth_client):
    response = await auth_client.get("/api/notifications")

    assert response.status_code == 200
    assert response.json() == {
        "notifications": [],
        "unread_count": 0,
        "total_count": 0,
    }


async def test_list_notifications_is_user_scoped(auth_client, db, user):
    other_user = await _create_other_user(db)
    db.add(
        Notification(
            user_id=user.id,
            type="TEST",
            title="Mine",
            message="Visible",
            severity="info",
        )
    )
    db.add(
        Notification(
            user_id=other_user.id,
            type="TEST",
            title="Other",
            message="Hidden",
            severity="info",
        )
    )
    await db.commit()

    response = await auth_client.get("/api/notifications")
    body = response.json()

    assert response.status_code == 200
    assert body["total_count"] == 1
    assert body["unread_count"] == 1
    assert body["notifications"][0]["title"] == "Mine"


async def test_unread_count_and_mark_read(auth_client, db, user):
    notification = Notification(
        user_id=user.id,
        type="TEST",
        title="Unread",
        message="Message",
        severity="info",
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    count_response = await auth_client.get("/api/notifications/unread-count")
    assert count_response.json() == {"unread_count": 1}

    read_response = await auth_client.patch(f"/api/notifications/{notification.id}/read")
    assert read_response.status_code == 200
    assert read_response.json()["read_at"] is not None

    count_response = await auth_client.get("/api/notifications/unread-count")
    assert count_response.json() == {"unread_count": 0}


async def test_mark_all_read(auth_client, db, user):
    db.add_all(
        [
            Notification(
                user_id=user.id,
                type="TEST",
                title="One",
                message="Message",
                severity="info",
            ),
            Notification(
                user_id=user.id,
                type="TEST",
                title="Two",
                message="Message",
                severity="warning",
            ),
        ]
    )
    await db.commit()

    response = await auth_client.post("/api/notifications/mark-all-read")
    assert response.status_code == 204

    count_response = await auth_client.get("/api/notifications/unread-count")
    assert count_response.json() == {"unread_count": 0}


async def test_create_notification_dedupes_by_user_and_key(db, user):
    first = await create_notification(
        db,
        user_id=user.id,
        notification_type="TEST",
        title="One",
        message="Message",
        dedupe_key="event:1",
    )
    await db.flush()
    second = await create_notification(
        db,
        user_id=user.id,
        notification_type="TEST",
        title="Two",
        message="Different",
        dedupe_key="event:1",
    )

    assert second.id == first.id
    assert second.title == "One"
