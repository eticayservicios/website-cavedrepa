"""Directorio de afiliados: modelo DynamoDB y consultas por sector, ubicación y marca."""

from __future__ import annotations

import html
import unicodedata
from decimal import Decimal
from typing import Any

SITE_ORIGIN = "https://cavedrepa.smartravelevents.com"
PUBLIC_STATUSES = {"publish"}
CARD_FIELDS = (
    "id",
    "slug",
    "name",
    "tagline",
    "excerpt",
    "phone",
    "website",
    "address",
    "image_url",
    "sectors",
    "locations",
    "brands",
    "rif",
    "status",
)


def fold(value: str | None) -> str:
    text = html.unescape(value or "").lower().strip()
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return ""
    return html.unescape(str(value)).replace("\xa0", " ").strip()


def terms(items: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    result = []
    seen: set[str] = set()
    for item in items or []:
        slug = clean(item.get("slug")).lower()
        name = clean(item.get("name")).replace(" -- ", " - ")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        result.append({"name": name, "slug": slug})
    return result


def first_meta(meta: dict[str, Any], *keys: str) -> str:
    for key in keys:
        if key in meta and meta[key] not in (None, "", [], {}):
            return clean(meta[key])
        as_int = None
        if key.isdigit():
            as_int = int(key)
        if as_int is not None and as_int in meta and meta[as_int] not in (None, "", [], {}):
            return clean(meta[as_int])
    return ""


def search_blob(company: dict[str, Any]) -> str:
    parts = [
        company.get("name"),
        company.get("tagline"),
        company.get("excerpt"),
        company.get("address"),
        company.get("rif"),
        company.get("slug"),
    ]
    for group in ("sectors", "locations", "brands"):
        for item in company.get(group) or []:
            parts.append(item.get("name"))
            parts.append(item.get("slug"))
    return fold(" ".join(part for part in parts if part))


def normalize_listing(raw: dict[str, Any]) -> dict[str, Any]:
    meta = raw.get("meta") or {}
    tax = raw.get("tax") or {}
    company = {
        "id": int(raw["id"]),
        "slug": clean(raw.get("slug")).lower(),
        "name": clean(raw.get("title")),
        "status": clean(raw.get("status")) or "draft",
        "description": raw.get("content") or "",
        "excerpt": first_meta(meta, "_excerpt") or clean(raw.get("excerpt")),
        "tagline": first_meta(meta, "_tagline"),
        "phone": first_meta(meta, "_phone"),
        "phone2": first_meta(meta, "_phone2"),
        "fax": first_meta(meta, "_fax"),
        "email": first_meta(meta, "_email", "876", "_876"),
        "email2": first_meta(meta, "877", "_877"),
        "website": first_meta(meta, "_website"),
        "address": first_meta(meta, "_address"),
        "zip": first_meta(meta, "_zip"),
        "rif": first_meta(meta, "874", "_874"),
        "legal_rep": first_meta(meta, "875", "_875"),
        "lat": first_meta(meta, "_manual_lat"),
        "lng": first_meta(meta, "_manual_lng"),
        "video_url": first_meta(meta, "_videourl"),
        "featured": first_meta(meta, "_featured") in {"1", "yes", "true"},
        "image_url": clean(raw.get("image_url")),
        "sectors": terms(tax.get("category")),
        "locations": terms(tax.get("location")),
        "brands": terms(tax.get("tags")),
        "created_at": raw.get("date") or "",
        "updated_at": raw.get("modified") or "",
        "source": "directorist",
    }
    company["search"] = search_blob(company)
    return company


def card(company: dict[str, Any]) -> dict[str, Any]:
    return {field: company.get(field) for field in CARD_FIELDS}


def build_catalogs(companies: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    buckets = {"sectors": {}, "locations": {}, "brands": {}}
    keys = {"sectors": "sectors", "locations": "locations", "brands": "brands"}
    for company in companies:
        public = company.get("status") in PUBLIC_STATUSES
        for bucket, field in keys.items():
            for item in company.get(field) or []:
                slug = item["slug"]
                current = buckets[bucket].setdefault(
                    slug, {"name": item["name"], "slug": slug, "count": 0}
                )
                if public:
                    current["count"] += 1
    catalogs = {}
    for bucket, items in buckets.items():
        catalogs[bucket] = sorted(
            items.values(),
            key=lambda item: (-item["count"], fold(item["name"])),
        )
    return catalogs


def dynamodb_safe(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: dynamodb_safe(item) for key, item in value.items() if item not in ("", None)}
    if isinstance(value, list):
        return [dynamodb_safe(item) for item in value]
    return value


def items_for_company(company: dict[str, Any]) -> list[dict[str, Any]]:
    company_id = company["id"]
    profile = {
        "pk": f"COMPANY#{company_id}",
        "sk": "PROFILE",
        "entity": "company",
        **company,
    }
    items = [profile]
    if company["status"] not in PUBLIC_STATUSES:
        return [dynamodb_safe(item) for item in items]

    summary = {
        "entity": "company_card",
        "search": company["search"],
        **card(company),
    }
    items.append({"pk": "STATUS#publish", "sk": f"COMPANY#{company_id}", **summary})
    if company.get("slug"):
        items.append(
            {
                "pk": f"SLUG#{company['slug']}",
                "sk": "COMPANY",
                "id": company_id,
                "slug": company["slug"],
            }
        )
    for sector in company["sectors"]:
        items.append({"pk": f"SECTOR#{sector['slug']}", "sk": f"COMPANY#{company_id}", **summary})
    for location in company["locations"]:
        items.append(
            {"pk": f"LOCATION#{location['slug']}", "sk": f"COMPANY#{company_id}", **summary}
        )
    for brand in company["brands"]:
        items.append({"pk": f"BRAND#{brand['slug']}", "sk": f"COMPANY#{company_id}", **summary})
    return [dynamodb_safe(item) for item in items]


def catalog_items(catalogs: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    return [
        dynamodb_safe({"pk": "CATALOG", "sk": "SECTORS", "items": catalogs["sectors"]}),
        dynamodb_safe({"pk": "CATALOG", "sk": "LOCATIONS", "items": catalogs["locations"]}),
        dynamodb_safe({"pk": "CATALOG", "sk": "BRANDS", "items": catalogs["brands"]}),
    ]


def matches_filters(company: dict[str, Any], filters: dict[str, str]) -> bool:
    query = fold(filters.get("q"))
    if query and query not in (company.get("search") or ""):
        return False
    sector = clean(filters.get("sector")).lower()
    if sector and sector not in {item["slug"] for item in company.get("sectors") or []}:
        return False
    location = clean(filters.get("ubicacion") or filters.get("location")).lower()
    if location and location not in {item["slug"] for item in company.get("locations") or []}:
        return False
    brand = clean(filters.get("marca") or filters.get("brand")).lower()
    if brand and brand not in {item["slug"] for item in company.get("brands") or []}:
        return False
    return True


def query_pk(table, pk: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    kwargs = {
        "KeyConditionExpression": "pk = :pk",
        "ExpressionAttributeValues": {":pk": pk},
    }
    while True:
        response = table.query(**kwargs)
        items.extend(response.get("Items") or [])
        last = response.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def get_item(table, pk: str, sk: str) -> dict[str, Any] | None:
    response = table.get_item(Key={"pk": pk, "sk": sk})
    return response.get("Item")


def public_card(item: dict[str, Any]) -> dict[str, Any]:
    return {field: item.get(field) for field in CARD_FIELDS if field in item or field in CARD_FIELDS}


def search_directory(table, filters: dict[str, str]) -> dict[str, Any]:
    brand = clean(filters.get("marca") or filters.get("brand")).lower()
    location = clean(filters.get("ubicacion") or filters.get("location")).lower()
    sector = clean(filters.get("sector")).lower()

    if brand:
        rows = query_pk(table, f"BRAND#{brand}")
    elif location:
        rows = query_pk(table, f"LOCATION#{location}")
    elif sector:
        rows = query_pk(table, f"SECTOR#{sector}")
    else:
        rows = query_pk(table, "STATUS#publish")

    companies = []
    seen: set[int] = set()
    for row in rows:
        company_id = int(row.get("id") or 0)
        if not company_id or company_id in seen:
            continue
        if not matches_filters(row, filters):
            continue
        seen.add(company_id)
        companies.append(public_card(row))

    companies.sort(key=lambda item: fold(item.get("name") or ""))
    return {
        "ok": True,
        "total": len(companies),
        "filters": {
            "q": clean(filters.get("q")),
            "sector": sector,
            "ubicacion": location,
            "marca": brand,
        },
        "companies": companies,
    }


def get_catalogs(table) -> dict[str, Any]:
    catalogs = {"sectors": [], "locations": [], "brands": []}
    mapping = {"SECTORS": "sectors", "LOCATIONS": "locations", "BRANDS": "brands"}
    for sk, key in mapping.items():
        item = get_item(table, "CATALOG", sk)
        if item and item.get("items"):
            catalogs[key] = item["items"]
    return {"ok": True, **catalogs}


def get_company(table, key: str) -> dict[str, Any] | None:
    raw = clean(key)
    if not raw:
        return None
    if raw.isdigit():
        item = get_item(table, f"COMPANY#{int(raw)}", "PROFILE")
    else:
        pointer = get_item(table, f"SLUG#{raw.lower()}", "COMPANY")
        if not pointer:
            return None
        item = get_item(table, f"COMPANY#{int(pointer['id'])}", "PROFILE")
    if not item or item.get("status") not in PUBLIC_STATUSES:
        return None
    detail = {**card(item)}
    detail.update(
        {
            "description": item.get("description") or "",
            "phone2": item.get("phone2") or "",
            "fax": item.get("fax") or "",
            "email": item.get("email") or "",
            "email2": item.get("email2") or "",
            "legal_rep": item.get("legal_rep") or "",
            "zip": item.get("zip") or "",
            "lat": item.get("lat") or "",
            "lng": item.get("lng") or "",
            "video_url": item.get("video_url") or "",
        }
    )
    return detail
