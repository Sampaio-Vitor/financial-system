import logging

from google import genai

from arq.connections import RedisSettings

from app.config import settings
from app.services.ocr_service import process_image_ocr

logger = logging.getLogger(__name__)


async def startup(ctx: dict) -> None:
    logger.info("arq worker starting up")
    if settings.GEMINI_API_KEY:
        ctx["genai_client"] = genai.Client(api_key=settings.GEMINI_API_KEY)
    else:
        logger.warning("GEMINI_API_KEY not set — OCR jobs will fail")


async def shutdown(ctx: dict) -> None:
    logger.info("arq worker shutting down")


class WorkerSettings:
    functions = [process_image_ocr]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 5
    job_timeout = 60
    max_tries = 3
    keep_result = 3600  # 1 hour
