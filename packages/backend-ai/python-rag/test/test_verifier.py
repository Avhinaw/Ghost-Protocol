import unittest

from app.models import Decision
from app.verifier import EvidenceVerifier, VerifierSettings


SYNTHETIC_CERTIFICATE = """OFFICIAL DEATH CERTIFICATE
Subject: Jordan Example
Certificate Number: DC-2026-041
Issued by the Registrar of Vital Records.
This text is synthetic and used only for local testing.
"""


class VerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.verifier = EvidenceVerifier(VerifierSettings(mode="mock", min_confidence=0.8))

    def test_recognized_synthetic_certificate_requires_human_review(self) -> None:
        result = self.verifier.verify_text(SYNTHETIC_CERTIFICATE, "synthetic.txt")
        self.assertEqual(result.decision, Decision.HUMAN_REVIEW_REQUIRED)
        self.assertFalse(result.auto_release_allowed)
        self.assertTrue(result.requires_human_review)
        self.assertTrue(result.assessment_hash.startswith("0x"))

    def test_insufficient_text_never_recommends_a_release(self) -> None:
        result = self.verifier.verify_text("A person may be missing according to an unverified message.", "rumor.txt")
        self.assertEqual(result.decision, Decision.INSUFFICIENT_EVIDENCE)
        self.assertFalse(result.auto_release_allowed)
        self.assertTrue(result.requires_human_review)


if __name__ == "__main__":
    unittest.main()
