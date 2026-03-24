"""Pluggy API client — per-user credentials, no global API key cache."""

import time
from datetime import date
from decimal import Decimal
from typing import Optional

import httpx

PLUGGY_API_BASE = "https://api.pluggy.ai"

# In-memory API key cache: keyed by user_id → (api_key, expires_at)
_api_key_cache: dict[int, tuple[str, float]] = {}


PLUGGY_CATEGORY_MAP: dict[str, str] = {
    "Eating out": "Alimentação",
    "Restaurants": "Alimentação",
    "Fast Food": "Alimentação",
    "Coffee shops": "Alimentação",
    "Groceries": "Mercado",
    "Supermarkets": "Mercado",
    "Pharmacy": "Saúde",
    "Health": "Saúde",
    "Taxi and ride-hailing": "Transporte",
    "Transport": "Transporte",
    "Gas Stations": "Transporte",
    "Parking": "Transporte",
    "Housing": "Moradia",
    "Rent": "Moradia",
    "Utilities": "Moradia",
    "Entertainment": "Lazer",
    "Leisure": "Lazer",
    "Travel": "Lazer",
    "Subscriptions": "Assinaturas",
    "Streaming": "Assinaturas",
    "Education": "Educação",
    "Books": "Educação",
    "Clothing": "Vestuário",
    "Shopping": "Vestuário",
    "Transfer": "Transferências",
    "Investments": "Investimentos",
    "Savings": "Investimentos",
    "Insurance": "Outros",
    "Taxes": "Outros",
    "Fees": "Outros",
}

ACCOUNT_TYPE_MAP: dict[str, str] = {
    "BANK": "checking",
    "CREDIT": "credit_card",
    "SAVINGS": "savings",
}


def map_pluggy_category(pluggy_category: str | None) -> str:
    if not pluggy_category:
        return "Outros"
    # Exact match
    if pluggy_category in PLUGGY_CATEGORY_MAP:
        return PLUGGY_CATEGORY_MAP[pluggy_category]
    # Try prefix before " - " (e.g. "Transfer - PIX" → "Transfer")
    prefix = pluggy_category.split(" - ")[0].strip()
    if prefix in PLUGGY_CATEGORY_MAP:
        return PLUGGY_CATEGORY_MAP[prefix]
    return "Outros"


async def authenticate(user_id: int, client_id: str, client_secret: str) -> str:
    """Authenticate with Pluggy API and return an API key. Caches per user."""
    now = time.time()
    cached = _api_key_cache.get(user_id)
    if cached and (cached[1] - now) > 300:
        return cached[0]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{PLUGGY_API_BASE}/auth",
            json={"clientId": client_id, "clientSecret": client_secret},
        )
        resp.raise_for_status()
        data = resp.json()

    api_key = data["apiKey"]
    _api_key_cache[user_id] = (api_key, now + 7200)
    return api_key


async def create_connect_token(api_key: str, client_user_id: str, item_id: str | None = None) -> str:
    """Create a 30-min connect token for the Pluggy widget."""
    body: dict = {"clientUserId": client_user_id}
    if item_id:
        body["itemId"] = item_id

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{PLUGGY_API_BASE}/connect_token",
            headers={"X-API-KEY": api_key},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    return data["accessToken"]


async def get_item(api_key: str, item_id: str) -> dict:
    """Fetch Pluggy item (connection) details."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PLUGGY_API_BASE}/items/{item_id}",
            headers={"X-API-KEY": api_key},
        )
        resp.raise_for_status()
        return resp.json()


async def get_accounts(api_key: str, item_id: str) -> list[dict]:
    """Fetch accounts for a Pluggy item."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PLUGGY_API_BASE}/accounts",
            headers={"X-API-KEY": api_key},
            params={"itemId": item_id},
        )
        resp.raise_for_status()
        data = resp.json()
    return data.get("results", [])


async def get_transactions(
    api_key: str,
    account_external_id: str,
    since: Optional[date] = None,
) -> list[dict]:
    """Fetch all transactions for an account, paginated."""
    all_txns: list[dict] = []
    page = 1

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params: dict = {
                "accountId": account_external_id,
                "pageSize": 500,
                "page": page,
            }
            if since:
                params["from"] = since.isoformat()

            resp = await client.get(
                f"{PLUGGY_API_BASE}/transactions",
                headers={"X-API-KEY": api_key},
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            if not results:
                break

            all_txns.extend(results)

            total_pages = data.get("totalPages", 1)
            if page >= total_pages:
                break
            page += 1

    return all_txns


def parse_transaction(txn: dict) -> dict:
    """Parse a raw Pluggy transaction into our format."""
    amount_raw = txn.get("amount", 0)
    amount = Decimal(str(abs(amount_raw)))

    pluggy_type = txn.get("type", "").upper()
    if pluggy_type == "DEBIT":
        txn_type = "debit"
    elif pluggy_type == "CREDIT":
        txn_type = "credit"
    else:
        txn_type = "credit" if amount_raw >= 0 else "debit"

    txn_date = date.fromisoformat(txn["date"][:10])
    status = "pending" if txn.get("status") == "PENDING" else "posted"
    pluggy_category = txn.get("category")
    category = map_pluggy_category(pluggy_category)

    return {
        "external_id": txn["id"],
        "description": txn.get("description", ""),
        "amount": amount,
        "date": txn_date,
        "type": txn_type,
        "category": category,
        "pluggy_category": pluggy_category,
        "status": status,
        "raw_data": txn,
    }
