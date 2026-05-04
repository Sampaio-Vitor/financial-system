import base64
import logging

from google import genai
from google.genai import types, errors
from arq import Retry

from app.config import settings
from app.schemas.ocr import OcrResult

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analise esta imagem de um app de corretora de investimentos.
Extraia as ORDENS consolidadas (não fills/execuções individuais).

REGRA CRÍTICA — CONSOLIDAÇÃO DE ORDENS:
Uma única ordem pode ser executada pela bolsa em múltiplos fills (execuções parciais)
por questão de liquidez. Esses fills aparecem como linhas separadas (ex: "Confirmada
20 unidades por R$ X", "Confirmada 12 unidades por R$ X", "Confirmada 1 unidade por
R$ X"), mas representam UMA ÚNICA ordem.

Sempre que possível, extraia a ORDEM CONSOLIDADA (totais finais), NÃO os fills.
Indicadores de que linhas pertencem à mesma ordem:
- Mesmo número de ordem ("Ordem 109464724")
- Mesmo ticker, mesma data/hora próxima, mesmo preço unitário
- Existência de uma linha de resumo (ex: "Processando: Quantidade: 33, Preço: R$ X"
  ou "Enviada: 33 unidades por R$ X") — PREFIRA essa linha de resumo
- Soma dos fills bate com a quantidade total da ordem

Se houver linha de resumo da ordem (Enviada/Processando/total), use-a.
Caso contrário, SOME os fills da mesma ordem em uma única operação.
NUNCA emita múltiplas operações para a mesma ordem.

Retorne APENAS um JSON válido no formato:
{
  "operations": [
    {
      "ticker": "VRTA11",
      "date": "2026-05-04",
      "quantity": 33,
      "total_value": 84255.93,
      "operation_type": "compra",
      "currency": "BRL"
    }
  ],
  "confidence": "high",
  "notes": null
}

Regras de campos:
- ticker: código do ativo (ex: PETR4, VALE3, VRTA11, AAPL, MSFT)
- date: YYYY-MM-DD (data da ordem; se houver múltiplos fills, use a data da ordem)
- quantity: quantidade TOTAL da ordem consolidada (soma dos fills), sempre positivo
- total_value: VALOR TOTAL da ordem (quantidade × preço unitário). Atenção:
  * Se a tela mostra "X unidades por R$ Y" e Y é o PREÇO UNITÁRIO, então
    total_value = X × Y (não use Y direto)
  * Se Y já é o valor total pago, use Y
  * Em caso de dúvida, multiplique quantidade × preço unitário
- operation_type: "compra" ou "venda"
- currency: "BRL", "USD", "EUR" ou "GBP"
- confidence: "high", "medium" ou "low"
- Se não conseguir extrair com confiança, omita e explique em notes
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
