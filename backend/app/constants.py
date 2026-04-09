from app.models.asset import AllocationBucket, AssetClass, AssetType, CurrencyCode, Market

CLASS_LABELS = {
    AssetType.STOCK: "Stocks (EUA)",
    AssetType.ACAO: "Acoes (Brasil)",
    AssetType.FII: "FIIs",
    AssetType.RF: "Renda Fixa",
}

ASSET_CLASS_LABELS = {
    AssetClass.STOCK: "Acoes",
    AssetClass.ETF: "ETFs",
    AssetClass.FII: "FIIs",
    AssetClass.RF: "Renda Fixa",
}

MARKET_LABELS = {
    Market.BR: "Brasil",
    Market.US: "Estados Unidos",
    Market.EU: "Europa",
    Market.UK: "Reino Unido",
}

CURRENCY_LABELS = {
    CurrencyCode.BRL: "BRL",
    CurrencyCode.USD: "USD",
    CurrencyCode.EUR: "EUR",
    CurrencyCode.GBP: "GBP",
}

ALLOCATION_BUCKET_LABELS = {
    AllocationBucket.STOCK_BR: "Acoes (Brasil)",
    AllocationBucket.STOCK_US: "Stocks",
    AllocationBucket.ETF_INTL: "ETFs (Exterior)",
    AllocationBucket.FII: "FIIs",
    AllocationBucket.RF: "Renda Fixa",
}
