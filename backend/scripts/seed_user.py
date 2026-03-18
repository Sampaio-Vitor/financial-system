"""Seed the admin user from environment variables."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.settings import UserSettings
from app.services.auth_service import hash_password
from app.config import settings


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"User '{settings.ADMIN_USERNAME}' already exists (id={existing.id})")
            return

        user = User(
            username=settings.ADMIN_USERNAME,
            password_hash=hash_password(settings.ADMIN_PASSWORD),
        )
        db.add(user)
        await db.flush()

        user_settings = UserSettings(user_id=user.id, usd_brl_rate=5.2633)
        db.add(user_settings)

        await db.commit()
        print(f"Created user '{settings.ADMIN_USERNAME}' (id={user.id})")


if __name__ == "__main__":
    asyncio.run(seed())
