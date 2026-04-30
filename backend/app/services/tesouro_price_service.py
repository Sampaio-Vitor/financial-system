import logging
from decimal import Decimal
from urllib.parse import quote

import httpx

from app.models.asset import TesouroKind

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.radaropcoes.com/bonds"
_TIMEOUT = 10.0


_KIND_DISPLAY = {
    TesouroKind.SELIC: "Selic",
    TesouroKind.IPCA: "IPCA+",
}


def bond_name_for(kind: TesouroKind, maturity_year: int) -> str:
    return f"Tesouro {_KIND_DISPLAY[kind]} {maturity_year}"


async def fetch_tesouro_price(
    kind: TesouroKind, maturity_year: int
) -> Decimal | None:
    """Fetch current redemption PU for a Tesouro bond. Returns None on failure."""
    name = bond_name_for(kind, maturity_year)
    url = f"{_BASE_URL}/{quote(name)}"
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
        logger.warning("Tesouro %s returned no redemption value", name)
        return None
    try:
        return Decimal(str(pu))
    except (ValueError, ArithmeticError) as exc:
        logger.warning("Tesouro %s: invalid PU %r (%s)", name, pu, exc)
        return None
