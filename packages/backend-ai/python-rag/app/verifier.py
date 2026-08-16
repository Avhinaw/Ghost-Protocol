"""AI verifier that assesses evidence sufficiency but never makes a release decision."""
import hashlib
import json
import os
import re
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from .models import Decision, ModelAssessment, VerificationAssessment


ASSESSMENT_SCHEMA: dict[str, Any] = {
    "name": "ghost_protocol_evidence_assessment",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "is_valid_document": {"type": "boolean"},
            "document_type": {
                "type": "string",
                "enum": ["Death Certificate", "Police Report", "Court Order", "Unknown"],
            },
            "subject_name": {"type": "string"},
            "registration_hash": {"type": "string"},
            "confidence_score": {"type": "number", "minimum": 0, "maximum": 1},
            "summary": {"type": "string"},
            "reasons": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "risk_flags": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "recommend_emergency_review": {"type": "boolean"},
        },
        "required": [
            "is_valid_document",
            "document_type",
            "subject_name",
            "registration_hash",
            "confidence_score",
            "summary",
            "reasons",
            "risk_flags",
            "recommend_emergency_review",
        ],
        "additionalProperties": False,
    },
}


@dataclass(frozen=True)
class VerifierSettings:
    mode: str = os.getenv("AI_MODE", "mock").lower()
    model: str = os.getenv("AI_MODEL", "gemini-3-flash-preview")
    min_confidence: float = float(os.getenv("AI_REVIEW_MIN_CONFIDENCE", "0.80"))

    def __post_init__(self) -> None:
        if self.mode not in {"mock", "live"}:
            raise ValueError("AI_MODE must be mock or live")
        if not 0 <= self.min_confidence <= 1:
            raise ValueError("AI_REVIEW_MIN_CONFIDENCE must be between 0 and 1")


def sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class EvidenceVerifier:
    def __init__(self, settings: VerifierSettings | None = None, client: OpenAI | None = None):
        self.settings = settings or VerifierSettings()
        self.client = client

    def verify_text(self, document_text: str, source_name: str, declared_document_type: str = "Unknown") -> VerificationAssessment:
        normalized = " ".join(document_text.split())
        source_digest = sha256_hex(normalized.encode("utf-8"))
        model_result = self._mock_assessment(normalized, declared_document_type) if self.settings.mode == "mock" else self._live_assessment(normalized, declared_document_type)

        decision = (
            Decision.HUMAN_REVIEW_REQUIRED
            if model_result.is_valid_document
            and model_result.recommend_emergency_review
            and model_result.confidence_score >= self.settings.min_confidence
            else Decision.INSUFFICIENT_EVIDENCE
        )
        payload = {
            "source_digest": source_digest,
            "mode": self.settings.mode,
            "model": self.settings.model if self.settings.mode == "live" else "deterministic-local-fallback",
            "decision": decision.value,
            "auto_release_allowed": False,
            "requires_human_review": True,
            **model_result.model_dump(),
        }
        assessment_hash = "0x" + sha256_hex(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        return VerificationAssessment(assessment_hash=assessment_hash, **payload)

    def _mock_assessment(self, text: str, declared_document_type: str) -> ModelAssessment:
        lower = text.lower()
        document_type = "Unknown"
        if "death certificate" in lower:
            document_type = "Death Certificate"
        elif "police" in lower or "fir" in lower:
            document_type = "Police Report"
        elif "court" in lower or "order" in lower:
            document_type = "Court Order"

        subject_match = re.search(r"(?:subject|name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,80})", text, re.I)
        registration_match = re.search(r"(?:registration|certificate|case)\s*(?:id|number|no\.?|#)?\s*[:\-]\s*([A-Za-z0-9/-]{4,80})", text, re.I)
        has_official_markers = any(token in lower for token in ("official", "issued", "registrar", "case number", "certificate"))
        valid = document_type != "Unknown" and has_official_markers
        confidence = 0.91 if valid else 0.34
        return ModelAssessment(
            is_valid_document=valid,
            document_type=document_type,
            subject_name=subject_match.group(1).strip() if subject_match else "Unknown",
            registration_hash=registration_match.group(1) if registration_match else "",
            confidence_score=confidence,
            summary="Synthetic local assessment only. A human reviewer must independently validate all claims before any oracle action.",
            reasons=["Recognized document markers" if valid else "Missing sufficient official document markers"],
            risk_flags=["LOCAL_MOCK_MODE", "HUMAN_REVIEW_REQUIRED"],
            recommend_emergency_review=valid,
        )

    def _live_assessment(self, text: str, declared_document_type: str) -> ModelAssessment:
        client = self.client or OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_API_BASE"),
        )
        system_prompt = """You assess submitted emergency evidence for Ghost Protocol. Extract visible claims cautiously.
You are NOT an authority and must never authorize an automatic release, assert a death as fact, or infer identity beyond supplied evidence.
Recommend only whether the evidence merits HUMAN review. Missing, inconsistent, or low-quality material must receive a low confidence score and clear risk flags.
Return JSON matching the schema exactly."""
        user_prompt = f"""Declared type: {declared_document_type}\nSource text follows:\n---\n{text}\n---\nAssess evidence sufficiency only."""
        response = client.chat.completions.create(
            model=self.settings.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1400,
            response_format={"type": "json_schema", "json_schema": ASSESSMENT_SCHEMA},
        )
        raw = response.choices[0].message.content
        if not raw:
            raise RuntimeError("AI verifier returned no structured assessment")
        return ModelAssessment.model_validate_json(raw)
