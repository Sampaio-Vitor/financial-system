from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market, TesouroKind
from app.services.bastter_sync_service import (
    BASTTER_MOVEMENT_ENDPOINT,
    BastterSyncError,
    BastterSyncService,
    SUPPORTED_TYPES,
    tesouro_descricao_for,
)


pytestmark = pytest.mark.unit


def _purchase(asset):
    return SimpleNamespace(
        asset=asset,
        quantity=Decimal("5.56"),
        purchase_date=date(2026, 5, 8),
        total_value=Decimal("16484.34"),
        total_value_native=Decimal("16484.34"),
    )


def _td_asset(td_kind=TesouroKind.SELIC, year=2031):
    return SimpleNamespace(
        ticker=f"TD-{'SELIC' if td_kind == TesouroKind.SELIC else 'IPCA'}-{year}",
        type=AssetType.RF,
        asset_class=AssetClass.RF,
        market=Market.BR,
        quote_currency=CurrencyCode.BRL,
        td_kind=td_kind,
        td_maturity_year=year,
    )


def test_supported_types_includes_rf():
    assert SUPPORTED_TYPES[AssetType.RF] == "rendafixa"


def test_tesouro_descricao_selic():
    assert tesouro_descricao_for("TD-SELIC-2031", TesouroKind.SELIC, 2031) == "Tesouro Selic 2031"


def test_tesouro_descricao_ipca():
    assert tesouro_descricao_for("TD-IPCA-2035", TesouroKind.IPCA, 2035) == "Tesouro IPCA+ 2035"


def test_resolve_bastter_tipo_for_tesouro():
    service = BastterSyncService()
    purchase = _purchase(_td_asset())
    assert service.resolve_bastter_tipo(purchase) == "rendafixa"


def test_resolve_bastter_tipo_rejects_rf_without_td_kind():
    service = BastterSyncService()
    asset = _td_asset()
    asset.td_kind = None
    asset.td_maturity_year = None
    purchase = _purchase(asset)
    with pytest.raises(BastterSyncError):
        service.resolve_bastter_tipo(purchase)


def test_build_payload_tesouro_uses_movement_endpoint():
    service = BastterSyncService()
    purchase = _purchase(_td_asset())
    endpoint, payload, bastter_tipo = service.build_payload(purchase, ativo_id=298226)
    assert endpoint == BASTTER_MOVEMENT_ENDPOINT
    assert bastter_tipo == "rendafixa"
    assert payload["tipo"] == "rendafixa"
    assert payload["tipomov"] == "compra"
    assert payload["ativoID"] == 298226
    assert payload["totalOperacaoBruto"] == float(Decimal("16484.34"))
    assert payload["totalOperacaoLiq"] is None
    assert payload["data"] == "05/08/2026"
