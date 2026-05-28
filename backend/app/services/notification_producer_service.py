from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ALLOCATION_BUCKET_LABELS
from app.models.allocation_target import AllocationTarget
from app.models.asset import (
    AllocationBucket,
    Asset,
    CurrencyCode,
)
from app.models.daily_snapshot import DailySnapshot
from app.models.fixed_income import FixedIncomePosition
from app.models.financial_reserve import FinancialReserveEntry
from app.models.notification import Notification
from app.models.retirement_goal import RetirementGoal
from app.models.user import User
from app.models.user_asset import UserAsset
from app.notification_types import (
    ALLOCATION_DRIFT,
    BANK_CONNECTION_ACTION_REQUIRED,
    BANK_SYNC_NEW_TRANSACTIONS,
    DIVIDEND_DETECTED,
    FIXED_INCOME_MATURITY,
    PURCHASE_PRICE_ANOMALY,
    PRICE_UPDATE_COMPLETED,
    PRICE_UPDATE_TICKER_FAILED,
    RETIREMENT_PROGRESS_MILESTONE,
)
from app.services.notification_service import create_notification
from app.services.portfolio_service import get_bucket_values, get_class_values


def _money(value: Decimal | int | float | None) -> str:
    if value is None:
        return "R$ 0,00"
    decimal = value if isinstance(value, Decimal) else Decimal(str(value))
    return f"R$ {decimal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _date_br(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _decimal_str(value: Decimal | int | float | None) -> str | None:
    return None if value is None else str(value)


async def notify_dividend_detected(
    db: AsyncSession,
    *,
    user_id: int,
    transaction_id: int,
    dividend_event_id: int | None,
    ticker: str | None,
    amount: Decimal,
    payment_date: date,
    confidence: str,
) -> None:
    label = ticker or "Provento"
    await create_notification(
        db,
        user_id=user_id,
        notification_type=DIVIDEND_DETECTED,
        title="Novo provento detectado",
        message=f"{label}: {_money(amount)} creditado em {_date_br(payment_date)}.",
        severity="info",
        link="/carteira/proventos",
        dedupe_key=f"dividend_event:transaction:{transaction_id}",
        metadata={
            "transaction_id": transaction_id,
            "dividend_event_id": dividend_event_id,
            "ticker": ticker,
            "amount": _decimal_str(amount),
            "payment_date": payment_date.isoformat(),
            "confidence": confidence,
        },
    )


async def notify_bank_sync_new_transactions(
    db: AsyncSession,
    *,
    user_id: int,
    connection_id: int,
    institution_name: str,
    new_transactions: int,
    run_date: date | None = None,
) -> None:
    if new_transactions <= 0:
        return
    run_date = run_date or date.today()
    await create_notification(
        db,
        user_id=user_id,
        notification_type=BANK_SYNC_NEW_TRANSACTIONS,
        title="Novas transações importadas",
        message=(
            f"{new_transactions} nova(s) transação(ões) importada(s) "
            f"de {institution_name}."
        ),
        severity="info",
        link="/carteira/conexoes",
        dedupe_key=f"bank_sync:new_transactions:{connection_id}:{run_date.isoformat()}",
        metadata={
            "connection_id": connection_id,
            "institution_name": institution_name,
            "new_transactions": new_transactions,
            "run_date": run_date.isoformat(),
        },
    )


async def notify_bank_connection_action_required(
    db: AsyncSession,
    *,
    user_id: int,
    reason: str,
    connection_id: int | None = None,
    institution_name: str | None = None,
) -> None:
    label = institution_name or "Pluggy"
    severity = "warning" if reason == "error" else "error"
    dedupe_subject = connection_id if connection_id is not None else user_id
    await create_notification(
        db,
        user_id=user_id,
        notification_type=BANK_CONNECTION_ACTION_REQUIRED,
        title="Conexão bancária precisa de atenção",
        message=f"{label} não sincronizou. Reconecte ou revise as credenciais.",
        severity=severity,
        link="/carteira/conexoes",
        dedupe_key=f"bank_connection:{dedupe_subject}:{reason}",
        metadata={
            "connection_id": connection_id,
            "institution_name": institution_name,
            "reason": reason,
        },
    )


