# 🧠 Specification 04: Python AI & RAG Verification Engine

**Target Sub-Package:** `packages/backend-ai/python-rag`  
**Stack:** Python 3.11, FastAPI, LangChain, OpenAI GPT-4o, FAISS  

---

## 1. Microservice Endpoints

### `POST /v1/verify-document`
Accepts an official legal document PDF (Death Certificate, Police FIR, Court Order) and evaluates authenticity.

* **Request:** `multipart/form-data` with `file: UploadFile`.
* **Response Model (Pydantic):**
```python
class DocumentVerificationResult(BaseModel):
    is_valid_document: bool
    document_type: str  # "Death Certificate", "Police Report", "Court Order", "Unknown"
    subject_name: str
    registration_hash: str
    confidence_score: float  # Range: 0.0 - 1.0
    summary: str