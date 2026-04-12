import base64
import logging

from google import genai
from google.genai import types, errors
from arq import Retry

from app.config import settings
from app.schemas.ocr import OcrResult

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analise esta imagem de um app de corretora de investimentos.
Extraia todas as operações de compra e venda visíveis.

Retorne APENAS um JSON válido no formato:
{
  "operations": [
    {
      "ticker": "PETR4",
      "date": "2026-04-10",
      "quantity": 100,
      "total_value": 3250.00,
      "operation_type": "compra",
      "currency": "BRL"
    }
  ],
  "confidence": "high",
  "notes": null
}

Regras:
- ticker deve ser o código do ativo (ex: PETR4, VALE3, ITUB4, IVVB11, AAPL, MSFT)
- date no formato YYYY-MM-DD
- quantity sempre positivo
- total_value sempre positivo (valor total da operação na moeda original)
- operation_type: "compra" ou "venda"
- currency: "BRL" ou "USD" ou "EUR" ou "GBP" (a moeda em que o valor está)
- confidence: "high", "medium" ou "low"
- Se não conseguir extrair algum campo com confiança, omita a operação e mencione em notes
"""


async def process_image_ocr(ctx: dict, image_b64: str, mime_type: str) -> dict:
    """arq task: send image to Gemini and return structured OCR result."""
    client = ctx.get("genai_client")
    if client is None:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

    image_bytes = base64.b64decode(image_b64)

    try:
        response = await client.aio.models.generate_content(
            model=settings.OCR_MODEL,
            contents=[
                EXTRACTION_PROMPT,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OcrResult,
            ),
        )
        result = OcrResult.model_validate_json(response.text)
        return result.model_dump()

    except errors.APIError as e:
        if e.code == 429:
            logger.warning("Gemini rate limited, retrying (attempt %s)", ctx.get("job_try", 1))
            raise Retry(defer=ctx.get("job_try", 1) * 10)
        logger.error("Gemini API error: %s", e)
        raise
    except Exception as e:
        logger.error("OCR processing failed: %s", e)
        raise
