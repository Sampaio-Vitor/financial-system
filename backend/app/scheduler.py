import logging
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import func, select, text

from decimal import Decimal

from app.database import AsyncSessionLocal, engine
from app.models.asset import Asset, AssetClass, resolve_asset_metadata
from app.models.asset_price_history import AssetPriceHistory
from app.models.fixed_income import FixedIncomePosition
from app.models.purchase import Purchase
from app.models.user import User
from app.models.user_asset import UserAsset
from app.services.connection_sync_service import sync_user_connections
from app.services.investidor10_dividend_service import Investidor10DividendService
from app.services.investing_dividend_service import InvestingDividendService
from app.services.notification_producer_service import (
    notify_investing_dividend_detected,
    notify_investing_dividend_fetch_failed,
    notify_price_update_results_for_users,
    notification_exists,
    scan_fixed_income_maturities,
    scan_retirement_milestones,
)
from app.services.price_service import PriceService, _upsert_system_setting
from app.services.price_anomaly_service import scan_and_notify_purchase_price_anomalies
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
PRICE_UPDATE_LOCK_NAME = "daily_price_update_job"
INVESTING_DIVIDEND_LOCK_NAME = "investing_dividend_scan_job"
INVESTIDOR10_DIVIDEND_LOCK_NAME = "investidor10_dividend_scan_job"
PRICE_HISTORY_BACKFILL_LOCK_NAME = "price_history_backfill_job"


def is_last_business_day_of_month(day: date) -> bool:
    """Return True when the given weekday is the last Mon-Fri day of its month."""
    if day.weekday() >= 5:
        return False

    next_day = day + timedelta(days=1)
    while next_day.month == day.month:
        if next_day.weekday() < 5:
            return False
        next_day += timedelta(days=1)

    return True


async def _record_last_run(db, status: str) -> None:
    await _upsert_system_setting(
        db, "last_price_update_at", datetime.now(timezone.utc).isoformat()
    )
    await _upsert_system_setting(db, "last_price_update_status", status)
    await db.commit()


async def _recompute_tesouro_positions(db) -> int:
    """Recompute current_balance for FI positions linked to Tesouro assets."""
    rows = await db.execute(
        select(FixedIncomePosition, Asset)
        .join(Asset, Asset.id == FixedIncomePosition.asset_id)
        .where(Asset.td_kind.is_not(None))
    )
    updated = 0
    for fi, asset in rows.all():
        if not fi.quantity or not asset.current_price:
            continue
        fi.current_balance = (fi.quantity * asset.current_price).quantize(
            Decimal("0.0001")
        )
        if fi.applied_value:
            fi.yield_value = fi.current_balance - fi.applied_value
            fi.yield_pct = fi.yield_value / fi.applied_value
        updated += 1
    if updated:
        logger.info("Recomputed %s Tesouro position(s)", updated)
    return updated


async def _notify_investing_dividend_results(
    db,
    *,
    summary,
    run_date: date,
) -> int:
    notifications_created = 0
    for event in summary.detected:
        if not event.asset_id or not event.ticker or not event.source_event_key:
            continue
        dedupe_key = (
            f"investing_dividend:{event.user_id}:{event.asset_id}:"
            f"{event.source_event_key}"
        )
        if await notification_exists(db, user_id=event.user_id, dedupe_key=dedupe_key):
            continue
        await notify_investing_dividend_detected(
            db,
            user_id=event.user_id,
            asset_id=event.asset_id,
            source_event_key=event.source_event_key,
            ticker=event.ticker,
            net_amount=event.credited_amount,
            payment_date=event.payment_date,
            status=event.status,
        )
        notifications_created += 1

    for failure in summary.failed:
        ticker = str(failure.get("ticker", "")).strip()
        if not ticker:
            continue
        user_ids_result = await db.execute(
            select(UserAsset.user_id)
            .join(Asset, Asset.id == UserAsset.asset_id)
            .join(Purchase, Purchase.asset_id == UserAsset.asset_id)
            .where(
                Asset.ticker == ticker,
                Asset.investing_dividends_failure_count >= 3,
                UserAsset.paused.is_(False),
                Purchase.user_id == UserAsset.user_id,
            )
            .group_by(UserAsset.user_id)
            .having(func.coalesce(func.sum(Purchase.quantity), 0) > 0)
        )
        for user_id in set(user_ids_result.scalars().all()):
            dedupe_key = (
                f"investing_dividend_fetch_failed:{user_id}:{ticker}:"
                f"{run_date.isoformat()}"
            )
            if await notification_exists(db, user_id=user_id, dedupe_key=dedupe_key):
                continue
            await notify_investing_dividend_fetch_failed(
                db,
                user_id=user_id,
                ticker=ticker,
                error=str(failure.get("error", "Erro desconhecido")),
                run_date=run_date,
            )
            notifications_created += 1
    return notifications_created