async def notify_price_update_completed(
    db: AsyncSession,
    *,
    user_id: int,
    run_date: date,
    updated_count: int,
    failed_count: int,
    status: str,
    patrimonio_variation: Decimal | None = None,
    patrimonio_variation_pct: Decimal | None = None,
) -> None:
    severity = "success" if status == "success" else "warning"
    message = f"{updated_count} cotação(ões) atualizada(s)."
    if patrimonio_variation is not None:
        sign = "+" if patrimonio_variation >= 0 else "-"
        pct_text = (
            f" ({patrimonio_variation_pct:+.2f}%)"
            if patrimonio_variation_pct is not None
            else ""
        )
        message += f" Patrimônio hoje: {sign}{_money(abs(patrimonio_variation))}{pct_text}."
    if failed_count:
        message += f" {failed_count} falha(s) encontrada(s)."
    await create_notification(
        db,
        user_id=user_id,
        notification_type=PRICE_UPDATE_COMPLETED,
        title="Cotações atualizadas",
        message=message,
        severity=severity,
        link="/carteira",
        dedupe_key=f"price_update:completed:{run_date.isoformat()}",
        metadata={
            "updated_count": updated_count,
            "failed_count": failed_count,
            "status": status,
            "run_date": run_date.isoformat(),
            "patrimonio_variation": _decimal_str(patrimonio_variation),
            "patrimonio_variation_pct": _decimal_str(patrimonio_variation_pct),
        },
    )


async def notify_price_update_ticker_failed(
    db: AsyncSession,
    *,
    user_id: int,
    ticker: str,
    error: str,
    run_date: date,
) -> None:
    await create_notification(
        db,
        user_id=user_id,
        notification_type=PRICE_UPDATE_TICKER_FAILED,
        title="Falha ao atualizar cotação",
        message=f"Não foi possível atualizar {ticker}.",
        severity="warning",
        link="/carteira/catalogo",
        dedupe_key=f"price_update:ticker_failed:{ticker}:{run_date.isoformat()}",
        metadata={"ticker": ticker, "error": error, "run_date": run_date.isoformat()},
    )


async def notify_purchase_price_anomaly(
    db: AsyncSession,
    *,
    user_id: int,
    purchase_id: int,
    asset_id: int,
    ticker: str,
    purchase_date: date,
    unit_price_native: Decimal,
    low_native: Decimal,
    high_native: Decimal,
    tolerance_pct: Decimal,
) -> None:
    await create_notification(
        db,
        user_id=user_id,
        notification_type=PURCHASE_PRICE_ANOMALY,
        title="Preço de aporte suspeito",
        message=(
            f"Aporte em {ticker} em {_date_br(purchase_date)} está fora "
            "da faixa negociada do dia."
        ),
        severity="warning",
        link="/carteira/aportes",
        dedupe_key=f"purchase_price_anomaly:{purchase_id}",
        metadata={
            "purchase_id": purchase_id,
            "asset_id": asset_id,
            "ticker": ticker,
            "purchase_date": purchase_date.isoformat(),
            "unit_price_native": _decimal_str(unit_price_native),
            "low_native": _decimal_str(low_native),
            "high_native": _decimal_str(high_native),
            "tolerance_pct": _decimal_str(tolerance_pct),
        },
    )


def maturity_bucket(today: date, maturity_date: date) -> str | None:
    days = (maturity_date - today).days
    if days == 30:
        return "30d"
    if days == 7:
        return "7d"
    if days == 0:
        return "due_today"
    if days < 0:
        return "overdue"
    return None


