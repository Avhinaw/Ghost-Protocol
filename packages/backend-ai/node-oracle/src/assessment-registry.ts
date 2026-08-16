import type { AiAssessment } from "./ai-verifier.js";

type StoredAssessment = { assessment: AiAssessment; createdAt: number; expiresAt: number };

/**
 * A deliberately narrow, in-memory review queue for the prototype.
 * Production must replace this with durable encrypted storage and authenticated reviewer audit logs.
 */
export class AssessmentRegistry {
  private readonly records = new Map<string, StoredAssessment>();

  constructor(private readonly ttlMs = 15 * 60 * 1000) {}

  store(assessment: AiAssessment): AiAssessment {
    const now = Date.now();
    this.records.set(assessment.assessment_hash, { assessment, createdAt: now, expiresAt: now + this.ttlMs });
    return assessment;
  }

  get(assessmentHash: string): AiAssessment | undefined {
    const record = this.records.get(assessmentHash);
    if (!record) return undefined;
    if (record.expiresAt < Date.now()) {
      this.records.delete(assessmentHash);
      return undefined;
    }
    return record.assessment;
  }
}
