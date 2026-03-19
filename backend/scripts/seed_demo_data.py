"""Seed a complete demo portfolio with simulated data."""
import asyncio
import os
import sys
from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, select

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal, Base, engine
from app.models.allocation_target import AllocationTarget
from app.models.asset import Asset, AssetType
from app.models.financial_reserve import FinancialReserveEntry, FinancialReserveTarget
from app.models.fixed_income import FixedIncomePosition
from app.models.fixed_income_redemption import FixedIncomeRedemption
from app.models.monthly_snapshot import MonthlySnapshot
from app.models.purchase import Purchase
from app.models.settings import UserSettings
from app.models.user import User
from app.services.auth_service import hash_password


def D(value: str) -> Decimal:
    return Decimal(value)


DEMO_USERNAME = os.getenv("DEMO_USERNAME", "demo")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo123")
DEMO_RESET = os.getenv("DEMO_RESET", "true").strip().lower() not in {"0", "false", "no"}
USD_BRL_RATE = D("5.1200")
RESERVE_TARGET = D("18000.00")

ASSET_DEFINITIONS = [
    {
        "ticker": "DUSALFA",
        "type": AssetType.STOCK,
        "description": "US Large Cap Demo",
        "current_price": D("84.5000"),
    },
    {
        "ticker": "DUSTECH",
        "type": AssetType.STOCK,
        "description": "US Tech Demo",
        "current_price": D("67.2000"),
    },
    {
        "ticker": "DUSHEAL",
        "type": AssetType.STOCK,
        "description": "US Healthcare Demo",
        "current_price": D("52.4000"),
    },
    {
        "ticker": "DBRGROW3",
        "type": AssetType.ACAO,
        "description": "Acao de Crescimento Demo",
        "current_price": D("31.8000"),
    },
    {
        "ticker": "DBRSAFE3",
        "type": AssetType.ACAO,
        "description": "Acao Defensiva Demo",
        "current_price": D("45.3000"),
    },
    {
        "ticker": "DBRENER3",
        "type": AssetType.ACAO,
        "description": "Acao de Energia Demo",
        "current_price": D("19.6000"),
    },
    {
        "ticker": "DFIIALFA11",
        "type": AssetType.FII,
        "description": "FII Logistico Demo",
        "current_price": D("108.4000"),
    },
    {
        "ticker": "DFIIBETA11",
        "type": AssetType.FII,
        "description": "FII Recebiveis Demo",
        "current_price": D("96.2000"),
    },
    {
        "ticker": "DRFCDB",
        "type": AssetType.RF,
        "description": "CDB Liquidez Diaria Demo",
        "current_price": None,
    },
    {
        "ticker": "DRFIPCA",
        "type": AssetType.RF,
        "description": "Tesouro IPCA+ Demo",
        "current_price": None,
    },
    {
        "ticker": "DRFLCI",
        "type": AssetType.RF,
        "description": "LCI Prefixada Demo",
        "current_price": None,
    },
]

