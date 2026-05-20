from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.bank_account import BankAccount
from app.models.bank_connection import BankConnection
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.expenses import (
    BankConnectionResponse,
    ConnectionCallbackRequest,
    ConnectionRenameRequest,
    ConnectTokenResponse,
    SyncResponse,
)
from app.services import dividend_service, pluggy_service
from app.services.connection_sync_service import (
    InvalidPluggyEncryptionError,
    MissingPluggyCredentialsError,
    get_user_pluggy_creds,
    sync_connection as sync_connection_service,
)

router = APIRouter()


async def _get_user_pluggy_creds(user_id: int, db: AsyncSession) -> tuple[str, str, list[str]]:
    """Decrypt and return (client_id, client_secret, owner_names), mapping service errors to HTTPException."""
    try:
        return await get_user_pluggy_creds(user_id, db)
    except MissingPluggyCredentialsError:
        raise HTTPException(status_code=400, detail="Credenciais Pluggy não configuradas")
    except InvalidPluggyEncryptionError:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível descriptografar as credenciais Pluggy. Verifique a configuração de ENCRYPTION_KEY no backend.",
        )


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


@router.post("/connect-token", response_model=ConnectTokenResponse)
async def create_connect_token(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_id, client_secret, owner_names = await _get_user_pluggy_creds(user.id, db)
    api_key = await pluggy_service.authenticate(user.id, client_id, client_secret)
    token = await pluggy_service.create_connect_token(api_key, str(user.id))
    return ConnectTokenResponse(access_token=token)


@router.post("/callback", response_model=BankConnectionResponse, status_code=status.HTTP_201_CREATED)
async def handle_callback(
    body: ConnectionCallbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_id, client_secret, owner_names = await _get_user_pluggy_creds(user.id, db)
    api_key = await pluggy_service.authenticate(user.id, client_id, client_secret)

    # Fetch item details
    item_data = await pluggy_service.get_item(api_key, body.item_id)
    institution_name = body.connection_name or item_data.get("connector", {}).get("name", "Banco desconhecido")

    # Check item status
    item_status = item_data.get("status", "")
    if item_status in ("LOGIN_ERROR", "OUTDATED"):
        raise HTTPException(status_code=400, detail=f"Conexão com status: {item_status}")

    existing_result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.user_id == user.id, BankConnection.external_id == body.item_id)
    )
    existing_connection = existing_result.scalar_one_or_none()
    if existing_connection:
        if body.connection_name and existing_connection.institution_name != body.connection_name:
            existing_connection.institution_name = body.connection_name
            await db.commit()
        return existing_connection

    # Create bank connection
    connection = BankConnection(
        user_id=user.id,
        external_id=body.item_id,
        institution_name=institution_name,
        status="active",
        last_sync_at=datetime.now(timezone.utc),
    )
    db.add(connection)
    await db.flush()

    # Fetch and create accounts
    raw_accounts = await pluggy_service.get_accounts(api_key, body.item_id)
    for acc in raw_accounts:
        account = BankAccount(
            connection_id=connection.id,
            user_id=user.id,
            external_id=acc["id"],
            name=acc.get("name", "Conta"),
            type=pluggy_service.ACCOUNT_TYPE_MAP.get(acc.get("type", "").upper(), "checking"),
            balance=acc.get("balance", 0),
            currency=acc.get("currencyCode", "BRL"),
        )
        db.add(account)
        await db.flush()

        # Fetch initial transactions for this account
        raw_txns = await pluggy_service.get_transactions(api_key, acc["id"])
        for raw_txn in raw_txns:
            parsed = pluggy_service.parse_transaction(raw_txn, owner_names=owner_names)
            await _create_transaction_with_dividend(
                db,
                account_id=account.id,
                user_id=user.id,
                parsed=parsed,
            )

        await dividend_service.backfill_dividend_events_for_account(
            db,
            user_id=user.id,
            account_id=account.id,
        )

    await db.commit()
    result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.id == connection.id, BankConnection.user_id == user.id)
    )
    created_connection = result.scalar_one()
    return created_connection


@router.get("", response_model=list[BankConnectionResponse])
async def list_connections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.user_id == user.id)
        .order_by(BankConnection.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{connection_id}/sync", response_model=SyncResponse)
async def sync_connection(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.id == connection_id, BankConnection.user_id == user.id)
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")

    client_id, client_secret, owner_names = await _get_user_pluggy_creds(user.id, db)
    api_key = await pluggy_service.authenticate(user.id, client_id, client_secret)

    sync_result = await sync_connection_service(
        db, connection, api_key=api_key, owner_names=owner_names
    )
    return SyncResponse(
        new_transactions=sync_result.new_transactions,
        connection_status=sync_result.connection_status,
    )


@router.post("/{connection_id}/reconnect-token", response_model=ConnectTokenResponse)
async def get_reconnect_token(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankConnection)
        .where(BankConnection.id == connection_id, BankConnection.user_id == user.id)
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")

    client_id, client_secret, owner_names = await _get_user_pluggy_creds(user.id, db)
    api_key = await pluggy_service.authenticate(user.id, client_id, client_secret)
    token = await pluggy_service.create_connect_token(api_key, str(user.id), item_id=connection.external_id)
    return ConnectTokenResponse(access_token=token)


@router.patch("/{connection_id}", response_model=BankConnectionResponse)
async def rename_connection(
    connection_id: int,
    body: ConnectionRenameRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankConnection)
        .options(selectinload(BankConnection.accounts))
        .where(BankConnection.id == connection_id, BankConnection.user_id == user.id)
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")
    connection.institution_name = body.institution_name
    await db.commit()
    await db.refresh(connection)
    return connection


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankConnection)
        .where(BankConnection.id == connection_id, BankConnection.user_id == user.id)
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")
    await db.delete(connection)
    await db.commit()
