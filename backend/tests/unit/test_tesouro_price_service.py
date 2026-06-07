from decimal import Decimal

import pytest

from app.models.asset import TesouroKind
from app.services import tesouro_price_service as service


pytestmark = pytest.mark.unit


CSV_TEXT = """Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
Tesouro IPCA+ com Juros Semestrais;15/08/2050;29/05/2026;7,00;7,10;1000,00;999,99;999,99
Tesouro IPCA+;15/08/2050;28/05/2026;7,04;7,16;917,30;892,51;892,51
Tesouro IPCA+;15/08/2050;29/05/2026;7,07;7,19;911,82;886,91;886,91
Tesouro Selic;01/03/2031;28/05/2026;0,08;0,09;19041,07;19021,80;19021,80
"""


def test_extract_official_price_uses_latest_exact_title_match():
    price = service._extract_official_price(CSV_TEXT, TesouroKind.IPCA, 2050)

    assert price == Decimal("886.91")


def test_extract_official_price_supports_selic():
    price = service._extract_official_price(CSV_TEXT, TesouroKind.SELIC, 2031)

    assert price == Decimal("19021.80")


async def test_fetch_tesouro_price_uses_official_csv_before_radar(monkeypatch):
    async def fake_fetch_official_csv():
        return CSV_TEXT

    async def fail_radar(kind, maturity_year):
        raise AssertionError("radar fallback should not be called")

    monkeypatch.setattr(service, "_fetch_official_csv", fake_fetch_official_csv)
    monkeypatch.setattr(service, "_fetch_radar_price", fail_radar)

    price = await service.fetch_tesouro_price(TesouroKind.IPCA, 2050)

    assert price == Decimal("886.91")


async def test_fetch_tesouro_price_falls_back_to_radar_when_official_missing(
    monkeypatch,
):
    async def fake_fetch_official_csv():
        return CSV_TEXT

    async def fake_radar(kind, maturity_year):
        assert kind == TesouroKind.IPCA
        assert maturity_year == 2032
        return Decimal("1234.56")

    monkeypatch.setattr(service, "_fetch_official_csv", fake_fetch_official_csv)
    monkeypatch.setattr(service, "_fetch_radar_price", fake_radar)

    price = await service.fetch_tesouro_price(TesouroKind.IPCA, 2032)

    assert price == Decimal("1234.56")
