from __future__ import annotations

import argparse
import asyncio
from datetime import date, timedelta

from app.database import AsyncSessionLocal, engine
from app.services.investidor10_dividend_service import Investidor10DividendService


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


async def _run(start_date: date, end_date: date, dry_run: bool, progress: bool) -> None:
    try:
        async with AsyncSessionLocal() as db:
            service = Investidor10DividendService(
                db,
                request_timeout_seconds=10,
            )
            summary = await service.scan_current_positions(
                start_date=start_date,
                end_date=end_date,
                progress=progress,
            )
            if dry_run:
                await db.rollback()
            else:
                await db.commit()

            print("Investidor10 dividends backfill")
            print(f"Window: {start_date.isoformat()} -> {end_date.isoformat()}")
            print(f"Dry run: {dry_run}")
            print(f"Created: {summary.created}")
            print(f"Updated: {summary.updated}")
            print(f"Skipped: {summary.skipped}")
            print(f"Failed: {len(summary.failed)}")
            for failure in summary.failed:
                print(f"- {failure.get('ticker')}: {failure.get('error')}")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", type=_parse_date, default=date(2026, 1, 1))
    parser.add_argument(
        "--end-date",
        type=_parse_date,
        default=date.today() + timedelta(days=180),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Disable per-asset progress output.",
    )
    args = parser.parse_args()

    asyncio.run(_run(args.start_date, args.end_date, args.dry_run, not args.quiet))


if __name__ == "__main__":
    main()
