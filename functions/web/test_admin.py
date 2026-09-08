import os
import unittest

from admin import (
    approve_application,
    create_user,
    delete_user,
    list_applications,
    list_companies,
    list_users,
    login,
    read_token,
    reject_application,
    reset_credentials_cache,
    sign_token,
)
from applications import company_from_application, items_for_application, validate_application
from directory import get_item, items_for_company, normalize_listing


class FakeTable:
    def __init__(self, items=None):
        self.store = {}
        for item in items or []:
            self.put_item(Item=item)

    def put_item(self, Item):
        self.store[(Item["pk"], Item["sk"])] = dict(Item)

    def delete_item(self, Key):
        self.store.pop((Key["pk"], Key["sk"]), None)

    def get_item(self, Key):
        item = self.store.get((Key["pk"], Key["sk"]))
        return {"Item": dict(item)} if item else {}

    def query(self, **kwargs):
        pk = kwargs["ExpressionAttributeValues"][":pk"]
        items = [dict(item) for (item_pk, _sk), item in self.store.items() if item_pk == pk]
        return {"Items": items}

    def scan(self, **kwargs):
        values = kwargs.get("ExpressionAttributeValues") or {}
        wanted_sk = values.get(":sk")
        items = []
        for item in self.store.values():
            if wanted_sk is not None and item.get("sk") != wanted_sk:
                continue
            items.append(dict(item))
        return {"Items": items}

    def batch_writer(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def sample_application():
    data, errors = validate_application(
        {
            "name": "Speedway C.A.",
            "rif": "J-12345678-9",
            "legal_rep": "Ana Pérez",
            "email": "ana@example.com",
            "phone": "02121234567",
            "sector": "agricola",
            "location": "valera-trujillo",
            "location_name": "Valera - Trujillo",
            "address": "Av. Bolívar, Valera",
            "brands": ["Honda"],
        }
    )
    assert errors == {}
    company = company_from_application(data)
    company["id"] = 9001
    company["slug"] = "speedway-009001"
    return company


class AdminAuthTests(unittest.TestCase):
    def setUp(self):
        reset_credentials_cache()
        os.environ["ADMIN_USER"] = "cavedrepa"
        os.environ["ADMIN_PASSWORD"] = "clave-secreta"
        os.environ.pop("ADMIN_SECRET_ARN", None)

    def tearDown(self):
        reset_credentials_cache()
        os.environ.pop("ADMIN_USER", None)
        os.environ.pop("ADMIN_PASSWORD", None)

    def test_login_issues_token(self):
        result = login(FakeTable(), {"user": "cavedrepa", "password": "clave-secreta"})
        self.assertTrue(result["ok"])
        session = read_token(f"Bearer {result['token']}")
        self.assertEqual(session["user"], "cavedrepa")

    def test_wrong_password_is_rejected(self):
        table = FakeTable()
        login(table, {"user": "cavedrepa", "password": "clave-secreta"})
        result = login(table, {"user": "cavedrepa", "password": "otra"})
        self.assertFalse(result["ok"])
        self.assertIsNone(read_token(sign_token("cavedrepa")[:-2] + "xx"))

    def test_several_users_can_sign_in(self):
        table = FakeTable()
        login(table, {"user": "cavedrepa", "password": "clave-secreta"})
        created = create_user(
            table, {"username": "maria", "password": "maria-1234", "name": "María"}
        )
        self.assertTrue(created["ok"])
        other = login(table, {"user": "maria", "password": "maria-1234"})
        self.assertTrue(other["ok"])
        self.assertEqual(other["name"], "María")
        self.assertEqual(len(list_users(table)["users"]), 2)
        blocked = delete_user(table, "maria", "maria")
        self.assertFalse(blocked["ok"])
        self.assertTrue(delete_user(table, "maria", "cavedrepa")["ok"])
        self.assertEqual(len(list_users(table)["users"]), 1)


class AdminQueueTests(unittest.TestCase):
    def test_approve_publishes_and_leaves_the_queue(self):
        company = sample_application()
        table = FakeTable(items_for_application(company))
        listed = list_applications(table)
        self.assertEqual(listed["total"], 1)
        result = approve_application(table, "9001")
        self.assertEqual(result["status"], "publish")
        profile = get_item(table, "COMPANY#9001", "PROFILE")
        self.assertEqual(profile["status"], "publish")
        self.assertTrue(get_item(table, "STATUS#publish", "COMPANY#9001"))
        self.assertFalse(get_item(table, "APPLICATION#pending", "APPLICATION#9001"))
        self.assertEqual(list_applications(table)["total"], 0)
        catalogs = get_item(table, "CATALOG", "SECTORS")
        agricola = next(item for item in catalogs["items"] if item["slug"] == "agricola")
        self.assertEqual(agricola["count"], 1)

    def test_reject_stays_out_of_the_directory(self):
        company = sample_application()
        table = FakeTable(items_for_application(company))
        result = reject_application(table, "9001", "Datos incompletos")
        self.assertEqual(result["status"], "rejected")
        profile = get_item(table, "COMPANY#9001", "PROFILE")
        self.assertEqual(profile["status"], "rejected")
        self.assertEqual(profile["reject_reason"], "Datos incompletos")
        self.assertFalse(get_item(table, "STATUS#publish", "COMPANY#9001"))
        self.assertEqual(list_applications(table)["total"], 0)

    def test_directorist_pending_listing_is_in_admin_queue(self):
        pending = normalize_listing(
            {
                "id": 3354,
                "status": "pending",
                "title": "Speedway C.A.",
                "slug": "speedway",
                "date": "2026-03-01 10:00:00",
                "tax": {
                    "category": [{"name": "Sector Agrícola", "slug": "agricola"}],
                    "location": [],
                    "tags": [],
                },
            }
        )
        table = FakeTable(items_for_company(pending))
        listed = list_applications(table)
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["applications"][0]["name"], "Speedway C.A.")

    def test_published_company_is_not_in_admin_queue(self):
        published = normalize_listing(
            {
                "id": 297,
                "status": "publish",
                "title": "Agritrader, S.A.",
                "slug": "agritrader",
                "tax": {
                    "category": [{"name": "Sector Agrícola", "slug": "agricola"}],
                    "location": [{"name": "Guanare", "slug": "guanare-portuguesa"}],
                    "tags": [],
                },
            }
        )
        table = FakeTable(items_for_company(published))
        self.assertEqual(list_applications(table)["total"], 0)

    def test_list_companies_includes_every_status(self):
        pending = sample_application()
        published = normalize_listing(
            {
                "id": 297,
                "status": "publish",
                "title": "Agritrader, S.A.",
                "slug": "agritrader",
                "date": "2019-11-16 19:05:48",
                "tax": {"category": [], "location": [], "tags": []},
            }
        )
        expired = normalize_listing(
            {
                "id": 1996,
                "status": "expired",
                "title": "Todo Tractor, C.A.",
                "slug": "todo-tractor",
                "date": "2020-01-01 00:00:00",
                "tax": {"category": [], "location": [], "tags": []},
            }
        )
        table = FakeTable(
            items_for_application(pending)
            + items_for_company(published)
            + items_for_company(expired)
        )
        listed = list_companies(table)
        self.assertEqual(listed["total"], 3)
        self.assertEqual(listed["counts"]["pending"], 1)
        self.assertEqual(listed["counts"]["publish"], 1)
        self.assertEqual(listed["counts"]["expired"], 1)
        expired_only = list_companies(table, {"status": "expired"})
        self.assertEqual(expired_only["total"], 1)
        self.assertEqual(expired_only["companies"][0]["name"], "Todo Tractor, C.A.")
        found = list_companies(table, {"q": "agritrader"})
        self.assertEqual(found["total"], 1)
        self.assertEqual(found["companies"][0]["id"], 297)


if __name__ == "__main__":
    unittest.main()