async def scan_fixed_income_maturities(db: AsyncSession, *, today: date | None = None) -> int:
    today = today or date.today()
    result = await db.execute(
        select(FixedIncomePosition).where(FixedIncomePosition.maturity_date.is_not(None))
    )
    created = 0
    for position in result.scalars().all():
        if position.maturity_date is None:
            continue
        bucket = maturity_bucket(today, position.maturity_date)
        if bucket is None:
            continue
        ticker = position.asset.ticker if position.asset else "Renda fixa"
        if bucket == "overdue":
            dedupe_key = f"fixed_income_maturity:{position.id}:overdue:{today:%Y-%m}"
            message = f"{ticker} venceu em {_date_br(position.maturity_date)}."
        else:
            dedupe_key = f"fixed_income_maturity:{position.id}:{bucket}"
            message = f"{ticker} vence em {_date_br(position.maturity_date)}."
        if await notification_exists(db, user_id=position.user_id, dedupe_key=dedupe_key):
            continue
        await create_notification(
            db,
            user_id=position.user_id,
            notification_type=FIXED_INCOME_MATURITY,
            title="Renda fixa perto do vencimento",
            message=message,
            severity="warning",
            link="/carteira/renda-fixa",
            dedupe_key=dedupe_key,
            metadata={
                "fixed_income_id": position.id,
                "ticker": ticker,
                "maturity_date": position.maturity_date.isoformat(),
                "bucket": bucket,
            },
        )
        created += 1
    return created


async def notify_price_update_results_for_users(
    db: AsyncSession,
    *,
    results: dict,
    users: list[User],
    run_date: date,
) -> int:
    count = 0
    status = results.get("status") or "success"
    updated_count = len(results.get("updated", []))
    failed = results.get("failed", [])
    for user in users:
        completed_dedupe_key = f"price_update:completed:{run_date.isoformat()}"
        completed_exists = await notification_exists(
            db, user_id=user.id, dedupe_key=completed_dedupe_key
        )
        variation, variation_pct = await _daily_patrimonio_variation(
            db, user_id=user.id, run_date=run_date
        )
        await notify_price_update_completed(
            db,
            user_id=user.id,
            run_date=run_date,
            updated_count=updated_count,
            failed_count=len(failed),
            status=status,
            patrimonio_variation=variation,
            patrimonio_variation_pct=variation_pct,
        )
        if not completed_exists:
            count += 1

    for failure in failed:
        ticker = str(failure.get("ticker", "")).strip()
        if not ticker:
            continue
        error = str(failure.get("error", "Erro desconhecido"))
        user_ids = await _users_for_failed_ticker(db, ticker)
        for user_id in user_ids:
            ticker_failed_dedupe_key = (
                f"price_update:ticker_failed:{ticker}:{run_date.isoformat()}"
            )
            if await notification_exists(
                db, user_id=user_id, dedupe_key=ticker_failed_dedupe_key
            ):
                continue
            await notify_price_update_ticker_failed(
                db,
                user_id=user_id,
                ticker=ticker,
                error=error,
                run_date=run_date,
            )
            count += 1
    return count


async def _daily_patrimonio_variation(
    db: AsyncSession,
    *,
    user_id: int,
    run_date: date,
) -> tuple[Decimal | None, Decimal | None]:
    today_result = await db.execute(
        select(DailySnapshot)
        .where(DailySnapshot.user_id == user_id, DailySnapshot.date == run_date)
        .limit(1)
    )
    today_snapshot = today_result.scalar_one_or_none()
    if today_snapshot is None:
        return None, None

    previous_result = await db.execute(
        select(DailySnapshot)
        .where(DailySnapshot.user_id == user_id, DailySnapshot.date < run_date)
        .order_by(DailySnapshot.date.desc())
        .limit(1)
    )
    previous_snapshot = previous_result.scalar_one_or_none()
    if previous_snapshot is None or previous_snapshot.total_patrimonio == 0:
        return None, None

    variation = today_snapshot.total_patrimonio - previous_snapshot.total_patrimonio
    variation_pct = variation / previous_snapshot.total_patrimonio * Decimal("100")
    return variation, variation_pct


