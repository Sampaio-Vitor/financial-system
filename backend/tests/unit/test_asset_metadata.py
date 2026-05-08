import pytest

from app.models.asset import (
    AllocationBucket,
    AssetClass,
    AssetType,
    CurrencyCode,
    Market,
    asset_bucket_for,
    asset_bucket_from_legacy_type,
    legacy_type_for,
    resolve_asset_metadata,
)


pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "asset_class,market,expected",
    [
        (AssetClass.STOCK, Market.BR, AllocationBucket.STOCK_BR),
        (AssetClass.STOCK, Market.US, AllocationBucket.STOCK_US),
        (AssetClass.ETF, Market.BR, AllocationBucket.STOCK_BR),
        (AssetClass.ETF, Market.US, AllocationBucket.ETF_INTL),
        (AssetClass.ETF, Market.EU, AllocationBucket.ETF_INTL),
        (AssetClass.FII, Market.BR, AllocationBucket.FII),
        (AssetClass.RF, Market.BR, AllocationBucket.RF),
    ],
)
def test_asset_bucket_for(asset_class, market, expected):
    assert asset_bucket_for(asset_class, market) is expected


def test_asset_bucket_for_unknown_class_raises():
    class _Fake:
        pass
    with pytest.raises(ValueError):
        asset_bucket_for(_Fake(), Market.BR)


@pytest.mark.parametrize(
    "asset_type,expected",
    [
        (AssetType.STOCK, AllocationBucket.STOCK_US),
        (AssetType.ACAO, AllocationBucket.STOCK_BR),
        (AssetType.FII, AllocationBucket.FII),
        (AssetType.RF, AllocationBucket.RF),
    ],
)
def test_asset_bucket_from_legacy_type(asset_type, expected):
    assert asset_bucket_from_legacy_type(asset_type) is expected


@pytest.mark.parametrize(
    "asset_class,market,expected",
    [
        (AssetClass.RF, Market.BR, AssetType.RF),
        (AssetClass.FII, Market.BR, AssetType.FII),
        (AssetClass.STOCK, Market.BR, AssetType.ACAO),
        (AssetClass.STOCK, Market.US, AssetType.STOCK),
        (AssetClass.ETF, Market.US, AssetType.STOCK),
    ],
)
def test_legacy_type_for(asset_class, market, expected):
    assert legacy_type_for(asset_class, market) is expected


def test_resolve_asset_metadata_uses_explicit_when_present():
    out = resolve_asset_metadata(
        legacy_type=AssetType.ACAO,
        asset_class=AssetClass.ETF,
        market=Market.US,
        quote_currency=CurrencyCode.USD,
    )
    assert out == (AssetClass.ETF, Market.US, CurrencyCode.USD)


def test_resolve_asset_metadata_falls_back_to_legacy():
    out = resolve_asset_metadata(
        legacy_type=AssetType.ACAO,
        asset_class=None,
        market=None,
        quote_currency=None,
    )
    assert out == (AssetClass.STOCK, Market.BR, CurrencyCode.BRL)
