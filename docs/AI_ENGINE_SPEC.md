# Python Evidence Assessment Service

**Package:** `packages/backend-ai/python-rag`
**Implemented stack:** Python, FastAPI, Pydantic, pypdf, OpenAI-compatible client
**Status:** Text-based document assessment prototype; not an authenticity authority

## Implemented endpoints

### `GET /health`

Returns service status, mode, model name, and `automatic_release: false`.

### `POST /v1/verify-text`

Accepts JSON with `document_text` (20-20,000 characters), `source_name`, and optional `declared_document_type`.

### `POST /v1/verify-document`

Accepts one multipart `file` no larger than 8 MiB. Text-based PDFs and UTF-8 text files are supported. Scanned PDFs, OCR, image uploads, and news search are not implemented. Invalid PDFs, unreadable text, empty documents, and oversized uploads return explicit client errors.

The response is a `VerificationAssessment` containing a source digest, deterministic assessment hash, document classification and extracted claims, confidence, reasons, risk flags, and a decision. `auto_release_allowed` is always false and `requires_human_review` is always true.

## Modes

- `AI_MODE=mock` is deterministic and intended for local development and tests.
- `AI_MODE=live` calls the configured OpenAI-compatible service with structured output. Keep `OPENAI_API_KEY` and `OPENAI_API_BASE` on the Python service only.
- `AI_MODEL` selects the live model; `AI_REVIEW_MIN_CONFIDENCE` configures the review recommendation threshold between 0 and 1.

The Node oracle service stores assessments temporarily and requires explicit reviewer approval before an AI-assisted oracle trigger. The model does not prove identity, establish document authenticity, determine death, or cause a release by itself.

## Validation

```bash
python -m pytest -q
```

News RAG, source provenance, identity matching, duplicate detection, OCR, durable assessment storage, and authenticated reviewer accounts remain future work. Do not submit real evidence to this prototype.
