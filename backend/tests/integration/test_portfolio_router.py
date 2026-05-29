from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models.asset import AssetType
from tests.factories import (
    link_user_asset,
    make_asset,
    make_fi_position,
    make_purchase,
    make_reserve_entry,
)


pytestmark = pytest.mark.integration


def _decimal(value) -> Decimal:
    return Decimal(str(value))


async def test_overview_total_invested_includes_financial_reserve(
    auth_client, db, user
):
    stock = await make_asset(db, ticker="ITUB4", current_price=Decimal("25"))
    await link_user_asset(db, user_id=user.id, asset_id=stock.id)
    await make_purchase(
        db,
        user_id=user.id,
        asset_id=stock.id,
        purchase_date=date(2026, 5, 5),
        quantity=Decimal("10"),
        unit_price=Decimal("20"),
    )

    rf_asset = await make_asset(
        db,
        ticker="CDB",
        asset_type=AssetType.RF,
        current_price=None,
    )
    await link_user_asset(db, user_id=user.id, asset_id=rf_asset.id)
    await make_fi_position(
        db,
        user_id=user.id,
        asset_id=rf_asset.id,
        applied_value=Decimal("1000"),
        current_balance=Decimal("1100"),
        start_date=date(2026, 5, 1),
    )

    await make_reserve_entry(
        db,
        user_id=user.id,
        amount=Decimal("500"),
        recorded_at=datetime(2026, 5, 15),
    )

    response = await auth_client.get("/api/portfolio/overview?month=2026-05")

    assert response.status_code == 200
    body = response.json()
    assert _decimal(body["total_invested"]) == Decimal("1700.0000")
    assert _decimal(body["patrimonio_total"]) == Decimal("1850.0000")
