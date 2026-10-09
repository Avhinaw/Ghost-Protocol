"""FastAPI boundary for Ghost Protocol AI verification."""
import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError

from .models import HealthResponse, VerificationAssessment, VerifyTextRequest
from .verifier import EvidenceVerifier, VerifierSettings


settings = VerifierSettings()
verifier = EvidenceVerifier(settings)
app = FastAPI(title="Ghost Protocol AI Verifier", version="0.1.0")
MAX_DOCUMENT_SIZE = 8 * 1024 * 1024


def extract_pdf_text(contents: bytes) -> str:
    reader = PdfReader(io.BytesIO(contents), strict=True)
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", mode=settings.mode, model=settings.model)


@app.post("/v1/verify-text", response_model=VerificationAssessment)
def verify_text(request: VerifyTextRequest) -> VerificationAssessment:
    return verifier.verify_text(request.document_text, request.source_name, request.declared_document_type)


@app.post("/v1/verify-document", response_model=VerificationAssessment)
async def verify_document(file: UploadFile = File(...)) -> VerificationAssessment:
    try:
        contents = await file.read(MAX_DOCUMENT_SIZE + 1)
        if len(contents) > MAX_DOCUMENT_SIZE:
            raise HTTPException(status_code=413, detail="Document exceeds 8MB limit")

        filename = file.filename or "submitted-document"
        is_pdf = file.content_type == "application/pdf" or filename.lower().endswith(".pdf")
        if is_pdf:
            if not contents.startswith(b"%PDF-"):
                raise HTTPException(status_code=422, detail="Uploaded file is not a valid PDF")
            try:
                text = extract_pdf_text(contents)
            except (PdfReadError, PdfStreamError, EOFError, ValueError) as error:
                raise HTTPException(status_code=422, detail="Could not read the uploaded PDF") from error
        else:
            try:
                text = contents.decode("utf-8").strip()
            except UnicodeDecodeError as error:
                raise HTTPException(status_code=422, detail="Document must be a UTF-8 text file or PDF") from error

        if len(text) < 20:
            raise HTTPException(status_code=422, detail="No extractable text found; submit a text-based PDF or provide a transcription")
        return verifier.verify_text(text, filename)
    finally:
        await file.close()
