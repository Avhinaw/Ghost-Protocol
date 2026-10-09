import unittest

from fastapi.testclient import TestClient

from app import main
from app.verifier import EvidenceVerifier, VerifierSettings


class VerifyDocumentApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_verifier = main.verifier
        main.verifier = EvidenceVerifier(VerifierSettings(mode="mock"))
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        main.verifier = self.original_verifier

    def test_utf8_text_upload_returns_review_required_assessment(self) -> None:
        response = self.client.post(
            "/v1/verify-document",
            files={"file": ("evidence.txt", b"OFFICIAL DEATH CERTIFICATE. Issued by registrar.", "text/plain")},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["requires_human_review"])
        self.assertFalse(response.json()["auto_release_allowed"])

    def test_pdf_content_type_requires_a_pdf_file(self) -> None:
        response = self.client.post(
            "/v1/verify-document",
            files={"file": ("evidence.pdf", b"not a PDF document with enough content", "application/pdf")},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Uploaded file is not a valid PDF")

    def test_upload_size_limit_is_enforced(self) -> None:
        response = self.client.post(
            "/v1/verify-document",
            files={"file": ("large.txt", b"x" * (main.MAX_DOCUMENT_SIZE + 1), "text/plain")},
        )

        self.assertEqual(response.status_code, 413)

    def test_non_utf8_text_is_rejected(self) -> None:
        response = self.client.post(
            "/v1/verify-document",
            files={"file": ("evidence.txt", b"\xff" * 24, "text/plain")},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Document must be a UTF-8 text file or PDF")


if __name__ == "__main__":
    unittest.main()
