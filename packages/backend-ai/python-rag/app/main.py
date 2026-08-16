"""FastAPI boundary for Ghost Protocol AI verification."""
import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from pypdf import PdfReader

from .models import HealthResponse, VerificationAssessment, VerifyTextRequest
from .verifier import EvidenceVerifier, VerifierSettings


settings = VerifierSettings()
verifier = EvidenceVerifier(settings)
app = FastAPI(title="Ghost Protocol AI Verifier", version="0.1.0")


def extract_pdf_text(contents: bytes) -> str:
    reader = PdfReader(io.BytesIO(contents))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", mode=settings.mode, model=settings.model)


@app.post("/v1/verify-text", response_model=VerificationAssessment)
def verify_text(request: VerifyTextRequest) -> VerificationAssessment:
    return verifier.verify_text(request.document_text, request.source_name, request.declared_document_type)


@app.post("/v1/verify-document", response_model=VerificationAssessment)
async def verify_document(file: UploadFile = File(...)) -> VerificationAssessment:
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Document exceeds 8MB limit")
    if file.content_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
        text = extract_pdf_text(contents)
    else:
        text = contents.decode("utf-8", errors="ignore").strip()
    if len(text) < 20:
        raise HTTPException(status_code=422, detail="No extractable text found; submit a text-based PDF or provide a transcription")
    return verifier.verify_text(text, file.filename or "submitted-document")
