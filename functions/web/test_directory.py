import unittest

from directory import (
    build_catalogs,
    items_for_company,
    matches_filters,
    normalize_listing,
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


if __name__ == "__main__":
    unittest.main()