PURCHASE_ROWS = [
    {"date": "2025-09-10", "ticker": "DUSALFA", "quantity": D("12"), "unit_price": D("74.00")},
    {"date": "2025-09-12", "ticker": "DBRGROW3", "quantity": D("100"), "unit_price": D("28.00")},
    {"date": "2025-09-15", "ticker": "DFIIALFA11", "quantity": D("20"), "unit_price": D("101.00")},
    {"date": "2025-10-05", "ticker": "DUSTECH", "quantity": D("8"), "unit_price": D("61.00")},
    {"date": "2025-10-11", "ticker": "DBRSAFE3", "quantity": D("60"), "unit_price": D("41.00")},
    {"date": "2025-10-18", "ticker": "DFIIBETA11", "quantity": D("15"), "unit_price": D("95.00")},
    {"date": "2025-11-04", "ticker": "DUSHEAL", "quantity": D("10"), "unit_price": D("49.00")},
    {"date": "2025-11-08", "ticker": "DBRENER3", "quantity": D("120"), "unit_price": D("17.50")},
    {"date": "2025-11-19", "ticker": "DBRGROW3", "quantity": D("-20"), "unit_price": D("30.00")},
    {"date": "2025-11-26", "ticker": "DFIIALFA11", "quantity": D("-5"), "unit_price": D("104.00")},
    {"date": "2025-12-03", "ticker": "DUSALFA", "quantity": D("5"), "unit_price": D("78.00")},
    {"date": "2025-12-09", "ticker": "DUSTECH", "quantity": D("4"), "unit_price": D("64.00")},
    {"date": "2025-12-16", "ticker": "DBRGROW3", "quantity": D("40"), "unit_price": D("29.50")},
    {"date": "2025-12-22", "ticker": "DFIIALFA11", "quantity": D("10"), "unit_price": D("103.00")},
    {"date": "2026-01-07", "ticker": "DUSHEAL", "quantity": D("6"), "unit_price": D("50.00")},
    {"date": "2026-01-14", "ticker": "DBRSAFE3", "quantity": D("30"), "unit_price": D("43.50")},
    {"date": "2026-01-29", "ticker": "DUSTECH", "quantity": D("-2"), "unit_price": D("66.00")},
    {"date": "2026-02-06", "ticker": "DUSALFA", "quantity": D("3"), "unit_price": D("82.00")},
    {"date": "2026-02-13", "ticker": "DBRENER3", "quantity": D("80"), "unit_price": D("18.50")},
    {"date": "2026-02-25", "ticker": "DFIIBETA11", "quantity": D("-3"), "unit_price": D("98.00")},
    {"date": "2026-03-05", "ticker": "DUSTECH", "quantity": D("3"), "unit_price": D("67.00")},
    {"date": "2026-03-12", "ticker": "DBRGROW3", "quantity": D("25"), "unit_price": D("31.20")},
    {"date": "2026-03-17", "ticker": "DFIIALFA11", "quantity": D("6"), "unit_price": D("107.00")},
]

RESERVE_ROWS = [
    {"month": "2025-09", "amount": D("2000.00"), "note": "Formacao inicial da reserva"},
    {"month": "2025-10", "amount": D("5000.00"), "note": "Aporte para seis meses de custos"},
    {"month": "2025-11", "amount": D("6500.00"), "note": "Refoco para gastos variaveis"},
    {"month": "2025-12", "amount": D("9000.00"), "note": "Reserva para virada do ano"},
    {"month": "2026-01", "amount": D("11000.00"), "note": "Protecao de inicio de ano"},
    {"month": "2026-02", "amount": D("12500.00"), "note": "Reserva apos resgate parcial"},
    {"month": "2026-03", "amount": D("14000.00"), "note": "Reserva atual simulada"},
]

ALLOCATION_TARGETS = {
    AssetType.STOCK: D("0.32"),
    AssetType.ACAO: D("0.28"),
    AssetType.FII: D("0.15"),
    AssetType.RF: D("0.25"),
}

FIXED_INCOME_POSITIONS = [
    {
        "code": "CDB",
        "ticker": "DRFCDB",
        "description": "CDB Liquidez Diaria Demo",
        "start_date": "2025-09-20",
        "applied_value": D("6117.6471"),
        "current_balance": D("6900.0000"),
        "yield_value": D("782.3529"),
        "yield_pct": D("0.127882"),
        "maturity_date": "2027-03-15",
    },
    {
        "code": "IPCA",
        "ticker": "DRFIPCA",
        "description": "Tesouro IPCA+ Demo",
        "start_date": "2025-10-21",
        "applied_value": D("5062.5000"),
        "current_balance": D("5450.0000"),
        "yield_value": D("387.5000"),
        "yield_pct": D("0.076543"),
        "maturity_date": "2028-01-15",
    },
]

