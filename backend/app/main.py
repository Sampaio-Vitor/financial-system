from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.database import engine, Base
from app.limiter import limiter
from app.routers import auth, assets, purchases, fixed_income, portfolio, prices, allocation, rebalancing, financial_reserve, snapshots


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="Carteira de Investimentos API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Muitas tentativas. Tente novamente em alguns minutos."},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(purchases.router, prefix="/api/purchases", tags=["purchases"])
app.include_router(fixed_income.router, prefix="/api/fixed-income", tags=["fixed-income"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(prices.router, prefix="/api/prices", tags=["prices"])
app.include_router(allocation.router, prefix="/api/allocation-targets", tags=["allocation"])
app.include_router(rebalancing.router, prefix="/api/rebalancing", tags=["rebalancing"])
app.include_router(financial_reserve.router, prefix="/api/financial-reserves", tags=["financial-reserves"])
app.include_router(snapshots.router, prefix="/api/snapshots", tags=["snapshots"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
