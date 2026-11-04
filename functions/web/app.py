"""HTTP handler for cavedrepa-web: directorio de afiliados."""

from __future__ import annotations

import base64
import json
import os
from decimal import Decimal
from html import escape
from urllib.parse import unquote

import boto3

from admin import (
    approve_application,
    create_user,
    delete_user,
    expire_company,
    can_manage_users,
    find_user,
    get_application,
    list_applications,
    list_companies,
    list_users,
    login as admin_login,
    public_user,
    reject_application,
    require_admin,
    require_user_manager,
    set_expiration,
)
from applications import submit_application
from blog import (
    delete_admin_post,
    get_admin_post,
    get_post,
    list_admin_posts,
    save_admin_post,
    search_blog,
)
from contact import list_messages, submit_message
from directory import (
    SITE_ORIGIN,
    get_catalogs,
    get_company,
    search_directory,
)
from notifications import verify_review_action

TABLE_NAME = os.environ.get("TABLE_NAME", "")
ALLOWED_ORIGINS = {
    SITE_ORIGIN,
    "https://www.cavedrepa.org",
    "https://cavedrepa.org",
    "https://cavedrepa.smartravelevents.com",
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
    origin = origin_for(event)
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    }


def respond(event: dict, status: int, payload: dict) -> dict:
    return {
        "statusCode": status,
        "headers": cors_headers(event),
        "body": json.dumps(payload, ensure_ascii=False, cls=DecimalEncoder),
    }


def respond_html(status: int, body: str) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
        },
        "body": body,
    }


