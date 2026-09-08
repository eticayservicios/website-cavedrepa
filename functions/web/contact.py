"""Mensajes del formulario de contacto."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

from directory import dynamodb_safe, query_pk

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

LIMITS = {
    "name": 160,
    "email": 160,
    "phone": 40,
    "message": 4000,
}

PUBLIC_FIELDS = ("id", "name", "email", "phone", "message", "created_at")


def clean_text(value: Any, limit: int) -> str:
    text = str(value or "").replace("\x00", "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def clean_message(value: Any, limit: int) -> str:
    text = str(value or "").replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:limit]


def validate_message(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    data: dict[str, Any] = {
        "name": clean_text(payload.get("name"), LIMITS["name"]),
        "email": clean_text(payload.get("email"), LIMITS["email"]).lower(),
        "phone": clean_text(payload.get("phone"), LIMITS["phone"]),
        "message": clean_message(payload.get("message"), LIMITS["message"]),
    }
    errors: dict[str, str] = {}
    if len(data["name"]) < 2:
        errors["name"] = "Indica tu nombre."
    if not EMAIL_RE.match(data["email"]):
        errors["email"] = "Indica un correo válido."
    if len(data["message"]) < 8:
        errors["message"] = "Escribe tu mensaje."
    if payload.get("website_url"):
        errors["_honeypot"] = "spam"
    return data, errors


def public_message(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item.get(key) or "" for key in PUBLIC_FIELDS}


def submit_message(table, payload: dict[str, Any]) -> dict[str, Any]:
    data, errors = validate_message(payload)
    if errors.get("_honeypot"):
        return {"ok": True}
    if errors:
        return {"ok": False, "error": "Revisa los datos del formulario.", "fields": errors}

    message_id = str(int(time.time() * 1000))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    item = dynamodb_safe(
        {
            "pk": "CONTACT#inbox",
            "sk": f"MESSAGE#{now}#{message_id}",
            "entity": "contact",
            "id": message_id,
            "name": data["name"],
            "email": data["email"],
            "phone": data["phone"],
            "message": data["message"],
            "created_at": now,
        }
    )
    table.put_item(Item=item)
    return {"ok": True, "id": message_id}


def list_messages(table) -> dict[str, Any]:
    rows = [public_message(row) for row in query_pk(table, "CONTACT#inbox")]
    rows.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"ok": True, "total": len(rows), "messages": rows}
