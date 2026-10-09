# Ghost Protocol AI Verifier

This service analyzes submitted evidence and produces a **structured recommendation only**. It cannot authorize or send a blockchain transaction. Every `HUMAN_REVIEW_REQUIRED` result remains blocked until an identified reviewer explicitly approves the matching assessment through the Node oracle API.

The default `mock` mode is deterministic and safe for local tests. Set `AI_MODE=live` to call `gemini-3-flash-preview` through the configured OpenAI-compatible model proxy. Live mode requires `OPENAI_API_KEY` and `OPENAI_API_BASE` in the service environment; do not expose either value to browsers.

## Local run

```bash
cd packages/backend-ai/python-rag
sudo pip3 install -r requirements.txt
AI_MODE=mock uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run the unit and HTTP API tests:

```bash
python -m pytest -q
```

To use live structured analysis with synthetic material only:

```bash
AI_MODE=live AI_MODEL=gemini-3-flash-preview uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`POST /v1/verify-text` accepts a JSON body with `document_text`, `source_name`, and optional `declared_document_type`. `POST /v1/verify-document` accepts one text-based PDF or a UTF-8 text file up to 8 MiB. Invalid PDF files, non-UTF-8 text, and oversized uploads return client errors. Scanned PDFs currently require a transcription or a separate OCR/image pipeline. This service does not implement news RAG or establish document authenticity.
