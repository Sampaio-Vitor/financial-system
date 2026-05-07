import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import httpx

from app.models.asset import AssetClass, AssetType, Market, resolve_asset_metadata
from app.models.purchase import Purchase

BASTTER_BASE_URL = "https://bastter.com"
BASTTER_CATALOG_ENDPOINT = f"{BASTTER_BASE_URL}/mercado/WebServices/WS_Carteira.asmx/BS2ListAtivos"
BASTTER_MOVEMENT_ENDPOINT = f"{BASTTER_BASE_URL}/mercado/WebServices/WS_Carteira.asmx/SalvarMovimentacao"
BASTTER_STOCK_MOVEMENT_ENDPOINT = f"{BASTTER_BASE_URL}/mercado/WebServices/WS_Carteira.asmx/SaveMovement"
BASTTER_INIT_ENDPOINT = f"{BASTTER_BASE_URL}/mercado/WebServices/WS_Carteira.asmx/BS2Init"
BASTTER_INCLUIR_ENDPOINT = f"{BASTTER_BASE_URL}/mercado/webservices/WS_Carteira.asmx/Incluir"

BASTTER_CATALOG_PAYLOAD = {
    "classes": None,
    "ordenacao": "1",
    "classificacoes": ["2", "4", "6", "7"],
    "pas": ["1", "2", "3", "4"],
    "somentePosicao": False,
}

SUPPORTED_TYPES: dict[AssetType, str] = {
    AssetType.ACAO: "acao",
    AssetType.FII: "fii",
    AssetType.STOCK: "stock",
}

BASTTER_REFERERS: dict[str, str] = {
    "europa": f"{BASTTER_BASE_URL}/bs2/ativos/europa",
    "etf": f"{BASTTER_BASE_URL}/bs2/ativos/etf",
}


class BastterSyncError(Exception):
    pass


class BastterAuthenticationError(BastterSyncError):
    pass


class BastterAssetNotInCatalogError(BastterSyncError):
    def __init__(self, ticker: str, bastter_tipo: str) -> None:
        super().__init__(f"Ativo {ticker} ({bastter_tipo}) nao encontrado no catalogo do Bastter")
        self.ticker = ticker
        self.bastter_tipo = bastter_tipo


def _response_excerpt(response: httpx.Response) -> str:
    text = response.text.strip()
    if not text:
        return "(corpo vazio)"
    compact = " ".join(text.split())
    return compact[:500]


