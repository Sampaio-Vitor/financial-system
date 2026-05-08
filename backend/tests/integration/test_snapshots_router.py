from datetime import date
from decimal import Decimal

import pytest

from app.models.daily_snapshot import DailySnapshot
from app.models.monthly_snapshot import MonthlySnapshot


pytestmark = pytest.mark.integration


async def _make_monthly(db, user_id, month, total=Decimal("1000")):
    s = MonthlySnapshot(
        user_id=user_id,
        month=month,
        total_patrimonio=total,
        total_invested=total,
        total_pnl=Decimal("0"),
        pnl_pct=Decimal("0"),
        aportes_do_mes=Decimal("0"),
        asset_breakdown=[
            {
                "ticker": "ITUB4",
                "type": "ACAO",
                "quantity": 10.0,
                "avg_price": 20.0,
                "total_cost": 200.0,
                "market_value": 300.0,
                "pnl": 100.0,
                "pnl_pct": 50.0,
            }
        ],
    )
    db.add(s)
    await db.commit()
    return s


async def test_list_empty(auth_client):
    r = await auth_client.get("/api/snapshots")
    assert r.status_code == 200
    assert r.json() == []


async def test_list_returns_descending(auth_client, db, user):
    await _make_monthly(db, user.id, "2026-01")
    await _make_monthly(db, user.id, "2026-05")
    r = await auth_client.get("/api/snapshots")
    months = [s["month"] for s in r.json()]
    assert months == ["2026-05", "2026-01"]


async def test_get_assets_no_snapshot(auth_client):
    r = await auth_client.get("/api/snapshots/assets?month=2026-05")
    assert r.json() == []


async def test_get_assets_existing(auth_client, db, user):
    await _make_monthly(db, user.id, "2026-05")
    r = await auth_client.get("/api/snapshots/assets?month=2026-05")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["ticker"] == "ITUB4"


async def test_evolution_returns_ascending(auth_client, db, user):
    await _make_monthly(db, user.id, "2026-05")
    await _make_monthly(db, user.id, "2026-01")
    r = await auth_client.get("/api/snapshots/evolution")
    months = [s["month"] for s in r.json()]
    assert months == ["2026-01", "2026-05"]


async def test_daily_evolution_filters_by_days(auth_client, db, user):
    today = date.today()
    db.add(DailySnapshot(
        user_id=user.id, date=today,
        total_patrimonio=Decimal("100"), total_invested=Decimal("100"),
        total_pnl=Decimal("0"), pnl_pct=Decimal("0"),
    ))
    await db.commit()
    r = await auth_client.get("/api/snapshots/daily-evolution?days=10")
    body = r.json()
    assert len(body) == 1


async def test_generate_invalid_month_format(auth_client):
    r = await auth_client.post("/api/snapshots/generate", json={"month": "BAD"})
    assert r.status_code in (400, 422)