async def _users_for_failed_ticker(db: AsyncSession, ticker: str) -> set[int]:
    if ticker.endswith("BRL=X"):
        currency_value = ticker.replace("BRL=X", "")
        try:
            currency = CurrencyCode(currency_value)
        except ValueError:
            return set()
        result = await db.execute(
            select(UserAsset.user_id)
            .join(Asset, Asset.id == UserAsset.asset_id)
            .where(Asset.quote_currency == currency)
        )
        return set(result.scalars().all())

    normalized = ticker.removesuffix(".SA")
    result = await db.execute(
        select(UserAsset.user_id)
        .join(Asset, Asset.id == UserAsset.asset_id)
        .where((Asset.ticker == ticker) | (Asset.ticker == normalized) | (Asset.price_symbol == ticker))
    )
    return set(result.scalars().all())


async def scan_retirement_milestones(db: AsyncSession, user: User) -> int:
    result = await db.execute(
        select(RetirementGoal).where(RetirementGoal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal or goal.patrimonio_meta <= 0:
        return 0

    class_values = await get_class_values(db, user)
    reserve_result = await db.execute(
        select(FinancialReserveEntry)
        .where(FinancialReserveEntry.user_id == user.id)
        .order_by(FinancialReserveEntry.recorded_at.desc(), FinancialReserveEntry.id.desc())
        .limit(1)
    )
    reserve = reserve_result.scalar_one_or_none()
    patrimonio_atual = sum(class_values.values()) + (reserve.amount if reserve else Decimal("0"))
    progress = (patrimonio_atual / goal.patrimonio_meta * Decimal("100"))
    highest = min(int(progress // Decimal("5")) * 5, 100)
    if highest < 5:
        return 0

    created = 0
    for milestone in range(5, highest + 1, 5):
        dedupe_key = f"retirement_milestone:{milestone}"
        if await notification_exists(db, user_id=user.id, dedupe_key=dedupe_key):
            continue
        await create_notification(
            db,
            user_id=user.id,
            notification_type=RETIREMENT_PROGRESS_MILESTONE,
            title="Marco de aposentadoria atingido",
            message=f"Você atingiu {milestone}% da sua meta de aposentadoria.",
            severity="success",
            link="/carteira/aposentadoria",
            dedupe_key=dedupe_key,
            metadata={
                "milestone": milestone,
                "progress": _decimal_str(round(progress, 2)),
                "patrimonio_atual": _decimal_str(patrimonio_atual),
                "patrimonio_meta": _decimal_str(goal.patrimonio_meta),
            },
        )
        created += 1
    return created


async def scan_allocation_drift(
    db: AsyncSession,
    user: User,
    *,
    today: date | None = None,
    threshold_pct_points: Decimal = Decimal("5"),
) -> int:
    today = today or date.today()
    bucket_values = await get_bucket_values(db, user)
    investable_total = sum(bucket_values.values())
    if investable_total <= 0:
        return 0

    target_result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    targets = {row.allocation_bucket: row.target_pct for row in target_result.scalars().all()}
    created = 0
    for bucket in AllocationBucket:
        target_pct = targets.get(bucket, Decimal("0")) * Decimal("100")
        if target_pct <= 0:
            continue
        current_pct = bucket_values[bucket] / investable_total * Decimal("100")
        drift = current_pct - target_pct
        if abs(drift) < threshold_pct_points:
            continue
        label = ALLOCATION_BUCKET_LABELS[bucket]
        dedupe_key = f"allocation_drift:{bucket.value}:{today:%Y-%m}"
        if await notification_exists(db, user_id=user.id, dedupe_key=dedupe_key):
            continue
        await create_notification(
            db,
            user_id=user.id,
            notification_type=ALLOCATION_DRIFT,
            title="Alocação fora da meta",
            message=f"{label} está {abs(drift):.2f} p.p. fora da meta.",
            severity="warning",
            link="/desejados",
            dedupe_key=dedupe_key,
            metadata={
                "bucket": bucket.value,
                "target_pct": _decimal_str(round(target_pct, 2)),
                "current_pct": _decimal_str(round(current_pct, 2)),
                "drift_pct_points": _decimal_str(round(drift, 2)),
            },
        )
        created += 1
    return created


async def notification_exists(db: AsyncSession, *, user_id: int, dedupe_key: str) -> bool:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    return bool(result.scalar() or 0)