async def _execute_price_update_cycle(db) -> dict:
    """Update prices, generate daily snapshots, and persist the aggregate run status."""
    logger.info("Starting daily price update cycle")

    try:
        service = PriceService(db)
        results = await service.update_all_prices()

        await _recompute_tesouro_positions(db)
        await db.commit()

        users_result = await db.execute(select(User))
        users = users_result.scalars().all()
        today = date.today()

        connection_summaries: list[dict] = []
        for user in users:
            try:
                summary = await sync_user_connections(db, user)
            except Exception:
                await db.rollback()
                logger.exception("Failed to sync connections for user %s", user.id)
                connection_summaries.append(
                    {
                        "user_id": user.id,
                        "synced": 0,
                        "new_transactions": 0,
                        "failed": [{"reason": "exception"}],
                    }
                )
                continue
            connection_summaries.append(summary)

        connections_synced = sum(s["synced"] for s in connection_summaries)
        connections_new_txns = sum(s["new_transactions"] for s in connection_summaries)
        connection_failures = [
            {"user_id": s["user_id"], "failed": s["failed"]}
            for s in connection_summaries
            if s["failed"]
        ]

        snapshot_failures: list[dict[str, int]] = []
        snapshot_success_count = 0
        monthly_snapshot_failures: list[dict[str, int]] = []
        monthly_snapshot_success_count = 0
        should_generate_monthly_snapshot = is_last_business_day_of_month(today)

        for user in users:
            snap_service = SnapshotService(db, user)

            try:
                await snap_service.generate_daily_snapshot(today)
                await db.commit()
                snapshot_success_count += 1
            except Exception:
                await db.rollback()
                snapshot_failures.append({"user_id": user.id})
                logger.exception("Failed daily snapshot for user %s", user.id)
                continue

            if not should_generate_monthly_snapshot:
                continue

            try:
                await snap_service.generate_snapshot(today.year, today.month)
                await db.commit()
                monthly_snapshot_success_count += 1
            except Exception:
                await db.rollback()
                monthly_snapshot_failures.append({"user_id": user.id})
                logger.exception("Failed monthly snapshot for user %s", user.id)

        status = (
            "success"
            if not results["failed"]
            and not snapshot_failures
            and not monthly_snapshot_failures
            and not connection_failures
            else "partial"
        )
        results["status"] = status
        results["snapshots"] = {
            "generated": snapshot_success_count,
            "failed": snapshot_failures,
        }
        results["monthly_snapshots"] = {
            "attempted": should_generate_monthly_snapshot,
            "generated": monthly_snapshot_success_count,
            "failed": monthly_snapshot_failures,
        }
        results["connections"] = {
            "synced": connections_synced,
            "new_transactions": connections_new_txns,
            "failed": connection_failures,
        }

        notification_failures: list[dict] = []
        notifications_created = 0

        try:
            notifications_created += await notify_price_update_results_for_users(
                db,
                results=results,
                users=users,
                run_date=today,
            )
            await db.commit()
        except Exception:
            await db.rollback()
            notification_failures.append({"stage": "price_update"})
            logger.exception("Failed to create price update notifications")

        try:
            notifications_created += await scan_fixed_income_maturities(db, today=today)
            await db.commit()
        except Exception:
            await db.rollback()
            notification_failures.append({"stage": "fixed_income_maturities"})
            logger.exception("Failed to scan fixed income maturity notifications")

        for user in users:
            try:
                notifications_created += await scan_and_notify_purchase_price_anomalies(
                    db, user
                )
                notifications_created += await scan_retirement_milestones(db, user)
                await db.commit()
            except Exception:
                await db.rollback()
                notification_failures.append(
                    {"stage": "user_scans", "user_id": user.id}
                )
                logger.exception("Failed notification scans for user %s", user.id)

        results["notifications"] = {
            "created": notifications_created,
            "failed": notification_failures,
        }

        await _record_last_run(db, status)
        logger.info(
            "Price update cycle finished: %s prices updated, %s price failures, %s connections synced, %s new txns, %s connection failures, %s snapshots generated, %s snapshot failures, monthly attempted=%s, %s monthly snapshots generated, %s monthly snapshot failures",
            len(results["updated"]),
            len(results["failed"]),
            connections_synced,
            connections_new_txns,
            len(connection_failures),
            snapshot_success_count,
            len(snapshot_failures),
            should_generate_monthly_snapshot,
            monthly_snapshot_success_count,
            len(monthly_snapshot_failures),
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
            logger.info(
                "Skipping price update cycle because another worker already holds the lock"
            )
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


async def _execute_investing_dividend_scan(db) -> dict:
    now = datetime.now(timezone.utc)
    service = InvestingDividendService(db)
    summary = await service.scan_due_positions(
        start_date=now.date() - timedelta(days=30),
        end_date=now.date() + timedelta(days=180),
        now=now,
    )
    await db.commit()

    notifications_created = 0
    try:
        notifications_created = await _notify_investing_dividend_results(
            db,
            summary=summary,
            run_date=now.date(),
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to create Investing dividend scan notifications")

    logger.info(
        "Investing dividend scan finished: created=%s updated=%s skipped=%s failed=%s notifications=%s",
        summary.created,
        summary.updated,
        summary.skipped,
        len(summary.failed),
        notifications_created,
    )
    return {
        "created": summary.created,
        "updated": summary.updated,
        "skipped": summary.skipped,
        "failed": summary.failed,
        "notifications_created": notifications_created,
    }


async def _execute_investidor10_dividend_scan(db) -> dict:
    now = datetime.now(timezone.utc)
    service = Investidor10DividendService(db)
    summary = await service.scan_due_positions(
        start_date=now.date() - timedelta(days=30),
        end_date=now.date() + timedelta(days=180),
        now=now,
    )
    await db.commit()

    notifications_created = 0
    try:
        notifications_created = await _notify_investing_dividend_results(
            db,
            summary=summary,
            run_date=now.date(),
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to create Investidor10 dividend scan notifications")

    logger.info(
        "Investidor10 dividend scan finished: created=%s updated=%s skipped=%s failed=%s notifications=%s",
        summary.created,
        summary.updated,
        summary.skipped,
        len(summary.failed),
        notifications_created,
    )
    return {
        "created": summary.created,
        "updated": summary.updated,
        "skipped": summary.skipped,
        "failed": summary.failed,
        "notifications_created": notifications_created,
    }


async def run_investing_dividend_scan() -> dict | None:
    """Run a small due-asset Investing scan, skipping when another worker owns the lock."""
    async with engine.connect() as lock_conn:
        acquired = await lock_conn.scalar(
            text("SELECT GET_LOCK(:lock_name, 0)"),
            {"lock_name": INVESTING_DIVIDEND_LOCK_NAME},
        )
        if acquired != 1:
            logger.info(
                "Skipping Investing dividend scan because another worker already holds the lock"
            )
            return None

        try:
            async with AsyncSessionLocal() as db:
                return await _execute_investing_dividend_scan(db)
        finally:
            try:
                await lock_conn.execute(
                    text("SELECT RELEASE_LOCK(:lock_name)"),
                    {"lock_name": INVESTING_DIVIDEND_LOCK_NAME},
                )
            except Exception:
                logger.exception("Failed to release Investing dividend scan lock")


async def run_investidor10_dividend_scan() -> dict | None:
    """Run a small due-asset Investidor10 scan, skipping when another worker owns the lock."""
    async with engine.connect() as lock_conn:
        acquired = await lock_conn.scalar(
            text("SELECT GET_LOCK(:lock_name, 0)"),
            {"lock_name": INVESTIDOR10_DIVIDEND_LOCK_NAME},
        )
        if acquired != 1:
            logger.info(
                "Skipping Investidor10 dividend scan because another worker already holds the lock"
            )
            return None

        try:
            async with AsyncSessionLocal() as db:
                return await _execute_investidor10_dividend_scan(db)
        finally:
            try:
                await lock_conn.execute(
                    text("SELECT RELEASE_LOCK(:lock_name)"),
                    {"lock_name": INVESTIDOR10_DIVIDEND_LOCK_NAME},
                )
            except Exception:
                logger.exception("Failed to release Investidor10 dividend scan lock")


async def _execute_price_history_backfill(db) -> dict:
    """Backfill a few assets with missing long-range price history."""
    end_date = date.today()
    start_date = end_date - timedelta(days=365 * 10)
    rows = await db.execute(
        select(Asset, func.min(AssetPriceHistory.date).label("first_cached"))
        .outerjoin(AssetPriceHistory, AssetPriceHistory.asset_id == Asset.id)
        .group_by(Asset.id)
        .order_by(func.min(AssetPriceHistory.date).is_not(None), Asset.ticker)
    )
    candidates: list[Asset] = []
    for asset, first_cached in rows.all():
        asset_class, _market, _quote_currency = resolve_asset_metadata(
            legacy_type=asset.type,
            asset_class=asset.asset_class,
            market=asset.market,
            quote_currency=asset.quote_currency,
        )
        if asset_class == AssetClass.RF:
            continue
        if asset.description.strip().endswith(" Demo"):
            continue
        if first_cached is None or first_cached > start_date:
            candidates.append(asset)
        if len(candidates) >= 3:
            break

    service = PriceService(db)
    results = {"updated": [], "failed": []}
    for asset in candidates:
        before_result = await db.execute(
            select(func.count()).where(
                AssetPriceHistory.asset_id == asset.id,
                AssetPriceHistory.date >= start_date,
                AssetPriceHistory.date <= end_date,
            )
        )
        before_count = before_result.scalar() or 0
        try:
            cached = await service.ensure_asset_price_history_range(
                asset, start_date, end_date, require_ohlc=False
            )
            await db.commit()
            results["updated"].append(
                {
                    "ticker": asset.ticker,
                    "rows": len(cached),
                    "new_rows": max(0, len(cached) - before_count),
                }
            )
        except Exception as exc:
            await db.rollback()
            logger.warning(
                "Failed to backfill price history for %s", asset.ticker, exc_info=True
            )
            results["failed"].append({"ticker": asset.ticker, "error": str(exc)})

    logger.info(
        "Price history backfill finished: updated=%s failed=%s",
        len(results["updated"]),
        len(results["failed"]),
    )
    return results


async def run_price_history_backfill() -> dict | None:
    """Run a small long-range price history backfill, skipping when locked."""
    async with engine.connect() as lock_conn:
        acquired = await lock_conn.scalar(
            text("SELECT GET_LOCK(:lock_name, 0)"),
            {"lock_name": PRICE_HISTORY_BACKFILL_LOCK_NAME},
        )
        if acquired != 1:
            logger.info(
                "Skipping price history backfill because another worker holds the lock"
            )
            return None

        try:
            async with AsyncSessionLocal() as db:
                return await _execute_price_history_backfill(db)
        finally:
            try:
                await lock_conn.execute(
                    text("SELECT RELEASE_LOCK(:lock_name)"),
                    {"lock_name": PRICE_HISTORY_BACKFILL_LOCK_NAME},
                )
            except Exception:
                logger.exception("Failed to release price history backfill lock")


async def investing_dividend_scan_job():
    """Entry point used by APScheduler for distributed Investing scans."""
    await run_investing_dividend_scan()


async def investidor10_dividend_scan_job():
    """Entry point used by APScheduler for distributed Investidor10 scans."""
    await run_investidor10_dividend_scan()


async def price_history_backfill_job():
    """Entry point used by APScheduler for incremental price history backfills."""
    await run_price_history_backfill()


def setup_scheduler():
    """Configure and return the scheduler jobs."""
    scheduler.add_job(
        daily_price_update_job,
        CronTrigger(hour=21, minute=0, timezone="UTC"),
        id="daily_price_update",
        name="Daily Price Update + Snapshots",
        replace_existing=True,
    )
    scheduler.add_job(
        investing_dividend_scan_job,
        IntervalTrigger(minutes=30),
        id="investing_dividend_scan",
        name="Distributed Investing Dividend Scan",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        investidor10_dividend_scan_job,
        IntervalTrigger(minutes=30),
        id="investidor10_dividend_scan",
        name="Distributed Investidor10 Dividend Scan",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        price_history_backfill_job,
        CronTrigger(day_of_week="sun", hour=3, minute=30, timezone="UTC"),
        id="price_history_backfill",
        name="Incremental Price History Backfill",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    return scheduler
