import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

import httpx

from app.models.asset import TesouroKind

logger = logging.getLogger(__name__)

_RADAR_BASE_URL = "https://api.radaropcoes.com/bonds"
_TESOURO_TRANSPARENTE_CSV_URL = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
)
_TIMEOUT = 10.0
_CSV_CACHE_TTL = timedelta(hours=6)
_csv_cache: tuple[datetime, str] | None = None


_KIND_DISPLAY = {
    TesouroKind.SELIC: "Selic",
    TesouroKind.IPCA: "IPCA+",
}
_OFFICIAL_TITLE = {
    TesouroKind.SELIC: "Tesouro Selic",
    TesouroKind.IPCA: "Tesouro IPCA+",
}


def bond_name_for(kind: TesouroKind, maturity_year: int) -> str:
    return f"Tesouro {_KIND_DISPLAY[kind]} {maturity_year}"


async def fetch_tesouro_price(kind: TesouroKind, maturity_year: int) -> Decimal | None:
    """Fetch current redemption PU for a Tesouro bond. Returns None on failure."""
    official_price = await _fetch_tesouro_transparente_price(kind, maturity_year)
    if official_price is not None:
        return official_price
    return await _fetch_radar_price(kind, maturity_year)


async def _fetch_tesouro_transparente_price(
    kind: TesouroKind, maturity_year: int
) -> Decimal | None:
    name = bond_name_for(kind, maturity_year)
    try:
        csv_text = await _fetch_official_csv()
    except httpx.HTTPError as exc:
        logger.warning("Tesouro Transparente fetch failed for %s: %s", name, exc)
        return None
    price = _extract_official_price(csv_text, kind, maturity_year)
    if price is None:
        logger.warning("Tesouro Transparente returned no PU Venda for %s", name)
    return price


async def _fetch_official_csv() -> str:
    global _csv_cache
    now = datetime.now(timezone.utc)
    if _csv_cache is not None:
        fetched_at, csv_text = _csv_cache
        if now - fetched_at < _CSV_CACHE_TTL:
            return csv_text

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(_TESOURO_TRANSPARENTE_CSV_URL)
        resp.raise_for_status()
        csv_text = resp.text

    _csv_cache = (now, csv_text)
    return csv_text


def _extract_official_price(
    csv_text: str, kind: TesouroKind, maturity_year: int
) -> Decimal | None:
    expected_title = _OFFICIAL_TITLE[kind]
    candidates: list[tuple[datetime, datetime, Decimal]] = []
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=";")
    for row in reader:
        if row.get("Tipo Titulo") != expected_title:
            continue

        maturity_date = _parse_br_date(row.get("Data Vencimento"))
        if maturity_date is None or maturity_date.year != maturity_year:
            continue

        base_date = _parse_br_date(row.get("Data Base"))
        price = _parse_br_decimal(row.get("PU Venda Manha")) or _parse_br_decimal(
            row.get("PU Base Manha")
        )
        if base_date is None or price is None or price <= 0:
            continue

        candidates.append((base_date, maturity_date, price))

    if not candidates:
        return None

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def _parse_br_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d/%m/%Y")
    except ValueError:
        return None


def _parse_br_decimal(value: str | None) -> Decimal | None:
    if not value:
        return None
    normalized = value.strip()
    if "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    try:
        return Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None


async def _fetch_radar_price(kind: TesouroKind, maturity_year: int) -> Decimal | None:
    name = bond_name_for(kind, maturity_year)
    url = f"{_RADAR_BASE_URL}/{quote(name)}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Tesouro fetch failed for %s: %s", name, exc)
        return None

    pu = data.get("unitaryRedemptionValue")
    if pu is None or pu == 0:
        logger.warning("Radar Opcoes returned no redemption value for %s", name)
        return None
    try:
        return Decimal(str(pu))
    except (InvalidOperation, ValueError, ArithmeticError) as exc:
        logger.warning("Radar Opcoes %s: invalid PU %r (%s)", name, pu, exc)
        return None
