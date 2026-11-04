"""Notificaciones de afiliacion y enlaces seguros de revision."""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from typing import Any
from urllib.parse import urlencode

import boto3

ACTION_TTL = 7 * 24 * 3600
_secret: str | None = None


def _review_secret() -> str:
    global _secret
    if _secret is not None:
        return _secret
    configured = (os.environ.get("REVIEW_ACTION_SECRET") or "").strip()
    if configured:
        _secret = configured
        return _secret
    arn = (os.environ.get("ADMIN_SECRET_ARN") or "").strip()
    if not arn:
        raise RuntimeError("No hay un secreto configurado para los enlaces de revision.")
    raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString") or "{}"
    parsed = json.loads(raw)
    _secret = str(parsed.get("password") or raw)
    return _secret


def sign_review_action(company_id: int, action: str, now: int | None = None) -> str:
    if action not in {"approve", "reject"}:
        raise ValueError("Accion no valida")
    payload = {
        "id": int(company_id),
        "action": action,
        "exp": int(now if now is not None else time.time()) + ACTION_TTL,
    }
    encoded = urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    ).decode().rstrip("=")
    signature = hmac.new(_review_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_review_action(token: str, now: int | None = None) -> dict[str, Any] | None:
    raw = (token or "").strip()
    if "." not in raw:
        return None
    encoded, signature = raw.rsplit(".", 1)
    expected = hmac.new(_review_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(urlsafe_b64decode(padded).decode())
        company_id = int(payload.get("id"))
        action = str(payload.get("action") or "")
        expires = int(payload.get("exp") or 0)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if action not in {"approve", "reject"} or expires < int(now if now is not None else time.time()):
        return None
    return {"id": company_id, "action": action, "exp": expires}


def _action_url(company_id: int, action: str) -> str:
    base = (os.environ.get("API_BASE_URL") or "").strip().rstrip("/")
    token = sign_review_action(company_id, action)
    return f"{base}/applications/review?{urlencode({'token': token})}"


def _row(label: str, value: Any, *, show_empty: bool = True) -> str:
    raw = str(value or "").strip()
    if not raw and not show_empty:
        return ""
    clean = html.escape(raw or "No indicado")
    return (
        '<tr><td style="padding:8px 20px 8px 0;color:#6b7280;vertical-align:top;width:165px">'
        f"{html.escape(label)}</td><td style=\"padding:8px 0;color:#172033;font-weight:600;word-break:break-word\">{clean}</td></tr>"
    )


def _section(title: str, rows: list[str]) -> str:
    return (
        '<div style="margin:0 0 22px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">'
        f'<div style="background:#f7f9f8;color:#0e4f3a;font-size:16px;font-weight:bold;padding:12px 16px">{html.escape(title)}</div>'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        f'style="font-size:15px;line-height:1.45;padding:8px 16px 12px">{"".join(rows)}</table></div>'
    )


def _names(items: Any) -> str:
    if not isinstance(items, list):
        return str(items or "")
    return ", ".join(
        str(item.get("name") or "") if isinstance(item, dict) else str(item or "")
        for item in items
        if item
    )


def application_email(company: dict[str, Any]) -> tuple[str, str]:
    name = str(company.get("name") or "Nueva empresa")
    location = _names(company.get("locations"))
    sector = _names(company.get("sectors"))
    brands = _names(company.get("brands"))
    social = company.get("social") if isinstance(company.get("social"), dict) else {}
    approve_url = html.escape(_action_url(int(company["id"]), "approve"), quote=True)
    reject_url = html.escape(_action_url(int(company["id"]), "reject"), quote=True)
    sections = "".join(
        [
            _section("Datos de la empresa", [
            _row("Empresa", name),
            _row("RIF", company.get("rif")),
            _row("Representante legal", company.get("legal_rep")),
            _row("Sector", sector),
            _row("Marcas", brands),
            _row("Descripción", company.get("description")),
            ]),
            _section("Ubicación", [
            _row("Ciudad / Estado", location),
            _row("Dirección", company.get("address")),
            ]),
            _section("Contacto", [
            _row("Teléfono principal", company.get("phone")),
            _row("Teléfono adicional", company.get("phone2")),
            _row("Fax", company.get("fax")),
            _row("Correo principal", company.get("email")),
            _row("Correo adicional", company.get("email2")),
            _row("Sitio web", company.get("website")),
            ]),
            _section("Redes sociales", [
            _row("Facebook", social.get("facebook")),
            _row("Instagram", social.get("instagram")),
            _row("LinkedIn", social.get("linkedin")),
            _row("YouTube", social.get("youtube")),
            _row("X / Twitter", social.get("twitter")),
            ]),
            _section("Información de la solicitud", [
            _row("Número de solicitud", company.get("id")),
            _row("Fecha de recepción", company.get("created_at")),
            _row("Vencimiento", company.get("expires_at")),
            _row("Logo / imagen", company.get("image_url")),
            ]),
        ]
    )
    subject = f"Nueva solicitud de afiliación: {name}"
    body = f"""<!doctype html>
<html><body style="margin:0;background:#f3f5f7;font-family:Arial,sans-serif;color:#172033">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f7;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="820" cellspacing="0" cellpadding="0" style="max-width:820px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(23,32,51,.10)">
<tr><td style="background:#0e4f3a;padding:25px 32px;color:#fff"><div style="font-size:13px;letter-spacing:1.5px;font-weight:bold">CAVEDREPA</div><div style="font-size:25px;font-weight:bold;margin-top:7px">Nueva solicitud de afiliación</div></td></tr>
<tr><td style="padding:30px 32px">
<p style="font-size:18px;line-height:1.55;margin:0 0 22px">Se recibió una solicitud de <strong>{html.escape(name)}</strong>. A continuación puede revisar toda la información suministrada:</p>
{sections}
<div style="height:1px;background:#e5e7eb;margin:26px 0"></div>
<p style="font-size:17px;font-weight:bold;margin:0 0 16px">¿Qué desea hacer?</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="padding:0 12px 12px 0"><a href="{approve_url}" style="display:inline-block;background:#16794f;color:#fff;text-decoration:none;font-size:18px;font-weight:bold;padding:15px 24px;border-radius:9px">Aprobar afiliación</a></td>
<td style="padding:0 0 12px"><a href="{reject_url}" style="display:inline-block;background:#b42318;color:#fff;text-decoration:none;font-size:18px;font-weight:bold;padding:15px 24px;border-radius:9px">Rechazar solicitud</a></td>
</tr></table>
<p style="font-size:13px;color:#6b7280;line-height:1.5;margin:18px 0 0">Por seguridad, el enlace pedirá una confirmación y vencerá en 7 días. También puede gestionar la solicitud desde el panel administrativo.</p>
</td></tr></table></td></tr></table></body></html>"""
    return subject, body


def send_application_notification(company: dict[str, Any]) -> bool:
    recipients = [
        address.strip()
        for address in re.split(r"[,;]", os.environ.get("NOTIFICATION_EMAIL") or "")
        if address.strip()
    ]
    sender = (os.environ.get("NOTIFICATION_FROM") or "").strip()
    sender_name = (os.environ.get("NOTIFICATION_FROM_NAME") or "Cavedrepa").strip()
    if not recipients or not sender:
        return False
    subject, body = application_email(company)
    text = (
        f"Nueva solicitud de afiliación: {company.get('name') or ''}\n"
        f"RIF: {company.get('rif') or ''}\nCorreo: {company.get('email') or ''}\n"
        "Ingrese al panel administrativo de CAVEDREPA para revisarla."
    )
    boto3.client("ses").send_email(
        Source=f'"{sender_name}" <{sender}>' if sender_name else sender,
        Destination={"ToAddresses": recipients},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Html": {"Data": body, "Charset": "UTF-8"},
                "Text": {"Data": text, "Charset": "UTF-8"},
            },
        },
    )
    return True
