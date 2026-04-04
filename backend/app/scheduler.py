import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, text

from app.database import AsyncSessionLocal, engine
from app.models.user import User
from app.services.price_service import PriceService, _upsert_system_setting
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
PRICE_UPDATE_LOCK_NAME = "daily_price_update_job"


async def _record_last_run(db, status: str) -> None:
    await _upsert_system_setting(
        db, "last_price_update_at", datetime.now(timezone.utc).isoformat()
    )
    await _upsert_system_setting(db, "last_price_update_status", status)
    await db.commit()


async def _execute_price_update_cycle(db) -> dict:
    """Update prices, generate daily snapshots, and persist the aggregate run status."""
    logger.info("Starting daily price update cycle")

    try:
        service = PriceService(db)
        results = await service.update_all_prices()

        users_result = await db.execute(select(User))
        users = users_result.scalars().all()
        today = date.today()

        snapshot_failures: list[dict[str, int]] = []
        snapshot_success_count = 0

        for user in users:
            try:
                snap_service = SnapshotService(db, user)
                await snap_service.generate_daily_snapshot(today)
                await db.commit()
                snapshot_success_count += 1
            except Exception:
                await db.rollback()
                snapshot_failures.append({"user_id": user.id})
                logger.exception("Failed daily snapshot for user %s", user.id)

        status = "success" if not results["failed"] and not snapshot_failures else "partial"
        results["status"] = status
        results["snapshots"] = {
            "generated": snapshot_success_count,
            "failed": snapshot_failures,
        }

        await _record_last_run(db, status)
        logger.info(
            "Price update cycle finished: %s prices updated, %s price failures, %s snapshots generated, %s snapshot failures",
            len(results["updated"]),
            len(results["failed"]),
            snapshot_success_count,
            len(snapshot_failures),
        )
        return results
    except Exception:
        logger.exception("Daily price update cycle failed")
        try:
            await _record_last_run(db, "failed")
        except Exception:
            logger.exception("Failed to record job failure status")
        raise


async def run_price_update_cycle() -> dict | None:
    """Run the price update cycle once, skipping when another worker already owns the lock."""
    async with engine.connect() as lock_conn:
        acquired = await lock_conn.scalar(
            text("SELECT GET_LOCK(:lock_name, 0)"),
            {"lock_name": PRICE_UPDATE_LOCK_NAME},
        )
        if acquired != 1:
            logger.info("Skipping price update cycle because another worker already holds the lock")
            return None

        try:
            async with AsyncSessionLocal() as db:
                return await _execute_price_update_cycle(db)
        finally:
            try:
                await lock_conn.execute(
                    text("SELECT RELEASE_LOCK(:lock_name)"),
                    {"lock_name": PRICE_UPDATE_LOCK_NAME},
                )
            except Exception:
                logger.exception("Failed to release price update lock")


async def daily_price_update_job():
    """Entry point used by APScheduler."""
    await run_price_update_cycle()


def setup_scheduler():
    """Configure and return the scheduler with the daily price update job."""
    scheduler.add_job(
        daily_price_update_job,
        CronTrigger(hour=21, minute=0, timezone="UTC"),
        id="daily_price_update",
        name="Daily Price Update + Snapshots",
        replace_existing=True,
    )
    return scheduler
