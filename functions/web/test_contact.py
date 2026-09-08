import unittest

from contact import list_messages, submit_message, validate_message


class FakeTable:
    def __init__(self):
        self.store = {}

    def put_item(self, Item):
        self.store[(Item["pk"], Item["sk"])] = dict(Item)

    def query(self, **kwargs):
        pk = kwargs["ExpressionAttributeValues"][":pk"]
        items = [dict(item) for (item_pk, _sk), item in self.store.items() if item_pk == pk]
        return {"Items": items}


class ContactTests(unittest.TestCase):
    def test_valid_message_is_stored(self):
        table = FakeTable()
        result = submit_message(
            table,
            {
                "name": "Ana Pérez",
                "email": "ana@example.com",
                "phone": "0412 9962303",
                "message": "Quisiera información sobre la Cámara.",
            },
        )
        self.assertTrue(result["ok"])
        listed = list_messages(table)
        self.assertEqual(listed["total"], 1)
        row = listed["messages"][0]
        self.assertEqual(row["name"], "Ana Pérez")
        self.assertEqual(row["email"], "ana@example.com")
        self.assertIn("Cámara", row["message"])

    def test_invalid_email_is_rejected(self):
        data, errors = validate_message(
            {"name": "Ana", "email": "no-es-correo", "message": "Necesito ayuda con un trámite."}
        )
        self.assertIn("email", errors)
        self.assertEqual(data["name"], "Ana")

    def test_honeypot_looks_successful(self):
        table = FakeTable()
        result = submit_message(
            table,
            {
                "name": "Bot",
                "email": "bot@example.com",
                "message": "Spam repetido para pasar el mínimo.",
                "website_url": "http://spam.example",
            },
        )
        self.assertTrue(result["ok"])
        self.assertEqual(list_messages(table)["total"], 0)

    def test_keeps_line_breaks_in_message(self):
        table = FakeTable()
        submit_message(
            table,
            {
                "name": "Luis",
                "email": "luis@example.com",
                "message": "Primera línea.\n\nSegunda línea.",
            },
        )
        self.assertEqual(list_messages(table)["messages"][0]["message"], "Primera línea.\n\nSegunda línea.")


if __name__ == "__main__":
    unittest.main()
