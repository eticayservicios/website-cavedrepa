#!/usr/bin/env python3
"""Reenvia notificaciones de solicitudes existentes sin modificar su estado."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from directory import as_company  # noqa: E402
from notifications import send_application_notification  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ids", nargs="+", type=int)
    parser.add_argument("--table", default="cavedrepa-web-core")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--send", action="store_true", help="Envia realmente los correos.")
    args = parser.parse_args()

    os.environ.setdefault("AWS_DEFAULT_REGION", args.region)
    os.environ.setdefault("ADMIN_SECRET_ARN", "cavedrepa/admin")
    os.environ.setdefault(
        "API_BASE_URL", "https://ohqbk8ppmi.execute-api.us-east-1.amazonaws.com/v1"
    )
    os.environ.setdefault(
        "NOTIFICATION_EMAIL", "cavedrepa2013@gmail.com,soporte@eticayservicios.com"
    )
    os.environ.setdefault("NOTIFICATION_FROM", "info@cavedrepa.org")
    os.environ.setdefault("NOTIFICATION_FROM_NAME", "Cavedrepa")

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    failures = 0
    for company_id in args.ids:
        response = table.get_item(Key={"pk": f"COMPANY#{company_id}", "sk": "PROFILE"})
        company = as_company(response.get("Item"))
        if not company:
            print(f"NO ENCONTRADA: {company_id}")
            failures += 1
            continue
        if company.get("status") != "pending":
            print(f"OMITIDA ({company.get('status')}): {company_id} - {company.get('name')}")
            failures += 1
            continue
        if not args.send:
            print(f"LISTA PARA REENVIO: {company_id} - {company.get('name')}")
            continue
        send_application_notification(company)
        print(f"ENVIADA: {company_id} - {company.get('name')}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
