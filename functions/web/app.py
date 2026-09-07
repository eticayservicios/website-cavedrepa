"""HTTP handler for cavedrepa-web: directorio de afiliados."""

from __future__ import annotations

import base64
import json
import os
from decimal import Decimal
from urllib.parse import unquote

import boto3

from applications import submit_application
from blog import get_post, search_blog
from directory import (
    SITE_ORIGIN,
    get_catalogs,
    get_company,
    search_directory,
)

TABLE_NAME = os.environ.get("TABLE_NAME", "")
ALLOWED_ORIGINS = {
    SITE_ORIGIN,
}

_table = None


class DecimalEncoder(json.JSONEncoder):
    def default(self, value):
        if isinstance(value, Decimal):
            if value % 1 == 0:
                return int(value)
            return float(value)
        return super().default(value)


def table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(TABLE_NAME)
    return _table


def is_local_origin(origin: str) -> bool:
    return origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


def origin_for(event: dict) -> str:
    headers = event.get("headers") or {}
    incoming = ""
    for key, value in headers.items():
        if key.lower() == "origin":
            incoming = value or ""
            break
    if incoming in ALLOWED_ORIGINS or is_local_origin(incoming):
        return incoming
    return SITE_ORIGIN


def cors_headers(event: dict) -> dict[str, str]:
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": origin_for(event),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Vary": "Origin",
    }


def respond(event: dict, status: int, payload: dict) -> dict:
    return {
        "statusCode": status,
        "headers": cors_headers(event),
        "body": json.dumps(payload, ensure_ascii=False, cls=DecimalEncoder),
    }


def request_path(event: dict) -> str:
    raw = event.get("path") or "/"
    if raw.startswith("/v1/"):
        raw = raw[3:]
    elif raw == "/v1":
        raw = "/"
    proxy = (event.get("pathParameters") or {}).get("proxy")
    if proxy and raw in {"/", "/{proxy+}"}:
        raw = "/" + proxy
    return unquote(raw.rstrip("/") or "/")


def query_params(event: dict) -> dict[str, str]:
    params = event.get("queryStringParameters") or {}
    return {key: (value or "").strip() for key, value in params.items()}


def request_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    if isinstance(raw, dict):
        return raw
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("JSON inválido") from exc
    return payload if isinstance(payload, dict) else {}


def lambda_handler(event, context):
    method = (event.get("httpMethod") or "GET").upper()
    path = request_path(event)

    if method == "OPTIONS":
        return respond(event, 204, {"ok": True})

    if method == "GET" and path == "/":
        return respond(
            event,
            200,
            {
                "ok": True,
                "service": "cavedrepa-web",
                "tableConfigured": bool(TABLE_NAME),
            },
        )

    if not TABLE_NAME:
        return respond(event, 500, {"ok": False, "error": "TABLE_NAME no configurada"})

    try:
        if method == "GET" and path == "/directory":
            return respond(event, 200, search_directory(table(), query_params(event)))

        if method == "GET" and path == "/directory/catalogs":
            return respond(event, 200, get_catalogs(table()))

        if method == "GET" and path.startswith("/directory/companies/"):
            key = path.split("/directory/companies/", 1)[1]
            company = get_company(table(), key)
            if not company:
                return respond(event, 404, {"ok": False, "error": "Empresa no encontrada"})
            return respond(event, 200, {"ok": True, "company": company})

        if method == "POST" and path == "/directory/applications":
            try:
                payload = request_body(event)
            except ValueError:
                return respond(event, 400, {"ok": False, "error": "JSON inválido"})
            result = submit_application(table(), payload)
            status = 200 if result.get("ok") else 400
            return respond(event, status, result)

        if method == "GET" and path == "/blog":
            return respond(event, 200, search_blog(table(), query_params(event)))

        if method == "GET" and path.startswith("/blog/"):
            key = path.split("/blog/", 1)[1]
            post = get_post(table(), key)
            if not post:
                return respond(event, 404, {"ok": False, "error": "Entrada no encontrada"})
            return respond(event, 200, {"ok": True, "post": post})
    except Exception as exc:
        return respond(event, 500, {"ok": False, "error": "Error interno", "detail": str(exc)})

    return respond(event, 404, {"ok": False, "error": "Ruta no encontrada"})
