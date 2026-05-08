from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

import pytest

from app.models.asset import AllocationBucket, AssetClass, AssetType, CurrencyCode, Market
from app.services import portfolio_service
from tests.factories import (
    link_user_asset,
    make_asset,
    make_fi_position,
    make_purchase,
    make_reserve_entry,
)


pytestmark = pytest.mark.unit


async def test_get_class_values_aggregates_per_type(db, user):
    a1 = await make_asset(db, ticker="PETR4", asset_type=AssetType.ACAO, current_price=Decimal("30"))
    a2 = await make_asset(db, ticker="MGLU3", asset_type=AssetType.ACAO, current_price=Decimal("4"))
    a3 = await make_asset(db, ticker="VOO", asset_type=AssetType.STOCK,
                          asset_class=AssetClass.ETF, market=Market.US,
                          quote_currency=CurrencyCode.USD,
                          current_price=Decimal("2500"))
    fii = await make_asset(db, ticker="HGLG11", asset_type=AssetType.FII, current_price=Decimal("150"))
    rf = await make_asset(db, ticker="CDB-X", asset_type=AssetType.RF,
                          asset_class=AssetClass.RF, market=Market.BR,
                          quote_currency=CurrencyCode.BRL, current_price=None)

    for a in (a1, a2, a3, fii, rf):
        await link_user_asset(db, user_id=user.id, asset_id=a.id)

    await make_purchase(db, user_id=user.id, asset_id=a1.id, quantity=Decimal("10"), unit_price=Decimal("30"))
    await make_purchase(db, user_id=user.id, asset_id=a2.id, quantity=Decimal("100"), unit_price=Decimal("4"))
    await make_purchase(db, user_id=user.id, asset_id=a3.id, quantity=Decimal("2"), unit_price=Decimal("2500"))
    await make_purchase(db, user_id=user.id, asset_id=fii.id, quantity=Decimal("3"), unit_price=Decimal("150"))
    await make_fi_position(db, user_id=user.id, asset_id=rf.id, current_balance=Decimal("1000"))

    values = await portfolio_service.get_class_values(db, user)
    assert values[AssetType.ACAO] == Decimal("700.00")  # 10*30 + 100*4
    assert values[AssetType.STOCK] == Decimal("5000.00")
    assert values[AssetType.FII] == Decimal("450.00")
    assert values[AssetType.RF] == Decimal("1000.0000")


async def test_get_class_values_respects_cutoff(db, user):
    asset = await make_asset(db, ticker="PETR4", current_price=Decimal("10"))
    await link_user_asset(db, user_id=user.id, asset_id=asset.id)
    await make_purchase(
        db, user_id=user.id, asset_id=asset.id,
        purchase_date=date(2025, 1, 1), quantity=Decimal("1"), unit_price=Decimal("10"),
    )
    await make_purchase(
        db, user_id=user.id, asset_id=asset.id,
        purchase_date=date(2026, 6, 1), quantity=Decimal("5"), unit_price=Decimal("10"),
    )
    values = await portfolio_service.get_class_values(db, user, cutoff=date(2026, 1, 1))
    assert values[AssetType.ACAO] == Decimal("10.00")


async def test_get_bucket_values_uses_metadata(db, user):
    br = await make_asset(db, ticker="ITUB4", current_price=Decimal("25"))
    us = await make_asset(
        db, ticker="AAPL", asset_type=AssetType.STOCK,
        asset_class=AssetClass.STOCK, market=Market.US, quote_currency=CurrencyCode.USD,
        current_price=Decimal("1000"),
    )
    fii = await make_asset(
        db, ticker="MXRF11", asset_type=AssetType.FII,
        asset_class=AssetClass.FII, market=Market.BR, quote_currency=CurrencyCode.BRL,
        current_price=Decimal("10"),
    )
    await link_user_asset(db, user_id=user.id, asset_id=br.id)
    await link_user_asset(db, user_id=user.id, asset_id=us.id)
    await link_user_asset(db, user_id=user.id, asset_id=fii.id)
    await make_purchase(db, user_id=user.id, asset_id=br.id, quantity=Decimal("4"), unit_price=Decimal("25"))
    await make_purchase(db, user_id=user.id, asset_id=us.id, quantity=Decimal("1"), unit_price=Decimal("1000"))
    await make_purchase(db, user_id=user.id, asset_id=fii.id, quantity=Decimal("10"), unit_price=Decimal("10"))

    values = await portfolio_service.get_bucket_values(db, user)
    assert values[AllocationBucket.STOCK_BR] == Decimal("100.00")
    assert values[AllocationBucket.STOCK_US] == Decimal("1000.00")
    assert values[AllocationBucket.FII] == Decimal("100.00")


async def test_get_reserve_for_month_returns_latest(db, user):
    base = datetime(2026, 5, 1)
    await make_reserve_entry(db, user_id=user.id, amount=Decimal("100"), recorded_at=base)
    later = await make_reserve_entry(
        db, user_id=user.id, amount=Decimal("250"), recorded_at=base + timedelta(days=10)
    )
    found = await portfolio_service.get_reserve_for_month(db, user.id, 2026, 5)
    assert found is not None
    assert found.id == later.id


async def test_get_reserve_for_month_none_before_first(db, user):
    await make_reserve_entry(
        db, user_id=user.id, amount=Decimal("100"),
        recorded_at=datetime(2026, 6, 1),
    )
    assert await portfolio_service.get_reserve_for_month(db, user.id, 2026, 5) is None


async def test_get_reserve_for_date_inclusive_of_day(db, user):
    target = date(2026, 5, 7)
    entry = await make_reserve_entry(
        db, user_id=user.id, amount=Decimal("9"),
        recorded_at=datetime(2026, 5, 7, 23, 59),
    )
    found = await portfolio_service.get_reserve_for_date(db, user.id, target)
    assert found is not None and found.id == entry.id