class BastterSyncService:
    def __init__(self) -> None:
        self._timeout = httpx.Timeout(30.0)

    def _headers(self, cookie: str, *, referer: str | None = None) -> dict[str, str]:
        return {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json; charset=UTF-8",
            "origin": BASTTER_BASE_URL,
            "referer": referer or f"{BASTTER_BASE_URL}/bs2/ativos/consolidado",
            "priority": "u=1, i",
            "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/146.0.0.0 Safari/537.36"
            ),
            "x-requested-with": "XMLHttpRequest",
            "cookie": cookie,
        }

    def _parse_wrapped_json(self, body: dict[str, Any]) -> dict[str, Any]:
        raw = body.get("d")
        if not isinstance(raw, str) or not raw.strip():
            raise BastterSyncError("Resposta invalida do Bastter")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BastterSyncError("Nao foi possivel interpretar a resposta do Bastter") from exc
        if not isinstance(parsed, dict):
            raise BastterSyncError("Formato de resposta inesperado do Bastter")
        return parsed

    async def fetch_assets_catalog(self, cookie: str) -> list[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    BASTTER_CATALOG_ENDPOINT,
                    headers=self._headers(cookie),
                    json=BASTTER_CATALOG_PAYLOAD,
                )
        except httpx.HTTPError as exc:
            raise BastterSyncError("Falha ao consultar o catalogo de ativos do Bastter") from exc

        if response.status_code in {401, 403}:
            raise BastterAuthenticationError(
                f"Sessao Bastter invalida ou expirada (HTTP {response.status_code})"
            )
        if response.status_code >= 400:
            raise BastterSyncError(
                f"Bastter rejeitou a consulta ao catalogo (HTTP {response.status_code})"
            )

        parsed = self._parse_wrapped_json(response.json())
        items = parsed.get("Items")
        if not isinstance(items, list):
            raise BastterSyncError("Catalogo de ativos invalido retornado pelo Bastter")
        return items

    def resolve_ativo_id(
        self,
        items: list[dict[str, Any]],
        *,
        ticker: str,
        bastter_tipo: str,
    ) -> int:
        normalized_ticker = ticker.strip().upper()
        matches = [
            item
            for item in items
            if str(item.get("TipoClasse", "")).strip().lower() == bastter_tipo
            and str(item.get("Descricao", "")).strip().upper() == normalized_ticker
        ]
        if not matches:
            raise BastterAssetNotInCatalogError(normalized_ticker, bastter_tipo)
        if len(matches) > 1:
            raise BastterSyncError(f"Mais de um ativo {ticker} ({bastter_tipo}) encontrado no Bastter")
        ativo_id = matches[0].get("AtivoID")
        if not isinstance(ativo_id, int):
            raise BastterSyncError(f"AtivoID invalido para {ticker} no catalogo do Bastter")
        return ativo_id

    async def fetch_carteira_id(self, cookie: str) -> int:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    BASTTER_INIT_ENDPOINT,
                    headers=self._headers(
                        cookie,
                        referer=f"{BASTTER_BASE_URL}/mercado/bs2/?home",
                    ),
                )
        except httpx.HTTPError as exc:
            raise BastterSyncError("Falha ao iniciar sessao com o Bastter") from exc

        if response.status_code in {401, 403}:
            raise BastterAuthenticationError(
                f"Sessao Bastter invalida ou expirada (HTTP {response.status_code})"
            )
        if response.status_code >= 400:
            raise BastterSyncError(
                f"Bastter rejeitou BS2Init (HTTP {response.status_code})"
            )

        parsed = self._parse_wrapped_json(response.json())
        carteira_id = parsed.get("CarteiraID")
        if not isinstance(carteira_id, int) or carteira_id <= 0:
            carteiras = parsed.get("Carteiras")
            if isinstance(carteiras, list) and carteiras:
                first = carteiras[0]
                if isinstance(first, dict):
                    candidate = first.get("CarteiraID")
                    if isinstance(candidate, int) and candidate > 0:
                        return candidate
            raise BastterSyncError("Nao foi possivel determinar a CarteiraID do Bastter")
        return carteira_id

    async def include_asset(
        self,
        cookie: str,
        *,
        tipo: str,
        descricao: str,
        carteira_id: int,
        classificacao_id: int = 2,
        anotacoes: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "tipo": tipo,
            "carteiraID": carteira_id,
            "descricao": descricao,
            "anotacoes": anotacoes,
            "classificacaoID": classificacao_id,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    BASTTER_INCLUIR_ENDPOINT,
                    headers=self._headers(
                        cookie,
                        referer=BASTTER_REFERERS.get(tipo, None),
                    ),
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise BastterSyncError("Falha ao incluir ativo no Bastter") from exc

        if response.status_code in {401, 403}:
            raise BastterAuthenticationError(
                f"Sessao Bastter invalida ou expirada (HTTP {response.status_code})"
            )
        if response.status_code >= 400:
            raise BastterSyncError(
                f"Bastter rejeitou inclusao do ativo (HTTP {response.status_code})"
            )

        return self._parse_incluir_response(response.json())

    def _parse_incluir_response(self, body: dict[str, Any]) -> dict[str, Any]:
        raw = body.get("d")
        if not isinstance(raw, str) or not raw.strip():
            raise BastterSyncError("Resposta invalida do Bastter")
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        text = raw.strip().lower()
        if "salvo com sucesso" in text or "item salvo" in text:
            return {"Return": True, "raw": raw}
        if "duplic" in text or "ja existe" in text or "já existe" in text:
            return {"Return": True, "raw": raw, "duplicated": True}
        raise BastterSyncError(f"Bastter retornou erro ao incluir ativo: {raw[:200]}")

    async def submit_purchase(
        self,
        cookie: str,
        *,
        endpoint: str,
        payload: dict[str, Any],
        bastter_tipo: str | None = None,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    endpoint,
                    headers=self._headers(
                        cookie,
                        referer=BASTTER_REFERERS.get(bastter_tipo or "", None),
                    ),
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise BastterSyncError("Falha ao enviar a movimentacao para o Bastter") from exc

        if response.status_code in {401, 403}:
            raise BastterAuthenticationError(
                f"Sessao Bastter invalida ou expirada (HTTP {response.status_code})"
            )
        if response.status_code >= 400:
            raise BastterSyncError(
                f"Bastter rejeitou a movimentacao (HTTP {response.status_code})"
            )

        return self._parse_wrapped_json(response.json())

    def build_payload(self, purchase: Purchase, *, ativo_id: int) -> tuple[str, dict[str, Any], str]:
        if purchase.asset is None or purchase.asset.type not in SUPPORTED_TYPES:
            raise BastterSyncError("Tipo de ativo nao suportado para sincronizacao com Bastter")

        bastter_tipo = self.resolve_bastter_tipo(purchase)
        if self.uses_stock_movement_endpoint(bastter_tipo):
            payload = {
                "movimentacaoID": 0,
                "tipo": bastter_tipo,
                "ativoID": ativo_id,
                "quantidade": self._decimal_to_number(purchase.quantity),
                "data": self._format_bastter_date(purchase.purchase_date),
                "corretagem": 0,
                "totalOperacao": 0,
                "totalOperacaoEstrangeiro": self._decimal_to_string(purchase.total_value_native),
            }
            return BASTTER_STOCK_MOVEMENT_ENDPOINT, payload, bastter_tipo

        payload = {
            "movimentacaoID": 0,
            "tipo": bastter_tipo,
            "tipomov": "compra",
            "ativoID": ativo_id,
            "quantidade": self._decimal_to_number(purchase.quantity),
            "data": self._format_bastter_date(purchase.purchase_date),
            "totalOperacaoBruto": self._decimal_to_number(purchase.total_value),
            "totalOperacaoLiq": None,
            "gasto": False,
            "ignorair": False,
            "ignoraIsencao": False,
            "observacao": None,
            "subscricaoID": 0,
        }
        return BASTTER_MOVEMENT_ENDPOINT, payload, bastter_tipo

    def resolve_bastter_tipo(self, purchase: Purchase) -> str:
        if purchase.asset is None:
            raise BastterSyncError("Movimentacao sem ativo associado")

        asset_class, market, _quote_currency = resolve_asset_metadata(
            legacy_type=purchase.asset.type,
            asset_class=purchase.asset.asset_class,
            market=purchase.asset.market,
            quote_currency=purchase.asset.quote_currency,
        )

        if asset_class == AssetClass.ETF:
            return "etf"
        if purchase.asset.type == AssetType.ACAO:
            return "acao"
        if purchase.asset.type == AssetType.FII:
            return "fii"
        if purchase.asset.type == AssetType.STOCK and market == Market.EU:
            return "europa"
        if purchase.asset.type == AssetType.STOCK:
            return "stock"

        raise BastterSyncError(
            f"Tipo de ativo nao suportado para sincronizacao com Bastter: {asset_class.value}/{market.value}"
        )

    def uses_stock_movement_endpoint(self, bastter_tipo: str) -> bool:
        return bastter_tipo in {"stock", "europa", "etf"}

    def _format_bastter_date(self, value: date) -> str:
        return value.strftime("%m/%d/%Y")

    def _decimal_to_number(self, value: Decimal) -> int | float:
        normalized = value.normalize()
        if normalized == normalized.to_integral():
            return int(normalized)
        return float(normalized)

    def _decimal_to_string(self, value: Decimal, places: str = "0.01") -> str:
        quantized = value.quantize(Decimal(places), rounding=ROUND_HALF_UP)
        return format(quantized, "f")