FIXED_INCOME_REDEMPTIONS = [
    {
        "position_code": "CDB",
        "ticker": "DRFCDB",
        "description": "CDB Liquidez Diaria Demo",
        "date": "2026-01-20",
        "amount": D("2000.0000"),
    },
    {
        "position_code": "IPCA",
        "ticker": "DRFIPCA",
        "description": "Tesouro IPCA+ Demo",
        "date": "2026-02-14",
        "amount": D("1000.0000"),
    },
    {
        "position_code": None,
        "ticker": "DRFLCI",
        "description": "LCI Prefixada Demo",
        "date": "2026-02-28",
        "amount": D("4100.0000"),
    },
]

MONTHLY_PRICES = {
    "2025-09": {
        "DUSALFA": D("75.00"),
        "DUSTECH": D("60.00"),
        "DUSHEAL": D("48.50"),
        "DBRGROW3": D("28.50"),
        "DBRSAFE3": D("40.50"),
        "DBRENER3": D("17.00"),
        "DFIIALFA11": D("102.00"),
        "DFIIBETA11": D("94.80"),
    },
    "2025-10": {
        "DUSALFA": D("77.00"),
        "DUSTECH": D("62.00"),
        "DUSHEAL": D("48.70"),
        "DBRGROW3": D("29.00"),
        "DBRSAFE3": D("41.50"),
        "DBRENER3": D("17.20"),
        "DFIIALFA11": D("103.00"),
        "DFIIBETA11": D("95.20"),
    },
    "2025-11": {
        "DUSALFA": D("76.00"),
        "DUSTECH": D("63.00"),
        "DUSHEAL": D("49.50"),
        "DBRGROW3": D("27.50"),
        "DBRSAFE3": D("41.70"),
        "DBRENER3": D("17.80"),
        "DFIIALFA11": D("104.00"),
        "DFIIBETA11": D("95.60"),
    },
    "2025-12": {
        "DUSALFA": D("79.00"),
        "DUSTECH": D("65.00"),
        "DUSHEAL": D("50.10"),
        "DBRGROW3": D("30.00"),
        "DBRSAFE3": D("42.20"),
        "DBRENER3": D("18.10"),
        "DFIIALFA11": D("105.00"),
        "DFIIBETA11": D("96.50"),
    },
    "2026-01": {
        "DUSALFA": D("81.00"),
        "DUSTECH": D("66.00"),
        "DUSHEAL": D("51.00"),
        "DBRGROW3": D("30.80"),
        "DBRSAFE3": D("44.00"),
        "DBRENER3": D("18.90"),
        "DFIIALFA11": D("106.00"),
        "DFIIBETA11": D("97.50"),
    },
    "2026-02": {
        "DUSALFA": D("83.00"),
        "DUSTECH": D("68.00"),
        "DUSHEAL": D("52.00"),
        "DBRGROW3": D("31.20"),
        "DBRSAFE3": D("45.00"),
        "DBRENER3": D("19.40"),
        "DFIIALFA11": D("107.00"),
        "DFIIBETA11": D("98.60"),
    },
    "2026-03": {
        "DUSALFA": D("84.50"),
        "DUSTECH": D("67.20"),
        "DUSHEAL": D("52.40"),
        "DBRGROW3": D("31.80"),
        "DBRSAFE3": D("45.30"),
        "DBRENER3": D("19.60"),
        "DFIIALFA11": D("108.40"),
        "DFIIBETA11": D("96.20"),
    },
}

RF_SNAPSHOT_ITEMS = {
    "2025-09": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("8000.00"), "market_value": D("8100.00")},
    ],
    "2025-10": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("8000.00"), "market_value": D("8240.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("6000.00"), "market_value": D("6060.00")},
    ],
    "2025-11": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("8000.00"), "market_value": D("8380.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("6000.00"), "market_value": D("6150.00")},
    ],
    "2025-12": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("8000.00"), "market_value": D("8535.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("6000.00"), "market_value": D("6240.00")},
        {"ticker": "DRFLCI", "description": "LCI Prefixada Demo", "applied_value": D("4000.00"), "market_value": D("4020.00")},
    ],
    "2026-01": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("6117.6471"), "market_value": D("6650.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("6000.00"), "market_value": D("6320.00")},
        {"ticker": "DRFLCI", "description": "LCI Prefixada Demo", "applied_value": D("4000.00"), "market_value": D("4065.00")},
    ],
    "2026-02": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("6117.6471"), "market_value": D("6785.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("5062.5000"), "market_value": D("5450.00")},
    ],
    "2026-03": [
        {"ticker": "DRFCDB", "description": "CDB Liquidez Diaria Demo", "applied_value": D("6117.6471"), "market_value": D("6900.00")},
        {"ticker": "DRFIPCA", "description": "Tesouro IPCA+ Demo", "applied_value": D("5062.5000"), "market_value": D("5450.00")},
    ],
}

