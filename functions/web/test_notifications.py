import os
import unittest
from unittest.mock import patch

import notifications


class NotificationTests(unittest.TestCase):
    def setUp(self):
        notifications._secret = None
        os.environ["REVIEW_ACTION_SECRET"] = "secreto-de-pruebas-muy-largo"
        os.environ["API_BASE_URL"] = "https://api.example.com/v1"

    def tearDown(self):
        notifications._secret = None
        os.environ.pop("REVIEW_ACTION_SECRET", None)
        os.environ.pop("API_BASE_URL", None)

    def test_signed_action_can_be_verified(self):
        token = notifications.sign_review_action(9001, "approve", now=100)
        action = notifications.verify_review_action(token, now=101)
        self.assertEqual(action["id"], 9001)
        self.assertEqual(action["action"], "approve")

    def test_tampered_and_expired_actions_are_rejected(self):
        token = notifications.sign_review_action(9001, "reject", now=100)
        self.assertIsNone(notifications.verify_review_action(token + "x", now=101))
        self.assertIsNone(
            notifications.verify_review_action(token, now=100 + notifications.ACTION_TTL + 1)
        )

    def test_email_contains_clear_actions_and_company_data(self):
        company = {
            "id": 9001,
            "name": "Speedway C.A.",
            "rif": "J-12345678-9",
            "email": "ana@example.com",
            "phone": "0212-1234567",
            "phone2": "0414-1234567",
            "fax": "0212-7654321",
            "legal_rep": "Ana Perez",
            "email2": "ventas@example.com",
            "website": "https://example.com",
            "address": "Av. Bolivar, edificio 2",
            "description": "Importacion de maquinaria agricola.",
            "sectors": [{"name": "Sector Agricola"}],
            "locations": [{"name": "Valera - Trujillo"}],
            "brands": [{"name": "Honda"}, {"name": "Yamaha"}],
            "social": {"instagram": "speedway"},
            "created_at": "2026-11-04 10:00:00",
            "expires_at": "2027-11-04",
        }
        subject, body = notifications.application_email(company)
        self.assertIn("Speedway C.A.", subject)
        self.assertIn("Aprobar afiliación", body)
        self.assertIn("Rechazar solicitud", body)
        self.assertIn("J-12345678-9", body)
        self.assertIn("Teléfono adicional", body)
        self.assertIn("ventas@example.com", body)
        self.assertIn("Importacion de maquinaria agricola.", body)
        self.assertIn("Honda, Yamaha", body)
        self.assertIn("speedway", body)
        self.assertEqual(body.count("/applications/review?token="), 2)

    @patch("notifications.boto3.client")
    def test_ses_message_has_html_and_plain_text(self, client):
        os.environ["NOTIFICATION_EMAIL"] = "cliente@example.com, soporte@example.com"
        os.environ["NOTIFICATION_FROM"] = "afiliaciones@example.com"
        os.environ["NOTIFICATION_FROM_NAME"] = "Cavedrepa"
        try:
            sent = notifications.send_application_notification(
                {"id": 9001, "name": "Speedway C.A.", "email": "ana@example.com"}
            )
        finally:
            os.environ.pop("NOTIFICATION_EMAIL", None)
            os.environ.pop("NOTIFICATION_FROM", None)
            os.environ.pop("NOTIFICATION_FROM_NAME", None)
        self.assertTrue(sent)
        message = client.return_value.send_email.call_args.kwargs
        self.assertEqual(
            message["Destination"]["ToAddresses"],
            ["cliente@example.com", "soporte@example.com"],
        )
        self.assertEqual(message["Source"], '"Cavedrepa" <afiliaciones@example.com>')
        self.assertIn("Html", message["Message"]["Body"])
        self.assertIn("Text", message["Message"]["Body"])


if __name__ == "__main__":
    unittest.main()
