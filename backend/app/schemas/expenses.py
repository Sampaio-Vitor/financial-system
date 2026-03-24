from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


# --- Pluggy Credentials ---

class PluggyCredentialsCreate(BaseModel):
    client_id: str
    client_secret: str


class PluggyCredentialsStatus(BaseModel):
    has_credentials: bool


# --- Bank Connection ---

class BankAccountResponse(BaseModel):
    id: int
    name: str
    type: str
    balance: Decimal
    currency: str

    model_config = {"from_attributes": True}


class BankConnectionResponse(BaseModel):
    id: int
    institution_name: str
    status: str
    last_sync_at: datetime | None
    created_at: datetime
    accounts: list[BankAccountResponse] = []

    model_config = {"from_attributes": True}


class ConnectTokenResponse(BaseModel):
    access_token: str


class ConnectionCallbackRequest(BaseModel):
    item_id: str
    connection_name: str | None = None


class ConnectionRenameRequest(BaseModel):
    institution_name: str


class SyncResponse(BaseModel):
    new_transactions: int
    connection_status: str


# --- Transaction ---

class TransactionResponse(BaseModel):
    id: int
    account_id: int
    description: str
    payee: str | None
    amount: Decimal
    date: date
    type: str
    category: str
    pluggy_category: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionSummaryItem(BaseModel):
    category: str
    total: Decimal
    count: int


class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]
    total_count: int


class TransactionSummaryResponse(BaseModel):
    month: str
    total_expenses: Decimal
    total_income: Decimal
    categories: list[TransactionSummaryItem]
