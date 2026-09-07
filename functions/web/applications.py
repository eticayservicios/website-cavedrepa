"""Solicitudes de afiliación: validación y escritura en DynamoDB."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

from directory import dynamodb_safe, fold, items_for_company, search_blob

SECTORS = {
    "agricola": "Sector Agrícola",
    "construccion": "Sector Construcción",
    "acuicola": "Sector Acuícola",
}

LIMITS = {
    "name": 180,
    "rif": 32,
    "legal_rep": 160,
    "phone": 40,
    "phone2": 40,
    "email": 160,
    "email2": 160,
    "website": 200,
    "address": 400,
    "location": 120,
    "brands": 400,
    "description": 4000,
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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


def validate_application(payload: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    data = {key: clean_text(payload.get(key), limit) for key, limit in LIMITS.items()}
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

    sector = clean_text(payload.get("sector"), 40).lower()
    if sector not in SECTORS:
        errors["sector"] = "Elige un sector."
    else:
        data["sector"] = sector

    if payload.get("website_url"):
        errors["_honeypot"] = "spam"

    return data, errors


def company_from_application(data: dict[str, str]) -> dict[str, Any]:
    company_id = int(time.time() * 1000)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    sector_slug = data["sector"]
    location = terms_from_text(data["location"])
    brands = terms_from_text(data["brands"])
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
        "fax": "",
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
        "sectors": [{"name": SECTORS[sector_slug], "slug": sector_slug}],
        "locations": location,
        "brands": brands,
        "created_at": now,
        "updated_at": now,
        "source": "application",
    }
    company["search"] = search_blob(company)
    return company


def items_for_application(company: dict[str, Any]) -> list[dict[str, Any]]:
    items = items_for_company(company)
    items.append(
        dynamodb_safe(
            {
                "pk": "APPLICATION#pending",
                "sk": f"APPLICATION#{company['id']}",
                "entity": "application",
                "id": company["id"],
                "slug": company["slug"],
                "name": company["name"],
                "rif": company["rif"],
                "email": company["email"],
                "phone": company["phone"],
                "status": "pending",
                "created_at": company["created_at"],
            }
        )
    )
    return items


def submit_application(table, payload: dict[str, Any]) -> dict[str, Any]:
    data, errors = validate_application(payload)
    if errors.get("_honeypot"):
        return {"ok": True, "status": "pending"}
    if errors:
        return {"ok": False, "error": "Revisa los datos del formulario.", "fields": errors}

    company = company_from_application(data)
    with table.batch_writer() as batch:
        for item in items_for_application(company):
            batch.put_item(Item=item)
    return {
        "ok": True,
        "status": "pending",
        "id": company["id"],
        "slug": company["slug"],
    }
