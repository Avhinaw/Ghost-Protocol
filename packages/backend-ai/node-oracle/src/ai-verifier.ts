import { z } from "zod";

export const aiAssessmentSchema = z.object({
  assessment_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  source_digest: z.string().regex(/^[a-fA-F0-9]{64}$/),
  mode: z.enum(["mock", "live"]),
  model: z.string().min(1),
  decision: z.enum(["HUMAN_REVIEW_REQUIRED", "INSUFFICIENT_EVIDENCE", "REJECTED"]),
  auto_release_allowed: z.literal(false),
  requires_human_review: z.literal(true),
  is_valid_document: z.boolean(),
  document_type: z.string().min(1),
  subject_name: z.string(),
  registration_hash: z.string(),
  confidence_score: z.number().min(0).max(1),
  summary: z.string().min(1),
  reasons: z.array(z.string()),
  risk_flags: z.array(z.string()),
});

export type AiAssessment = z.infer<typeof aiAssessmentSchema>;

export type VerifyTextInput = {
  documentText: string;
  sourceName: string;
  declaredDocumentType?: string;
};

export type VerifyDocumentInput = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
};

export interface AiVerifier {
  verifyText(input: VerifyTextInput): Promise<AiAssessment>;
  verifyDocument(input: VerifyDocumentInput): Promise<AiAssessment>;
}

export class HttpAiVerifierClient implements AiVerifier {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 15_000) {}

  async verifyText(input: VerifyTextInput): Promise<AiAssessment> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/verify-text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document_text: input.documentText,
        source_name: input.sourceName,
        declared_document_type: input.declaredDocumentType ?? "Unknown",
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`AI verifier rejected the assessment request: ${body.detail ?? body.error ?? response.status}`);
    }
    return aiAssessmentSchema.parse(body);
  }

  async verifyDocument(input: VerifyDocumentInput): Promise<AiAssessment> {
    const form = new FormData();
    const ownedBytes = Uint8Array.from(input.bytes);
    form.append("file", new Blob([ownedBytes.buffer], { type: input.contentType }), input.fileName);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/verify-document`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`AI verifier rejected the document: ${body.detail ?? body.error ?? response.status}`);
    }
    return aiAssessmentSchema.parse(body);
  }
}
