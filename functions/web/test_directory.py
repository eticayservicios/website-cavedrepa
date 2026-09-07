import unittest

from directory import (
    build_catalogs,
    items_for_company,
    matches_filters,
    normalize_listing,
    paginate,
    sort_companies,
)


SAMPLE = {
    "id": 297,
    "date": "2019-01-01 00:00:00",
    "modified": "2024-01-01 00:00:00",
    "status": "publish",
    "title": "Agritrader, S.A.",
    "slug": "agritrader",
    "content": "Distribuidor",
    "excerpt": "",
    "meta": {
        "_phone": "+58 255 0000000",
        "_address": "Guanare",
        "_website": "https://example.com",
        "874": "J-12345678-9",
        "875": "Ana Pérez",
        "_email": "info@example.com",
    },
    "tax": {
        "category": [{"name": "Sector Agrícola", "slug": "agricola"}],
        "location": [{"name": "Guanare -- Portuguesa", "slug": "guanare-portuguesa"}],
        "tags": [{"name": "Massey Ferguson", "slug": "massey-ferguson"}],
    },
    "image_url": "https://www.cavedrepa.org/logo.jpg",
}


class DirectoryTests(unittest.TestCase):
    def test_normalize_maps_directorist_fields(self):
        company = normalize_listing(SAMPLE)
        self.assertEqual(company["rif"], "J-12345678-9")
        self.assertEqual(company["legal_rep"], "Ana Pérez")
        self.assertEqual(company["locations"][0]["name"], "Guanare - Portuguesa")
        self.assertIn("massey ferguson", company["search"])
        self.assertTrue(matches_filters(company, {"q": "agritráder", "marca": "massey-ferguson"}))

    def test_pending_is_not_indexed_publicly(self):
        raw = dict(SAMPLE, status="pending", id=3354)
        items = items_for_company(normalize_listing(raw))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["pk"], "COMPANY#3354")

    def test_published_builds_browse_keys(self):
        items = items_for_company(normalize_listing(SAMPLE))
        pks = {item["pk"] for item in items}
        self.assertIn("STATUS#publish", pks)
        self.assertIn("SECTOR#agricola", pks)
        self.assertIn("LOCATION#guanare-portuguesa", pks)
        self.assertIn("BRAND#massey-ferguson", pks)
        catalogs = build_catalogs([normalize_listing(SAMPLE)])
        self.assertEqual(catalogs["brands"][0]["count"], 1)

    def test_sort_by_name_and_date(self):
        companies = [
            {"name": "Beta", "created_at": "2024-01-01 00:00:00"},
            {"name": "Álfa", "created_at": "2026-01-01 00:00:00"},
        ]
        sort_companies(companies, "nombre")
        self.assertEqual([item["name"] for item in companies], ["Álfa", "Beta"])
        sort_companies(companies, "fecha-desc")
        self.assertEqual(companies[0]["name"], "Álfa")

    def test_paginate_twenty_per_page(self):
        rows = [{"name": str(index)} for index in range(81)]
        page, meta = paginate(rows, 1, 20)
        self.assertEqual(len(page), 20)
        self.assertEqual(meta["pages"], 5)
        self.assertEqual(meta["total"], 81)
        last, last_meta = paginate(rows, 5, 20)
        self.assertEqual(len(last), 1)
        self.assertEqual(last_meta["page"], 5)


class ApplicationTests(unittest.TestCase):
    def test_valid_application_stays_pending(self):
        from applications import company_from_application, items_for_application, validate_application

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
                "brands": ["Honda", "Stihl"],
                "social": {"instagram": "@speedway"},
            }
        )
        self.assertEqual(errors, {})
        company = company_from_application(data)
        self.assertEqual(company["status"], "pending")
        self.assertEqual(company["source"], "application")
        self.assertEqual(company["locations"][0]["slug"], "valera-trujillo")
        self.assertEqual(company["brands"][0]["name"], "Honda")
        self.assertEqual(company["social"]["instagram"], "speedway")
        pks = {item["pk"] for item in items_for_application(company)}
        self.assertIn("APPLICATION#pending", pks)
        self.assertNotIn("STATUS#publish", pks)

    def test_missing_required_fields(self):
        from applications import validate_application

        _data, errors = validate_application({"name": "X"})
        self.assertIn("rif", errors)
        self.assertIn("email", errors)
        self.assertIn("sector", errors)
        self.assertIn("address", errors)
        self.assertIn("location", errors)

    def test_honeypot_is_rejected_as_spam(self):
        from applications import validate_application

        _data, errors = validate_application(
            {
                "name": "Bot C.A.",
                "rif": "J-1",
                "legal_rep": "Bot",
                "email": "bot@example.com",
                "phone": "1",
                "sector": "agricola",
                "website_url": "http://spam.example",
            }
        )
        self.assertIn("_honeypot", errors)


class BlogTests(unittest.TestCase):
    def test_published_post_is_indexed(self):
        from blog import items_for_post, normalize_post

        post = normalize_post(
            {
                "id": 3347,
                "slug": "editorial-agosto-2026",
                "status": "publish",
                "date": "2026-08-10T10:00:00",
                "title": "Editorial agosto 2026",
                "excerpt": "Resumen",
                "content": "<p>Texto de la editorial</p>",
                "categories": [{"name": "Editoriales", "slug": "editoriales"}],
                "image_url": "/images/blog/3347.jpg",
            }
        )
        items = items_for_post(post)
        pks = {item["pk"] for item in items}
        self.assertIn("BLOG#publish", pks)
        self.assertIn("SLUG#post#editorial-agosto-2026", pks)
        self.assertEqual(post["title"], "Editorial agosto 2026")

    def test_categories_list_years_first(self):
        from blog import blog_categories

        cats = blog_categories(
            [
                {"categories": [{"name": "2024", "slug": "2024"}, {"name": "Editoriales", "slug": "editoriales"}]},
                {"categories": [{"name": "2026", "slug": "2026"}]},
            ]
        )
        self.assertEqual([item["slug"] for item in cats[:2]], ["2026", "2024"])

    def test_trashed_slug_is_not_public(self):
        from blog import items_for_post, normalize_post

        post = normalize_post({"id": 1633, "slug": "__trashed", "title": "X", "status": "publish"})
        items = items_for_post(post)
        self.assertEqual([item["pk"] for item in items], ["POST#1633"])


if __name__ == "__main__":
    unittest.main()
