#!/usr/bin/env python3
"""Crea un usuario del panel /admin/ pidiendo la clave en la terminal."""

from __future__ import annotations

import argparse
import getpass
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

import boto3  # noqa: E402
from botocore.exceptions import ClientError  # noqa: E402

from admin import create_user  # noqa: E402

STACK = "website-cavedrepa-prod"


def resolve_table(session, name: str) -> str:
    if name:
        return name
    cloud = session.client("cloudformation")
    try:
        stacks = cloud.describe_stacks(StackName=STACK)["Stacks"][0]
    except ClientError as exc:
        raise SystemExit(
            "No se encontró el stack website-cavedrepa-prod. "
            "Usa --profile con la cuenta de AWS del sitio CAVEDREPA.\n"
            f"{exc}"
        ) from exc
    for item in stacks.get("Outputs") or []:
        if item.get("OutputKey") == "WebCoreTableName" and item.get("OutputValue"):
            return item["OutputValue"]
    return "cavedrepa-web-core"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="")
    parser.add_argument("--name", default="")
    parser.add_argument("--email", default="")
    parser.add_argument("--role", default="admin", choices=["admin", "editor"])
    parser.add_argument("--password", default="")
    parser.add_argument("--table", default="")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--profile", default="")
    args = parser.parse_args()

    session_kwargs = {"region_name": args.region}
    if args.profile:
        session_kwargs["profile_name"] = args.profile
    session = boto3.Session(**session_kwargs)

    table_name = resolve_table(session, args.table)
    dynamo = session.client("dynamodb")
    try:
        dynamo.describe_table(TableName=table_name)
    except ClientError as exc:
        raise SystemExit(
            f"No existe la tabla {table_name} en {args.region}. "
            "Confirma el --profile de la cuenta del sitio CAVEDREPA.\n"
            f"{exc}"
        ) from exc

    if not args.username:
        local = re.sub(r"[^a-z0-9._-]", "", (args.email.split("@", 1)[0] if args.email else "").lower())
        args.username = local or "editor"
    if not args.name:
        args.name = args.username

    password = args.password.strip()
    generated = False
    if not password:
        if sys.stdin.isatty():
            password = getpass.getpass(f"Clave para {args.username} (mínimo 8 caracteres): ")
        else:
            password = f"Cavedrepa-{secrets.token_urlsafe(8)}"
            generated = True
    table = session.resource("dynamodb").Table(table_name)
    result = create_user(
        table,
        {
            "username": args.username,
            "name": args.name,
            "password": password,
            "email": args.email,
            "role": args.role,
        },
    )
    print(result)
    if not result.get("ok"):
        raise SystemExit(1)
    print(f"Listo. Entra en /admin/ con {args.username}" + (f" o {args.email}" if args.email else "") + ".")
    if generated:
        print(f"Clave temporal: {password}")


if __name__ == "__main__":
    main()
