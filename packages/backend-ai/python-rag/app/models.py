"""Strict response models for an auditable, human-reviewed emergency assessment."""
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Decision(str, Enum):
    HUMAN_REVIEW_REQUIRED = "HUMAN_REVIEW_REQUIRED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    REJECTED = "REJECTED"


class VerifyTextRequest(BaseModel):
    document_text: str = Field(min_length=20, max_length=20_000)
    source_name: str = Field(default="submitted-evidence", min_length=1, max_length=180)
    declared_document_type: str = Field(default="Unknown", max_length=80)


class ModelAssessment(BaseModel):
    is_valid_document: bool
    document_type: Literal["Death Certificate", "Police Report", "Court Order", "Unknown"]
    subject_name: str = Field(default="Unknown")
    registration_hash: str = Field(default="")
    confidence_score: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=1, max_length=1_200)
    reasons: list[str] = Field(max_length=8)
    risk_flags: list[str] = Field(max_length=8)
    recommend_emergency_review: bool


class VerificationAssessment(BaseModel):
    assessment_hash: str = Field(pattern=r"^0x[a-fA-F0-9]{64}$")
    source_digest: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    mode: Literal["mock", "live"]
    model: str
    decision: Decision
    auto_release_allowed: Literal[False] = False
    requires_human_review: Literal[True] = True
    is_valid_document: bool
    document_type: str
    subject_name: str
    registration_hash: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    summary: str
    reasons: list[str]
    risk_flags: list[str]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    mode: Literal["mock", "live"]
    model: str
    automatic_release: Literal[False] = False
