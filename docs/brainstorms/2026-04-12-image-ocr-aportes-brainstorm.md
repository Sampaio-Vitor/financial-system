# OCR de Imagens para Cadastro de Aportes

**Data:** 2026-04-12
**Status:** Brainstorm

---

## O que estamos construindo

Um sistema que permite ao usuário enviar um screenshot do app da corretora, processar a imagem via Gemini Flash Lite para extrair dados de investimentos, e preencher automaticamente os aportes no sistema com review antes de salvar.

### Fluxo completo

1. Usuário clica em "Importar via Imagem" na página de aportes
2. Seleciona/arrasta uma ou mais imagens (screenshots do app da corretora)
3. Frontend faz upload das imagens para o backend (multipart/form-data)
4. Backend converte cada imagem pra base64 e enfileira um job por imagem no Redis (via arq)
5. Worker arq processa cada job: envia base64 pro Gemini Flash Lite com prompt estruturado
6. Gemini retorna JSON com os aportes extraídos (ticker, data, quantidade, valor total, tipo operação)
7. Frontend faz polling em cada job_id até todos completarem
8. Tela de review mostra todos os aportes extraídos consolidados, editáveis
9. Usuário revisa, corrige, adiciona ativos faltantes ao catálogo se necessário, e confirma
10. Sistema cria os aportes via `POST /api/purchases` (bulk)

## Por que esta abordagem

### Redis + arq (vs síncrono ou BackgroundTasks)

- **Desacoplamento:** processamento de imagem fica isolado do request/response cycle
- **Resiliência:** se o worker cair, jobs ficam na fila e são reprocessados
- **Retry automático:** arq tem retry built-in pra falhas transientes da API do Gemini
- **Escalabilidade futura:** pode adicionar mais workers sem mudar código
- **Monitoramento:** visibilidade sobre jobs pendentes, falhados, concluídos

### Gemini Flash Lite (vs outros modelos)

- Barato e rápido pra tarefas de extração de dados visuais
- Suporta imagens nativamente
- API simples (Google AI SDK)

## Decisões-chave

### 1. Dados que o Gemini extrai

Apenas: **ticker, data da operação, quantidade, valor total, tipo (compra/venda)**

O sistema **não** precisa extrair cotação unitária — isso já é calculado (`unit_price = total_value / quantity`). A moeda é inferida pelo asset cadastrado.

### 2. Prompt estruturado pro Gemini

```
Analise esta imagem de um app de corretora de investimentos.
Extraia todas as operações de compra e venda visíveis.

Retorne APENAS um JSON válido no formato:
{
  "operations": [
    {
      "ticker": "PETR4",
      "date": "2026-04-10",
      "quantity": 100,
      "total_value": 3250.00,
      "operation_type": "compra"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "observações sobre dados que não conseguiu extrair"
}

Regras:
- ticker deve ser o código do ativo (ex: PETR4, VALE3, ITUB4, IVVB11)
- date no formato YYYY-MM-DD
- quantity sempre positivo
- total_value em reais, sempre positivo
- operation_type: "compra" ou "venda"
- Se não conseguir extrair algum campo com confiança, omita a operação e mencione em notes
```

### 3. Tela de review

Modal/página com tabela editável mostrando:
- Ticker (com indicador se existe ou não no catálogo do usuário)
- Data
- Quantidade
- Valor total
- Tipo (compra/venda)
- Status: OK / Ticker não encontrado

Para tickers não encontrados: botão inline "Adicionar ativo" que permite cadastrar o ativo ali mesmo, sem perder o processamento.

### 4. Ticker não encontrado no catálogo

- Mostrar aviso visual (badge amarelo)
- Oferecer opção de adicionar o ativo ao catálogo na própria tela de review
- Só após adicionar o ativo, o aporte correspondente pode ser confirmado

### 5. Infraestrutura

- **Redis:** container novo no Docker Compose (redis:7-alpine)
- **arq worker:** processo separado (pode ser outro container ou entrypoint do backend)
- **Gemini API key:** env var `GEMINI_API_KEY`
- **Upload:** imagem enviada como multipart/form-data, armazenada temporariamente (ou enviada como base64 direto pro Gemini)

### 6. Polling do resultado

- Frontend faz polling em `GET /api/ocr/jobs/{job_id}` a cada 2s
- Endpoint retorna status: `pending`, `processing`, `completed`, `failed`
- Quando `completed`, retorna os dados extraídos

## Stack técnica

| Componente | Tecnologia |
|---|---|
| Fila | Redis 7 (alpine) |
| Worker | arq (async Python) |
| OCR/Extração | Gemini Flash Lite (google-generativeai SDK) |
| Upload | FastAPI UploadFile |
| Frontend | Modal com dropzone + tabela editável |

## Containers Docker adicionados

- `redis` — Redis 7 Alpine (porta 6379, sem persistência necessária)
- `worker` — Container separado, mesma imagem Docker do backend com entrypoint `arq app.worker.WorkerSettings`

## Resolved Questions

1. **Armazenamento da imagem:** Base64 direto na memória, sem salvar em disco. Mais simples, sem necessidade de cleanup.

2. **Worker:** Container separado usando a mesma imagem do backend com entrypoint diferente. Isolado e escalável.

3. **Múltiplas imagens:** Sim na v1. Dropzone aceita várias imagens, cria um job por imagem, tela de review consolida resultados de todos os jobs.

## Open Questions

(nenhuma)
