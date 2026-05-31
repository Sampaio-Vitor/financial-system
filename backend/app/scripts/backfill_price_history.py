from __future__ import annotations

import argparse
import asyncio
from datetime import date, timedelta

from sqlalchemy import func, select

from app.database import AsyncSessionLocal, engine
from app.models.asset import Asset, AssetClass, Market, resolve_asset_metadata
from app.models.asset_price_history import AssetPriceHistory
from app.services.price_service import PriceService


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def _parse_asset_class(value: str) -> AssetClass:
    return AssetClass(value.upper())


def _parse_market(value: str) -> Market:
    return Market(value.upper())


def _is_eligible_asset(
    asset: Asset,
    asset_class: AssetClass | None,
    market: Market | None,
) -> bool:
    resolved_class, resolved_market, _quote_currency = resolve_asset_metadata(
        legacy_type=asset.type,
        asset_class=asset.asset_class,
        market=asset.market,
        quote_currency=asset.quote_currency,
    )
    if resolved_class == AssetClass.RF:
        return False
    if asset.description.strip().endswith(" Demo"):
        return False
    if asset_class is not None and resolved_class != asset_class:
        return False
    if market is not None and resolved_market != market:
        return False
    return True


async def _load_assets(
    asset_class: AssetClass | None,
    market: Market | None,
    only_missing_since: date | None,
    limit: int | None,
) -> list[Asset]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Asset).order_by(Asset.ticker))
        assets = [
            asset
            for asset in result.scalars().all()
            if _is_eligible_asset(asset, asset_class, market)
        ]

        if only_missing_since is not None:
            filtered: list[Asset] = []
            for asset in assets:
                min_result = await db.execute(
                    select(func.min(AssetPriceHistory.date)).where(
                        AssetPriceHistory.asset_id == asset.id
                    )
                )
                first_cached = min_result.scalar()
                if first_cached is None or first_cached > only_missing_since:
                    filtered.append(asset)
            assets = filtered

        return assets[:limit] if limit is not None else assets


async def _run(
    start_date: date,
    end_date: date,
    asset_class: AssetClass | None,
    market: Market | None,
    limit: int | None,
    sleep_seconds: float,
    dry_run: bool,
    quiet: bool,
) -> None:
    assets = await _load_assets(asset_class, market, start_date, limit)

    print("Price history backfill")
    print(f"Window: {start_date.isoformat()} -> {end_date.isoformat()}")
    print(f"Asset class: {asset_class.value if asset_class else 'ALL'}")
    print(f"Market: {market.value if market else 'ALL'}")
    print(f"Assets: {len(assets)}")
    print(f"Dry run: {dry_run}")

    succeeded = 0
    failed: list[tuple[str, str]] = []
    rows_written = 0

    try:
        for index, asset in enumerate(assets, start=1):
            async with AsyncSessionLocal() as db:
                service = PriceService(db)
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
                        asset,
                        start_date,
                        end_date,
                        require_ohlc=False,
                    )
                    after_count = len(cached)
                    written = max(0, after_count - before_count)
                    rows_written += written
                    if dry_run:
                        await db.rollback()
                    else:
                        await db.commit()
                    succeeded += 1
                    if not quiet:
                        print(
                            f"[{index}/{len(assets)}] {asset.ticker}: "
                            f"{after_count} rows ({written} new)"
                        )
                except Exception as exc:
                    await db.rollback()
                    failed.append((asset.ticker, str(exc)))
                    print(f"[{index}/{len(assets)}] {asset.ticker}: failed: {exc}")

            if sleep_seconds > 0 and index < len(assets):
                await asyncio.sleep(sleep_seconds)

        print(f"Succeeded: {succeeded}")
        print(f"Rows written: {rows_written}")
        print(f"Failed: {len(failed)}")
        for ticker, error in failed:
            print(f"- {ticker}: {error}")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=10)
    parser.add_argument("--start-date", type=_parse_date)
    parser.add_argument("--end-date", type=_parse_date, default=date.today())
    parser.add_argument("--asset-class", type=_parse_asset_class)
    parser.add_argument("--market", type=_parse_market)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--sleep-seconds", type=float, default=2)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    start_date = args.start_date or (args.end_date - timedelta(days=365 * args.years))
    asyncio.run(
        _run(
            start_date=start_date,
            end_date=args.end_date,
            asset_class=args.asset_class,
            market=args.market,
            limit=args.limit,
            sleep_seconds=args.sleep_seconds,
            dry_run=args.dry_run,
            quiet=args.quiet,
        )
    )


if __name__ == "__main__":
    main()