RF_MONTHLY_APORTES = {
    "2025-09": D("8000.00"),
    "2025-10": D("6000.00"),
    "2025-12": D("4000.00"),
}


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_month_end(value: str) -> datetime:
    year, month = (int(part) for part in value.split("-"))
    day = monthrange(year, month)[1]
    return datetime(year, month, day, 12, 0, 0)


def utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def round_money(value: Decimal) -> Decimal:
    return value.quantize(D("0.0001"))


def round_pct(value: Decimal) -> Decimal:
    return value.quantize(D("0.0001"))


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_or_create_demo_user(db) -> tuple[User, bool]:
    result = await db.execute(select(User).where(User.username == DEMO_USERNAME))
    user = result.scalar_one_or_none()
    created = False

    if user is None:
        user = User(
            username=DEMO_USERNAME,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        await db.flush()
        created = True
    else:
        user.password_hash = hash_password(DEMO_PASSWORD)

    return user, created


async def reset_demo_user_data(db, user_id: int) -> None:
    await db.execute(delete(MonthlySnapshot).where(MonthlySnapshot.user_id == user_id))
    await db.execute(delete(FixedIncomeRedemption).where(FixedIncomeRedemption.user_id == user_id))
    await db.execute(delete(FixedIncomePosition).where(FixedIncomePosition.user_id == user_id))
    await db.execute(delete(Purchase).where(Purchase.user_id == user_id))
    await db.execute(delete(FinancialReserveEntry).where(FinancialReserveEntry.user_id == user_id))
    await db.execute(delete(FinancialReserveTarget).where(FinancialReserveTarget.user_id == user_id))
    await db.execute(delete(AllocationTarget).where(AllocationTarget.user_id == user_id))
    await db.execute(delete(UserSettings).where(UserSettings.user_id == user_id))


async def ensure_assets(db) -> dict[str, Asset]:
    tickers = [asset["ticker"] for asset in ASSET_DEFINITIONS]
    existing_result = await db.execute(select(Asset).where(Asset.ticker.in_(tickers)))
    asset_map = {asset.ticker: asset for asset in existing_result.scalars().all()}
    now = utcnow_naive()

    for definition in ASSET_DEFINITIONS:
        asset = asset_map.get(definition["ticker"])
        if asset is None:
            asset = Asset(
                ticker=definition["ticker"],
                type=definition["type"],
                description=definition["description"],
                current_price=definition["current_price"],
                price_updated_at=now if definition["current_price"] is not None else None,
            )
            db.add(asset)
            await db.flush()
            asset_map[asset.ticker] = asset
            continue

        asset.type = definition["type"]
        asset.description = definition["description"]
        asset.current_price = definition["current_price"]
        asset.price_updated_at = now if definition["current_price"] is not None else None

    return asset_map


async def seed_settings(db, user_id: int) -> None:
    db.add(
        UserSettings(
            user_id=user_id,
            usd_brl_rate=USD_BRL_RATE,
            rate_updated_at=utcnow_naive(),
        )
    )


async def seed_allocation_targets(db, user_id: int) -> None:
    for asset_class, target_pct in ALLOCATION_TARGETS.items():
        db.add(
            AllocationTarget(
                user_id=user_id,
                asset_class=asset_class,
                target_pct=target_pct,
            )
        )


async def seed_reserve(db, user_id: int) -> None:
    db.add(FinancialReserveTarget(user_id=user_id, target_amount=RESERVE_TARGET))

    for row in RESERVE_ROWS:
        db.add(
            FinancialReserveEntry(
                user_id=user_id,
                amount=row["amount"],
                note=row["note"],
                recorded_at=parse_month_end(row["month"]),
            )
        )


async def seed_purchases(db, user_id: int, asset_map: dict[str, Asset]) -> None:
    for row in PURCHASE_ROWS:
        db.add(
            Purchase(
                asset_id=asset_map[row["ticker"]].id,
                user_id=user_id,
                purchase_date=parse_date(row["date"]),
                quantity=row["quantity"],
                unit_price=row["unit_price"],
                total_value=row["quantity"] * row["unit_price"],
            )
        )


async def seed_fixed_income(db, user_id: int, asset_map: dict[str, Asset]) -> None:
    position_id_by_code: dict[str, int] = {}

    for row in FIXED_INCOME_POSITIONS:
        position = FixedIncomePosition(
            asset_id=asset_map[row["ticker"]].id,
            user_id=user_id,
            description=row["description"],
            start_date=parse_date(row["start_date"]),
            applied_value=row["applied_value"],
            current_balance=row["current_balance"],
            yield_value=row["yield_value"],
            yield_pct=row["yield_pct"],
            maturity_date=parse_date(row["maturity_date"]),
        )
        db.add(position)
        await db.flush()
        position_id_by_code[row["code"]] = position.id

    for row in FIXED_INCOME_REDEMPTIONS:
        db.add(
            FixedIncomeRedemption(
                user_id=user_id,
                fixed_income_id=position_id_by_code.get(row["position_code"]) if row["position_code"] else None,
                ticker=row["ticker"],
                description=row["description"],
                redemption_date=parse_date(row["date"]),
                amount=row["amount"],
            )
        )


def build_snapshot_rows(user_id: int) -> list[MonthlySnapshot]:
    asset_meta = {item["ticker"]: item for item in ASSET_DEFINITIONS}
    reserve_by_month = {item["month"]: item["amount"] for item in RESERVE_ROWS}
    snapshots: list[MonthlySnapshot] = []
    previous_reserve = D("0")

    for month in sorted(MONTHLY_PRICES.keys()):
        month_end = parse_month_end(month).date()
        rv_positions: dict[str, dict[str, Decimal]] = {}

        for row in PURCHASE_ROWS:
            if parse_date(row["date"]) > month_end:
                continue
            pos = rv_positions.setdefault(
                row["ticker"],
                {"quantity": D("0"), "cost": D("0")},
            )
            pos["quantity"] += row["quantity"]
            pos["cost"] += row["quantity"] * row["unit_price"]

        class_values = {asset_type: D("0") for asset_type in AssetType}
        total_rv_cost = D("0")
        asset_breakdown: list[dict[str, float | str | None]] = []

        for ticker, position in rv_positions.items():
            qty = position["quantity"]
            cost = position["cost"]
            if qty <= 0:
                continue

            price = MONTHLY_PRICES[month][ticker]
            market_value = price * qty
            pnl = market_value - cost
            asset_type = asset_meta[ticker]["type"]

            class_values[asset_type] += market_value
            total_rv_cost += cost

            asset_breakdown.append(
                {
                    "ticker": ticker,
                    "type": asset_type.value,
                    "quantity": float(qty),
                    "avg_price": float(round_money(cost / qty)),
                    "closing_price": float(round_money(price)),
                    "market_value": float(round_money(market_value)),
                    "total_cost": float(round_money(cost)),
                    "pnl": float(round_money(pnl)),
                    "pnl_pct": float(round((pnl / cost * 100), 2)) if cost else None,
                }
            )

        total_fi_applied = D("0")
        for item in RF_SNAPSHOT_ITEMS[month]:
            market_value = item["market_value"]
            applied_value = item["applied_value"]
            pnl = market_value - applied_value

            class_values[AssetType.RF] += market_value
            total_fi_applied += applied_value

            asset_breakdown.append(
                {
                    "ticker": item["ticker"],
                    "type": AssetType.RF.value,
                    "quantity": 1.0,
                    "avg_price": float(round_money(applied_value)),
                    "closing_price": float(round_money(market_value)),
                    "market_value": float(round_money(market_value)),
                    "total_cost": float(round_money(applied_value)),
                    "pnl": float(round_money(pnl)),
                    "pnl_pct": float(round((pnl / applied_value * 100), 2)) if applied_value else None,
                }
            )

        reserve = reserve_by_month[month]
        rv_aportes = sum(
            row["quantity"] * row["unit_price"]
            for row in PURCHASE_ROWS
            if row["date"].startswith(month)
        )
        aporte_reserva = reserve - previous_reserve
        aportes_do_mes = rv_aportes + RF_MONTHLY_APORTES.get(month, D("0"))
        if aporte_reserva > 0:
            aportes_do_mes += aporte_reserva

        patrimonio_investivel = sum(class_values.values())
        total_patrimonio = patrimonio_investivel + reserve
        total_invested = total_rv_cost + total_fi_applied + reserve
        total_pnl = total_patrimonio - total_invested
        pnl_pct = (total_pnl / total_invested * 100) if total_invested else D("0")

        allocation_breakdown = []
        for asset_class in AssetType:
            value = class_values[asset_class]
            pct = (value / patrimonio_investivel * 100) if patrimonio_investivel else D("0")
            allocation_breakdown.append(
                {
                    "asset_class": asset_class.value,
                    "label": {
                        AssetType.STOCK: "Stocks (EUA)",
                        AssetType.ACAO: "Acoes (Brasil)",
                        AssetType.FII: "FIIs",
                        AssetType.RF: "Renda Fixa",
                    }[asset_class],
                    "value": float(round_money(value)),
                    "pct": float(round(pct, 2)),
                }
            )

        asset_breakdown.sort(key=lambda item: item.get("market_value") or 0, reverse=True)

        snapshots.append(
            MonthlySnapshot(
                user_id=user_id,
                month=month,
                total_patrimonio=round_money(total_patrimonio),
                total_invested=round_money(total_invested),
                total_pnl=round_money(total_pnl),
                pnl_pct=round_pct(pnl_pct),
                aportes_do_mes=round_money(aportes_do_mes),
                allocation_breakdown=allocation_breakdown,
                asset_breakdown=asset_breakdown,
                daily_patrimonio=None,
                snapshot_at=parse_month_end(month),
            )
        )

        previous_reserve = reserve

    return snapshots


async def seed_demo() -> None:
    try:
        await ensure_schema()

        async with AsyncSessionLocal() as db:
            user, created = await get_or_create_demo_user(db)

            if DEMO_RESET:
                await reset_demo_user_data(db, user.id)

            asset_map = await ensure_assets(db)
            await seed_settings(db, user.id)
            await seed_allocation_targets(db, user.id)
            await seed_reserve(db, user.id)
            await seed_purchases(db, user.id, asset_map)
            await seed_fixed_income(db, user.id, asset_map)

            for snapshot in build_snapshot_rows(user.id):
                db.add(snapshot)

            await db.commit()
    finally:
        await engine.dispose()

    print(f"Demo user {'created' if created else 'updated'}: {DEMO_USERNAME}")
    print(f"Password reset to: {DEMO_PASSWORD}")
    print("Seeded scenario:")
    print("- 11 ativos simulados globais com tickers dedicados ao demo")
    print("- compras e vendas em STOCK, ACAO e FII")
    print("- aportes e resgates em RF, inclusive resgate total")
    print("- historico mensal da reserva e meta de reserva")
    print("- metas de alocacao e snapshots mensais ate 2026-03")
    print("")
    print("Use DEMO_USERNAME / DEMO_PASSWORD para sobrescrever as credenciais.")


if __name__ == "__main__":
    asyncio.run(seed_demo())
