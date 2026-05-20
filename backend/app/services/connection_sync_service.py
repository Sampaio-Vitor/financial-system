"""Connection sync orchestration — shared between the router and the scheduler."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import httpx
from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bank_connection import BankConnection
from app.models.pluggy_credentials import PluggyCredentials
from app.models.transaction import Transaction
from app.models.user import User
from app.services import dividend_service, pluggy_service
from app.services.encryption_service import decrypt

logger = logging.getLogger(__name__)

TRANSACTION_SYNC_LOOKBACK_DAYS = 40


class ConnectionSyncError(Exception):
    """Base class for connection sync failures that callers should distinguish."""


class MissingPluggyCredentialsError(ConnectionSyncError):
    """User has no Pluggy credentials configured."""


class InvalidPluggyEncryptionError(ConnectionSyncError):
    """Stored Pluggy credentials cannot be decrypted (likely ENCRYPTION_KEY mismatch)."""


@dataclass
class ConnectionSyncResult:
    new_transactions: int
    connection_status: str


async def get_user_pluggy_creds(
    user_id: int, db: AsyncSession
) -> tuple[str, str, list[str]]:
    """Decrypt and return (client_id, client_secret, owner_names) for a user."""
    result = await db.execute(
        select(PluggyCredentials).where(PluggyCredentials.user_id == user_id)
    )
    creds = result.scalar_one_or_none()
    if not creds:
        raise MissingPluggyCredentialsError()
    try:
        client_id = decrypt(creds.encrypted_client_id)
        client_secret = decrypt(creds.encrypted_client_secret)
    except InvalidToken as exc:
        raise InvalidPluggyEncryptionError() from exc
    return client_id, client_secret, creds.owner_names or []


def _transaction_sync_since(last_sync_at: datetime | None) -> date | None:
    if not last_sync_at:
        return None
    return last_sync_at.date() - timedelta(days=TRANSACTION_SYNC_LOOKBACK_DAYS)


async def _create_transaction_with_dividend(
    db: AsyncSession,
    *,
    account_id: int,
    user_id: int,
    parsed: dict,
) -> Transaction:
    txn = Transaction(account_id=account_id, user_id=user_id, **parsed)
    db.add(txn)
    await db.flush()
    await dividend_service.upsert_dividend_event_for_transaction(db, txn)
    return txn


async def sync_connection(
    db: AsyncSession,
    connection: BankConnection,
    *,
    api_key: str,
    owner_names: list[str],
) -> ConnectionSyncResult:
    """Sync one connection's accounts and transactions. Caller must provide a connection
    loaded with ``selectinload(BankConnection.accounts)``.

    Pluggy-side failures (expired login, HTTP errors) are reflected on the connection's
    ``status`` and returned in the result rather than raised.
    """
    try:
        item_data = await pluggy_service.get_item(api_key, connection.external_id)
    except httpx.HTTPStatusError:
        connection.status = "error"
        await db.commit()
        return ConnectionSyncResult(new_transactions=0, connection_status="error")

    item_status = item_data.get("status", "")
    if item_status in ("LOGIN_ERROR", "OUTDATED"):
        connection.status = "expired"
        await db.commit()
        return ConnectionSyncResult(new_transactions=0, connection_status="expired")

    new_count = 0
    since_date = _transaction_sync_since(connection.last_sync_at)
    raw_accounts = await pluggy_service.get_accounts(api_key, connection.external_id)
    balances_by_external_id = {acc["id"]: acc.get("balance") for acc in raw_accounts}

    for account in connection.accounts:
        if account.external_id in balances_by_external_id:
            new_balance = balances_by_external_id[account.external_id]
            if new_balance is not None:
                account.balance = new_balance

        raw_txns = await pluggy_service.get_transactions(
            api_key, account.external_id, since=since_date
        )
        for raw_txn in raw_txns:
            parsed = pluggy_service.parse_transaction(raw_txn, owner_names=owner_names)
            existing = await db.execute(
                select(Transaction).where(
                    Transaction.account_id == account.id,
                    Transaction.external_id == parsed["external_id"],
                )
            )
            if existing.scalar_one_or_none():
                continue

            await _create_transaction_with_dividend(
                db,
                account_id=account.id,
                user_id=connection.user_id,
                parsed=parsed,
            )
            new_count += 1

        await dividend_service.backfill_dividend_events_for_account(
            db,
            user_id=connection.user_id,
            account_id=account.id,
        )

    connection.status = "active"
    connection.last_sync_at = datetime.now(timezone.utc)
    await db.commit()

    return ConnectionSyncResult(new_transactions=new_count, connection_status="active")


async def sync_user_connections(db: AsyncSession, user: User) -> dict:
    """Sync every connection a user owns, isolating per-connection failures.

    Returns a summary dict ``{"synced": int, "new_transactions": int, "failed": [...]}``.
    Missing or unreadable credentials cause the whole user to be skipped (returned in
    ``failed`` with reason ``missing_credentials`` / ``invalid_encryption``).
    """
    summary: dict = {
        "user_id": user.id,
        "synced": 0,
        "new_transactions": 0,
        "failed": [],
    }

    try:
        client_id, client_secret, owner_names = await get_user_pluggy_creds(user.id, db)
    except MissingPluggyCredentialsError:
        summary["failed"].append({"reason": "missing_credentials"})
        return summary
    except InvalidPluggyEncryptionError:
        summary["failed"].append({"reason": "invalid_encryption"})
        logger.warning("User %s has Pluggy credentials that cannot be decrypted", user.id)
        return summary

    try:
        api_key = await pluggy_service.authenticate(user.id, client_id, client_secret)
    except Exception:
        logger.exception("Pluggy authentication failed for user %s", user.id)
        summary["failed"].append({"reason": "auth_failed"})
        return summary

    connections_result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.user_id == user.id)
    )
    connections = connections_result.scalars().all()

    for connection in connections:
        try:
            result = await sync_connection(
                db, connection, api_key=api_key, owner_names=owner_names
            )
            summary["synced"] += 1
            summary["new_transactions"] += result.new_transactions
            if result.connection_status != "active":
                summary["failed"].append(
                    {
                        "connection_id": connection.id,
                        "reason": result.connection_status,
                    }
                )
        except Exception:
            await db.rollback()
            logger.exception(
                "Failed to sync connection %s for user %s", connection.id, user.id
            )
            summary["failed"].append(
                {"connection_id": connection.id, "reason": "exception"}
            )

    return summary
