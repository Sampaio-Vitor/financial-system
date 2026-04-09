from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import engine
from app.config import settings
from app.limiter import limiter
from app.routers import admin, auth, assets, purchases, fixed_income, portfolio, prices, allocation, rebalancing, financial_reserve, snapshots, pluggy_credentials, connections, transactions, saved_plans, dividends, bastter_sync, retirement


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.scheduler import setup_scheduler
    sched = setup_scheduler()
    sched.start()
    yield
    sched.shutdown()
    await engine.dispose()


app = FastAPI(
    title="Carteira de Investimentos API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.API_DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.API_DOCS_ENABLED else None,
)
app.state.limiter = limiter


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Muitas tentativas. Tente novamente em alguns minutos."},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'self'"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
csrf_trusted_origins = [
    origin.strip()
    for origin in (settings.CSRF_TRUSTED_ORIGINS or settings.CORS_ORIGINS).split(",")
    if origin.strip()
]


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await call_next(request)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        if not request.cookies.get(settings.SESSION_COOKIE_NAME):
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin and origin in csrf_trusted_origins:
            return await call_next(request)

        referer = request.headers.get("referer")
        if referer:
            parts = urlsplit(referer)
            referer_origin = f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""
            if referer_origin in csrf_trusted_origins:
                return await call_next(request)

        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF validation failed"},
        )


app.add_middleware(CSRFMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
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
app.include_router(pluggy_credentials.router, prefix="/api/pluggy-credentials", tags=["pluggy-credentials"])
app.include_router(connections.router, prefix="/api/connections", tags=["connections"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(dividends.router, prefix="/api/dividends", tags=["dividends"])
app.include_router(saved_plans.router, prefix="/api/saved-plans", tags=["saved-plans"])
app.include_router(bastter_sync.router, prefix="/api/bastter", tags=["bastter"])
app.include_router(retirement.router, prefix="/api/retirement", tags=["retirement"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