def review_page(title: str, message: str, *, confirm_url: str = "", action: str = "") -> str:
    colors = {"approve": ("#16794f", "Confirmar aprobacion"), "reject": ("#b42318", "Confirmar rechazo")}
    button = ""
    if confirm_url and action in colors:
        color, label = colors[action]
        button = f'<form method="post" action="{escape(confirm_url, quote=True)}"><button style="border:0;border-radius:10px;background:{color};color:white;font-size:20px;font-weight:bold;padding:16px 25px;cursor:pointer">{label}</button></form>'
    return f"""<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title>
<body style="margin:0;background:#f3f5f7;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:8vh auto;padding:36px;background:white;border-radius:16px;box-shadow:0 8px 28px rgba(23,32,51,.12);text-align:center">
<div style="color:#0e4f3a;font-size:14px;font-weight:bold;letter-spacing:1.5px">CAVEDREPA</div><h1 style="font-size:28px;margin:14px 0">{escape(title)}</h1><p style="font-size:18px;line-height:1.55;margin:0 0 26px">{escape(message)}</p>{button}</main></body></html>"""


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
        if path == "/applications/review" and method in {"GET", "POST"}:
            raw_token = query_params(event).get("token") or ""
            action_data = verify_review_action(raw_token)
            if not action_data:
                return respond_html(
                    400,
                    review_page(
                        "Enlace no valido",
                        "Este enlace vencio o no es valido. Puede revisar la solicitud desde el panel administrativo.",
                    ),
                )
            company = get_application(table(), str(action_data["id"]))
            if not company:
                return respond_html(404, review_page("Solicitud no encontrada", "La solicitud ya no existe."))
            if company.get("status") != "pending":
                labels = {"publish": "aprobada", "rejected": "rechazada", "expired": "vencida"}
                state = labels.get(str(company.get("status") or ""), "procesada")
                return respond_html(
                    200,
                    review_page(
                        "Solicitud ya procesada",
                        f"{company.get('name') or 'La empresa'} ya fue {state}. No necesita hacer nada mas.",
                    ),
                )
            action = str(action_data["action"])
            if method == "GET":
                verb = "aprobar" if action == "approve" else "rechazar"
                return respond_html(
                    200,
                    review_page(
                        f"Confirmar {verb}",
                        f"¿Confirma que desea {verb} la solicitud de {company.get('name') or 'esta empresa'}?",
                        confirm_url=f"?token={raw_token}",
                        action=action,
                    ),
                )
            if action == "approve":
                result = approve_application(table(), str(action_data["id"]), "enlace-correo")
                message = "La empresa ya aparece publicada en el directorio."
                title = "Afiliacion aprobada"
            else:
                result = reject_application(
                    table(), str(action_data["id"]), "Rechazada desde el correo", "enlace-correo"
                )
                message = "La solicitud fue rechazada y salio de la cola pendiente."
                title = "Solicitud rechazada"
            if not result.get("ok"):
                return respond_html(400, review_page("No se pudo procesar", result.get("error") or "Intente desde el panel administrativo."))
            return respond_html(200, review_page(title, message))

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

        if method == "POST" and path == "/contact":
            try:
                payload = request_body(event)
            except ValueError:
                return respond(event, 400, {"ok": False, "error": "JSON inválido"})
            result = submit_message(table(), payload)
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

        if method == "POST" and path == "/admin/login":
            try:
                payload = request_body(event)
            except ValueError:
                return respond(event, 400, {"ok": False, "error": "JSON inválido"})
            result = admin_login(table(), payload)
            return respond(event, 200 if result.get("ok") else 401, result)

        if path.startswith("/admin/"):
            session = require_admin(event)
            if not session.get("ok"):
                return respond(event, 401, session)

            if method == "GET" and path == "/admin/me":
                record = find_user(table(), session.get("user") or "")
                if not record:
                    return respond(event, 401, {"ok": False, "error": "Inicia sesión para continuar."})
                user = public_user(record)
                return respond(
                    event,
                    200,
                    {"ok": True, **user, "can_manage_users": can_manage_users(record)},
                )

            if method == "GET" and path == "/admin/companies":
                return respond(event, 200, list_companies(table(), query_params(event)))

            if method == "GET" and path == "/admin/applications":
                return respond(event, 200, list_applications(table()))

            if method == "GET" and path == "/admin/messages":
                return respond(event, 200, list_messages(table()))

            if method == "GET" and path == "/admin/posts":
                return respond(event, 200, list_admin_posts(table(), query_params(event)))

            if method == "POST" and path == "/admin/posts":
                try:
                    payload = request_body(event)
                except ValueError:
                    return respond(event, 400, {"ok": False, "error": "JSON inválido"})
                result = save_admin_post(table(), payload)
                return respond(event, 200 if result.get("ok") else 400, result)

            if method == "POST" and path.startswith("/admin/posts/") and path.endswith("/delete"):
                key = path.split("/admin/posts/", 1)[1].rsplit("/delete", 1)[0]
                result = delete_admin_post(table(), key)
                return respond(event, 200 if result.get("ok") else 404, result)

            if method == "POST" and path.startswith("/admin/posts/"):
                key = path.split("/admin/posts/", 1)[1]
                if "/" not in key:
                    try:
                        payload = request_body(event)
                    except ValueError:
                        return respond(event, 400, {"ok": False, "error": "JSON inválido"})
                    result = save_admin_post(table(), payload, key)
                    return respond(event, 200 if result.get("ok") else 400, result)

            if method == "GET" and path.startswith("/admin/posts/"):
                rest = path.split("/admin/posts/", 1)[1]
                if "/" not in rest:
                    post = get_admin_post(table(), rest)
                    if not post:
                        return respond(event, 404, {"ok": False, "error": "Entrada no encontrada"})
                    return respond(event, 200, {"ok": True, "post": post})

            if method == "POST" and path.startswith("/admin/companies/") and path.endswith("/expiration"):
                key = path.split("/admin/companies/", 1)[1].rsplit("/expiration", 1)[0]
                try:
                    payload = request_body(event)
                except ValueError:
                    payload = {}
                result = set_expiration(
                    table(), key, str(payload.get("expires_at") or ""), session.get("user") or ""
                )
                return respond(event, 200 if result.get("ok") else 404, result)

            if method == "POST" and path.startswith("/admin/companies/") and path.endswith("/expire"):
                key = path.split("/admin/companies/", 1)[1].rsplit("/expire", 1)[0]
                result = expire_company(table(), key, session.get("user") or "")
                return respond(event, 200 if result.get("ok") else 404, result)

            if method == "GET" and path.startswith("/admin/companies/"):
                rest = path.split("/admin/companies/", 1)[1]
                if "/" not in rest:
                    company = get_application(table(), rest)
                    if not company:
                        return respond(event, 404, {"ok": False, "error": "Empresa no encontrada"})
                    return respond(event, 200, {"ok": True, "company": company})

            if method == "GET" and path.startswith("/admin/applications/"):
                rest = path.split("/admin/applications/", 1)[1]
                if "/" not in rest:
                    company = get_application(table(), rest)
                    if not company:
                        return respond(event, 404, {"ok": False, "error": "Solicitud no encontrada"})
                    return respond(event, 200, {"ok": True, "company": company})

            if method == "POST" and path.startswith("/admin/applications/") and path.endswith("/approve"):
                key = path.split("/admin/applications/", 1)[1].rsplit("/approve", 1)[0]
                result = approve_application(table(), key, session.get("user") or "")
                return respond(event, 200 if result.get("ok") else 404, result)

            if method == "POST" and path.startswith("/admin/applications/") and path.endswith("/reject"):
                key = path.split("/admin/applications/", 1)[1].rsplit("/reject", 1)[0]
                try:
                    payload = request_body(event)
                except ValueError:
                    payload = {}
                result = reject_application(
                    table(), key, str(payload.get("reason") or ""), session.get("user") or ""
                )
                return respond(event, 200 if result.get("ok") else 404, result)

            if method == "GET" and path == "/admin/users":
                gate = require_user_manager(table(), event)
                if not gate.get("ok"):
                    return respond(event, 403, gate)
                return respond(event, 200, list_users(table()))

            if method == "POST" and path == "/admin/users":
                gate = require_user_manager(table(), event)
                if not gate.get("ok"):
                    return respond(event, 403, gate)
                try:
                    payload = request_body(event)
                except ValueError:
                    return respond(event, 400, {"ok": False, "error": "JSON inválido"})
                result = create_user(table(), payload)
                return respond(event, 200 if result.get("ok") else 400, result)

            if method == "POST" and path.startswith("/admin/users/") and path.endswith("/delete"):
                gate = require_user_manager(table(), event)
                if not gate.get("ok"):
                    return respond(event, 403, gate)
                username = path.split("/admin/users/", 1)[1].rsplit("/delete", 1)[0]
                result = delete_user(table(), username, session.get("user") or "")
                return respond(event, 200 if result.get("ok") else 400, result)
    except Exception as exc:
        return respond(event, 500, {"ok": False, "error": "Error interno", "detail": str(exc)})

    return respond(event, 404, {"ok": False, "error": "Ruta no encontrada"})
