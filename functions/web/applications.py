"""Solicitudes de afiliación: validación y escritura en DynamoDB."""

from __future__ import annotations

import base64
import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import boto3

from directory import fold, items_for_company, search_blob

SECTORS = {
    "agricola": "Sector Agrícola",
    "construccion": "Sector Construcción",
    "acuicola": "Sector Acuícola",
}

SOCIAL_KEYS = ("facebook", "instagram", "linkedin", "youtube", "twitter")

LIMITS = {
    "name": 180,
    "rif": 32,
    "legal_rep": 160,
    "phone": 40,
    "phone2": 40,
    "fax": 40,
    "email": 160,
    "email2": 160,
    "website": 200,
    "address": 400,
    "location": 120,
    "location_name": 120,
    "brands": 800,
    "description": 4000,
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATA_URL_RE = re.compile(r"^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$", re.I)
MAX_LOGO_BYTES = 700_000


def clean_text(value: Any, limit: int) -> str:
    text = str(value or "").replace("\x00", "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")
    return slug or "empresa"


def terms_from_text(value: str) -> list[dict[str, str]]:
    items = []
    seen: set[str] = set()
    for part in re.split(r"[,;/|]+", value):
        name = clean_text(part, 80)
        slug = slugify(name)
        if not name or slug in seen:
            continue
        seen.add(slug)
        items.append({"name": name, "slug": slug})
    return items


def terms_from_value(value: Any) -> list[dict[str, str]]:
    if isinstance(value, list):
        return terms_from_text(", ".join(str(item) for item in value if item))
    if isinstance(value, dict):
        name = clean_text(value.get("name"), 80)
        slug = clean_text(value.get("slug"), 80).lower() or slugify(name)
        return [{"name": name, "slug": slug}] if name and slug else []
    return terms_from_text(str(value or ""))


SOCIAL_PATH = {
    "facebook": re.compile(r"(?:https?://)?(?:www\.)?(?:facebook|fb)\.com/(.+)", re.I),
    "instagram": re.compile(r"(?:https?://)?(?:www\.)?instagram\.com/(.+)", re.I),
    "linkedin": re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/(?:in|company)/(.+)", re.I),
    "youtube": re.compile(r"(?:https?://)?(?:www\.)?(?:youtube\.com/(?:@|channel/|c/)|youtu\.be/)(.+)", re.I),
    "twitter": re.compile(r"(?:https?://)?(?:www\.)?(?:twitter|x)\.com/(.+)", re.I),
}


def social_handle(key: str, value: Any) -> str:
    text = clean_text(value, 200)
    if not text:
        return ""
    pattern = SOCIAL_PATH.get(key)
    if pattern:
        match = pattern.match(text)
        if match:
            text = match.group(1)
    text = text.split("?")[0].split("#")[0].strip("/")
    if "/" in text:
        text = text.split("/")[-1]
    return text.lstrip("@")[:80]


def clean_social(payload: dict[str, Any]) -> dict[str, str]:
    raw = payload.get("social")
    if not isinstance(raw, dict):
        raw = {key: payload.get(key) for key in SOCIAL_KEYS}
    social = {}
    for key in SOCIAL_KEYS:
        handle = social_handle(key, raw.get(key))
        if handle:
            social[key] = handle
    return social


def parse_location(payload: dict[str, Any], data: dict[str, str]) -> list[dict[str, str]]:
    slug = clean_text(payload.get("location") or data.get("location"), 80).lower()
    name = clean_text(payload.get("location_name") or data.get("location_name"), 120)
    if not slug and name:
        slug = slugify(name)
    if slug and not name:
        name = slug.replace("-", " ").title()
    if not slug:
        return []
    return [{"name": name, "slug": slug}]


def validate_application(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    data: dict[str, Any] = {key: clean_text(payload.get(key), limit) for key, limit in LIMITS.items()}
    errors: dict[str, str] = {}

    if not data["name"]:
        errors["name"] = "Indica el nombre de la empresa."
    if not data["rif"]:
        errors["rif"] = "Indica el RIF."
    if not data["legal_rep"]:
        errors["legal_rep"] = "Indica el representante legal."
    if not data["email"] or not EMAIL_RE.match(data["email"]):
        errors["email"] = "Indica un correo válido."
    if data["email2"] and not EMAIL_RE.match(data["email2"]):
        errors["email2"] = "El segundo correo no es válido."
    if not data["phone"]:
        errors["phone"] = "Indica un teléfono."
    if not data["address"]:
        errors["address"] = "Indica la dirección de la empresa."

    sector = clean_text(payload.get("sector"), 40).lower()
    if sector not in SECTORS:
        errors["sector"] = "Elige un sector."
    else:
        data["sector"] = sector

    data["locations"] = parse_location(payload, data)
    if not data["locations"]:
        errors["location"] = "Elige una ubicación."

    data["brands"] = terms_from_value(payload.get("brands"))
    data["social"] = clean_social(payload)
    data["logo"] = str(payload.get("logo") or "")

    if payload.get("website_url"):
        errors["_honeypot"] = "spam"

    return data, errors


def save_logo(company_id: int, data_url: str) -> str:
    bucket = os.environ.get("BUCKET_NAME") or ""
    match = DATA_URL_RE.match((data_url or "").strip())
    if not bucket or not match:
        return ""
    raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)))
    if not raw or len(raw) > MAX_LOGO_BYTES:
        return ""
    key = f"images/afiliados/{company_id}.jpg"
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=raw,
        ContentType="image/jpeg",
        CacheControl="public, max-age=86400",
    )
    return f"/{key}"


def company_from_application(data: dict[str, Any]) -> dict[str, Any]:
    company_id = int(time.time() * 1000)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    sector_slug = data["sector"]
    company = {
        "id": company_id,
        "slug": f"{slugify(data['name'])}-{str(company_id)[-6:]}",
        "name": data["name"],
        "status": "pending",
        "description": data["description"],
        "excerpt": "",
        "tagline": "",
        "phone": data["phone"],
        "phone2": data["phone2"],
        "fax": data.get("fax") or "",
        "email": data["email"],
        "email2": data["email2"],
        "website": data["website"],
        "address": data["address"],
        "zip": "",
        "rif": data["rif"],
        "legal_rep": data["legal_rep"],
        "lat": "",
        "lng": "",
        "video_url": "",
        "featured": False,
        "image_url": "",
        "social": data.get("social") or {},
        "sectors": [{"name": SECTORS[sector_slug], "slug": sector_slug}],
        "locations": data.get("locations") or [],
        "brands": data.get("brands") if isinstance(data.get("brands"), list) else terms_from_text(str(data.get("brands") or "")),
        "created_at": now,
        "updated_at": now,
        "source": "application",
    }
    company["search"] = search_blob(company)
    return company


def items_for_application(company: dict[str, Any]) -> list[dict[str, Any]]:
    return items_for_company(company)


def submit_application(table, payload: dict[str, Any]) -> dict[str, Any]:
    data, errors = validate_application(payload)
    if errors.get("_honeypot"):
        return {"ok": True, "status": "pending"}
    if errors:
        return {"ok": False, "error": "Revisa los datos del formulario.", "fields": errors}

    company = company_from_application(data)
    logo_url = save_logo(company["id"], str(data.get("logo") or ""))
    if logo_url:
        company["image_url"] = logo_url
    with table.batch_writer() as batch:
        for item in items_for_application(company):
            batch.put_item(Item=item)
    return {
        "ok": True,
        "status": "pending",
        "id": company["id"],
        "slug": company["slug"],
    }
