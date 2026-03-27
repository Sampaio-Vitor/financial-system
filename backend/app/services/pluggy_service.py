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
    # Alimentação
    "Eating out": "Alimentação",
    "Restaurants": "Alimentação",
    "Fast Food": "Alimentação",
    "Coffee shops": "Alimentação",
    "Bars": "Alimentação",
    # Mercado
    "Groceries": "Mercado",
    "Supermarkets": "Mercado",
    # Saúde
    "Pharmacy": "Saúde",
    "Health": "Saúde",
    "Medical expenses": "Saúde",
    # Transporte
    "Taxi and ride-hailing": "Transporte",
    "Transport": "Transporte",
    "Gas Stations": "Transporte",
    "Parking": "Transporte",
    "Tolls": "Transporte",
    # Moradia
    "Housing": "Moradia",
    "Rent": "Moradia",
    "Utilities": "Moradia",
    # Lazer
    "Entertainment": "Lazer",
    "Leisure": "Lazer",
    "Travel": "Lazer",
    # Assinaturas
    "Subscriptions": "Assinaturas",
    "Streaming": "Assinaturas",
    # Educação
    "Education": "Educação",
    "Books": "Educação",
    # Vestuário
    "Clothing": "Vestuário",
    "Shopping": "Vestuário",
    # Transferências
    "Transfer": "Transferências",
    "Transfers": "Transferências",
    # Transferência interna (mesma pessoa — excluída dos totais)
    "Same person transfer": "Transferência interna",
    # Investimentos
    "Investments": "Investimentos",
    "Savings": "Investimentos",
    # Pets
    "Pet supplies and vet": "Pets",
    "Pets": "Pets",
    # Renda
    "Salary": "Renda",
    "Income": "Renda",
    "Cashback": "Renda",
    "Refund": "Renda",
    # Outros
    "Insurance": "Outros",
    "Taxes": "Outros",
    "Fees": "Outros",
    "Other": "Outros",
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


def _extract_payee(txn: dict, txn_type: str) -> str | None:
    """Extract payee from description (split on |) or paymentData."""
    # Try description "Transferência enviada|Nome Pessoa" pattern
    desc = txn.get("description", "")
    if "|" in desc:
        parts = desc.split("|", 1)
        if len(parts) == 2 and parts[1].strip():
            return parts[1].strip()

    # Try paymentData receiver/payer
    payment_data = txn.get("paymentData")
    if payment_data:
        if txn_type == "debit":
            receiver = payment_data.get("receiver")
            if receiver and receiver.get("name"):
                return receiver["name"]
        else:
            payer = payment_data.get("payer")
            if payer and payer.get("name"):
                return payer["name"]

    # Try merchant
    merchant = txn.get("merchant")
    if merchant:
        return merchant.get("name") or merchant.get("businessName")

    return None


def _clean_description(desc: str) -> str:
    """Clean description: take part before | if present."""
    if "|" in desc:
        return desc.split("|", 1)[0].strip()
    return desc.strip()


def _is_internal_transfer(category: str, description: str, payee: str | None, owner_names: list[str]) -> bool:
    """Check if a transfer transaction is between the user's own accounts.

    Handles cases where Pluggy doesn't detect 'Same person transfer'
    (e.g. Inter bank which returns null paymentData).
    Uses exact match on payee name to avoid false positives
    (e.g. "Vitor Carvalho Sampaio" should NOT match "Vitor Carvalho Sampaio Tratamento de Dados Ltda").
    Falls back to description check for banks that embed the name in the description
    (e.g. "PIX ENVIADO - Cp :30306294-VITOR CARVALHO SAMPAIO").
    """
    if category != "Transferências" or not owner_names:
        return False
    names_upper = [n.upper() for n in owner_names]
    # Exact match on payee (most reliable)
    if payee:
        payee_upper = payee.strip().upper()
        if payee_upper in names_upper:
            return True
    # Fallback: check if name appears as a suffix in description after a separator
    # e.g. "PIX ENVIADO - Cp :30306294-VITOR CARVALHO SAMPAIO"
    desc_upper = description.upper()
    for name in names_upper:
        # Match name at end of description (after - separator)
        if desc_upper.endswith(name) or desc_upper.endswith(f"-{name}"):
            return True
    return False


def parse_transaction(txn: dict, owner_names: list[str] | None = None) -> dict:
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
    payee = _extract_payee(txn, txn_type)
    description = _clean_description(txn.get("description", ""))

    # Detect internal transfers not caught by Pluggy (e.g. Inter bank)
    if owner_names and _is_internal_transfer(category, description, payee, owner_names):
        category = "Transferência interna"

    return {
        "external_id": txn["id"],
        "description": description,
        "payee": payee,
        "amount": amount,
        "date": txn_date,
        "type": txn_type,
        "category": category,
        "pluggy_category": pluggy_category,
        "status": status,
        "raw_data": txn,
    }
