"""Panel interno: usuarios, sesión y cola de solicitudes de afiliación."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any

import boto3

from directory import (
    apply_catalog_delta,
    fold,
    get_item,
    items_for_company,
    query_pk,
    scan_company_profiles,
)

TOKEN_TTL = 12 * 3600
HASH_ROUNDS = 120_000
PROFILE_SKIP = {"pk", "sk", "entity"}
USER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,31}$")
_SEED: list[dict[str, str]] | None = None


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def header(event: dict, name: str) -> str:
    for key, value in (event.get("headers") or {}).items():
        if key.lower() == name.lower():
            return str(value or "")
    return ""


def reset_credentials_cache() -> None:
    global _SEED
    _SEED = None


def clean_username(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def hash_password(password: str, salt: str | None = None) -> str:
    used = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), used.encode(), HASH_ROUNDS).hex()
    return f"{used}${digest}"


def check_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    expected = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), HASH_ROUNDS).hex()
    return hmac.compare_digest(expected, digest)


def token_secret() -> str:
    return (
        (os.environ.get("ADMIN_SECRET_ARN") or "").strip()
        or (os.environ.get("ADMIN_PASSWORD") or "").strip()
        or "cavedrepa-admin"
    )


def sign_token(user: str, now: int | None = None) -> str:
    issued = int(now if now is not None else time.time())
    payload = json.dumps({"u": user, "exp": issued + TOKEN_TTL}, separators=(",", ":"))
    digest = hmac.new(token_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{digest}"


def read_token(token: str) -> dict[str, Any] | None:
    raw = (token or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    if "." not in raw:
        return None
    payload, digest = raw.rsplit(".", 1)
    expected = hmac.new(token_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, digest):
        return None
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if int(data.get("exp") or 0) < int(time.time()):
        return None
    user = clean_username(data.get("u"))
    return {"user": user} if user else None


def _append_seed(users: list[dict[str, str]], username: str, password: str, name: str = "") -> None:
    user = clean_username(username)
    if not user or not password:
        return
    if any(item["username"] == user for item in users):
        return
    users.append({"username": user, "password": password, "name": (name or user).strip()})


def seed_users() -> list[dict[str, str]]:
    global _SEED
    if _SEED is not None:
        return _SEED
    users: list[dict[str, str]] = []
    raw_list = (os.environ.get("ADMIN_USERS") or "").strip()
    if raw_list:
        try:
            parsed = json.loads(raw_list)
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    _append_seed(
                        users,
                        item.get("username") or item.get("user"),
                        str(item.get("password") or ""),
                        str(item.get("name") or ""),
                    )
    _append_seed(
        users,
        os.environ.get("ADMIN_USER") or "",
        os.environ.get("ADMIN_PASSWORD") or "",
        os.environ.get("ADMIN_USER") or "",
    )
    arn = (os.environ.get("ADMIN_SECRET_ARN") or "").strip()
    if arn:
        raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString") or "{}"
        data = json.loads(raw)
        _append_seed(
            users,
            data.get("username") or data.get("user") or "cavedrepa",
            str(data.get("password") or ""),
            str(data.get("name") or data.get("username") or "cavedrepa"),
        )
        extra = data.get("users") if isinstance(data.get("users"), list) else []
        for item in extra:
            if isinstance(item, dict):
                _append_seed(
                    users,
                    item.get("username") or item.get("user"),
                    str(item.get("password") or ""),
                    str(item.get("name") or ""),
                )
    _SEED = users
    return users


def user_item(username: str, password: str, name: str) -> dict[str, Any]:
    user = clean_username(username)
    return {
        "pk": "ADMIN#users",
        "sk": f"USER#{user}",
        "entity": "admin_user",
        "username": user,
        "name": (name or user).strip()[:80],
        "password_hash": hash_password(password),
        "created_at": now_stamp(),
    }


def public_user(item: dict[str, Any]) -> dict[str, str]:
    return {
        "username": item.get("username") or "",
        "name": item.get("name") or item.get("username") or "",
    }


def stored_users(table) -> list[dict[str, Any]]:
    return query_pk(table, "ADMIN#users")


def ensure_users(table) -> list[dict[str, Any]]:
    rows = stored_users(table)
    if rows:
        return rows
    for seed in seed_users():
        table.put_item(Item=user_item(seed["username"], seed["password"], seed.get("name") or ""))
    return stored_users(table)


def find_user(table, username: str) -> dict[str, Any] | None:
    user = clean_username(username)
    if not user:
        return None
    return get_item(table, "ADMIN#users", f"USER#{user}")


def login(table, payload: dict[str, Any]) -> dict[str, Any]:
    user = clean_username(payload.get("user") or payload.get("username"))
    password = str(payload.get("password") or "")
    rows = ensure_users(table)
    if not rows:
        return {"ok": False, "error": "El acceso no está configurado."}
    record = find_user(table, user)
    if not record or not check_password(password, str(record.get("password_hash") or "")):
        return {"ok": False, "error": "Usuario o contraseña incorrectos."}
    return {
        "ok": True,
        "token": sign_token(record["username"]),
        "user": record["username"],
        "name": record.get("name") or record["username"],
    }


def require_admin(event: dict) -> dict[str, Any]:
    session = read_token(header(event, "authorization"))
    if not session:
        return {"ok": False, "error": "Inicia sesión para continuar."}
    return {"ok": True, **session}


def list_users(table) -> dict[str, Any]:
    users = [public_user(item) for item in stored_users(table)]
    users.sort(key=lambda item: item["username"])
    return {"ok": True, "users": users}


def create_user(table, payload: dict[str, Any]) -> dict[str, Any]:
    username = clean_username(payload.get("username") or payload.get("user"))
    password = str(payload.get("password") or "")
    name = str(payload.get("name") or username).strip()[:80]
    if not USER_RE.match(username):
        return {"ok": False, "error": "El usuario debe tener letras o números, sin espacios."}
    if len(password) < 8:
        return {"ok": False, "error": "La contraseña debe tener al menos 8 caracteres."}
    if find_user(table, username):
        return {"ok": False, "error": "Ese usuario ya existe."}
    table.put_item(Item=user_item(username, password, name))
    return {"ok": True, "user": {"username": username, "name": name or username}}


def delete_user(table, username: str, actor: str) -> dict[str, Any]:
    user = clean_username(username)
    if user == clean_username(actor):
        return {"ok": False, "error": "No puedes eliminar tu propio acceso."}
    if not find_user(table, user):
        return {"ok": False, "error": "No se encontró ese usuario."}
    if len(stored_users(table)) <= 1:
        return {"ok": False, "error": "Debe quedar al menos un usuario."}
    table.delete_item(Key={"pk": "ADMIN#users", "sk": f"USER#{user}"})
    return {"ok": True}


def company_from_profile(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None
    company = {key: value for key, value in item.items() if key not in PROFILE_SKIP}
    if "id" in company:
        company["id"] = int(company["id"])
    return company


STATUS_FILTERS = {
    "pending": {"pending"},
    "publish": {"publish"},
    "published": {"publish"},
    "rejected": {"rejected"},
    "expired": {"expired"},
    "draft": {"draft"},
    "private": {"private"},
    "other": {"draft", "private"},
}


def company_summary(item: dict[str, Any], company: dict[str, Any] | None = None) -> dict[str, Any]:
    source = company or item
    return {
        "id": int(source.get("id") or item.get("id") or 0),
        "slug": source.get("slug") or item.get("slug") or "",
        "name": source.get("name") or item.get("name") or "",
        "rif": source.get("rif") or item.get("rif") or "",
        "email": source.get("email") or item.get("email") or "",
        "phone": source.get("phone") or item.get("phone") or "",
        "website": source.get("website") or "",
        "status": source.get("status") or item.get("status") or "pending",
        "created_at": source.get("created_at") or item.get("created_at") or "",
        "updated_at": source.get("updated_at") or "",
        "image_url": source.get("image_url") or "",
        "sectors": source.get("sectors") or [],
        "locations": source.get("locations") or [],
        "brands": source.get("brands") or [],
        "source": source.get("source") or "",
        "reject_reason": source.get("reject_reason") or "",
        "legal_rep": source.get("legal_rep") or "",
    }


application_summary = company_summary


def _empty_counts() -> dict[str, int]:
    return {
        "all": 0,
        "pending": 0,
        "publish": 0,
        "rejected": 0,
        "expired": 0,
        "other": 0,
    }


def _count_status(counts: dict[str, int], status: str) -> None:
    counts["all"] += 1
    if status in {"pending", "publish", "rejected", "expired"}:
        counts[status] += 1
    else:
        counts["other"] += 1


def list_companies(table, filters: dict[str, str] | None = None) -> dict[str, Any]:
    filters = filters or {}
    wanted = STATUS_FILTERS.get((filters.get("status") or "").strip().lower())
    query = fold(filters.get("q"))
    counts = _empty_counts()
    companies = []
    for item in scan_company_profiles(table):
        company = company_from_profile(item)
        if not company or not company.get("id"):
            continue
        status = str(company.get("status") or "draft")
        _count_status(counts, status)
        if wanted is not None and status not in wanted:
            continue
        blob = fold(
            " ".join(
                [
                    str(company.get("name") or ""),
                    str(company.get("rif") or ""),
                    str(company.get("email") or ""),
                    str(company.get("phone") or ""),
                    str(company.get("search") or ""),
                ]
            )
        )
        if query and query not in blob:
            continue
        companies.append(company_summary(company))
    companies.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"ok": True, "total": len(companies), "counts": counts, "companies": companies}


def list_applications(table) -> dict[str, Any]:
    result = list_companies(table, {"status": "pending"})
    return {
        "ok": True,
        "total": result["total"],
        "counts": result["counts"],
        "applications": result["companies"],
        "companies": result["companies"],
    }


def get_application(table, key: str) -> dict[str, Any] | None:
    raw = str(key or "").strip()
    if not raw.isdigit():
        return None
    company = company_from_profile(get_item(table, f"COMPANY#{int(raw)}", "PROFILE"))
    if not company:
        return None
    return company


def _replace_company(table, company: dict[str, Any], previous: dict[str, Any] | None = None) -> None:
    company_id = int(company["id"])
    if previous and previous.get("status") == "publish":
        for item in items_for_company(previous):
            if item.get("sk") == "PROFILE":
                continue
            table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
        apply_catalog_delta(table, previous, -1)
    for item in items_for_company(company):
        table.put_item(Item=item)
    table.delete_item(Key={"pk": "APPLICATION#pending", "sk": f"APPLICATION#{company_id}"})


def approve_application(table, key: str, actor: str = "") -> dict[str, Any]:
    company = get_application(table, key)
    if not company:
        return {"ok": False, "error": "No se encontró esa solicitud."}
    if company.get("status") == "publish":
        return {"ok": True, "status": "publish", "id": company["id"]}
    previous = dict(company)
    company["status"] = "publish"
    company["updated_at"] = now_stamp()
    if actor:
        company["reviewed_by"] = actor
    _replace_company(table, company, previous if previous.get("status") == "publish" else None)
    apply_catalog_delta(table, company, 1)
    return {"ok": True, "status": "publish", "id": company["id"], "slug": company.get("slug") or ""}


def reject_application(table, key: str, reason: str = "", actor: str = "") -> dict[str, Any]:
    company = get_application(table, key)
    if not company:
        return {"ok": False, "error": "No se encontró esa solicitud."}
    previous = dict(company)
    company["status"] = "rejected"
    company["updated_at"] = now_stamp()
    if reason:
        company["reject_reason"] = str(reason)[:400]
    if actor:
        company["reviewed_by"] = actor
    _replace_company(table, company, previous)
    return {"ok": True, "status": "rejected", "id": company["id"]}
