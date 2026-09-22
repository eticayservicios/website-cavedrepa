#!/usr/bin/env python3
"""Borra los índices BRAND# que quedaron en DynamoDB tras quitarle marcas a una empresa.

El import solo escribe items, así que al reducir las marcas de una ficha las
relaciones anteriores siguen respondiendo en /directory?brand=<slug>.

    python3 scripts/cleanup_brand_index.py 3141
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from boto3.dynamodb.conditions import Attr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from directory import normalize_listing  # noqa: E402


def seed_brand_slugs(company_id: int) -> set[str]:
    rows = json.loads((ROOT / "scripts" / "seed_published.json").read_text(encoding="utf-8"))
    row = next((item for item in rows if int(item.get("id") or 0) == company_id), None)
    if row is None:
        raise SystemExit(f"{company_id} no está en seed_published.json")
    return {brand["slug"] for brand in normalize_listing(row)["brands"] if brand.get("slug")}


def stored_brand_pks(table, company_id: int) -> list[str]:
    """Índices BRAND# que la tabla tiene hoy para la empresa."""
    condition = Attr("sk").eq(f"COMPANY#{company_id}") & Attr("pk").begins_with("BRAND#")
    pks: list[str] = []
    kwargs: dict = {"FilterExpression": condition, "ProjectionExpression": "pk"}
    while True:
        page = table.scan(**kwargs)
        pks.extend(item["pk"] for item in page.get("Items", []))
        token = page.get("LastEvaluatedKey")
        if not token:
            return pks
        kwargs["ExclusiveStartKey"] = token


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ids", nargs="+", type=int, help="IDs de empresa a limpiar")
    parser.add_argument("--table", default="cavedrepa-web-core")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    import boto3

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    deleted = 0
    for company_id in args.ids:
        keep = {f"BRAND#{slug}" for slug in seed_brand_slugs(company_id)}
        for pk in sorted(set(stored_brand_pks(table, company_id)) - keep):
            print(f"DROP  {pk}\tCOMPANY#{company_id}")
            if not args.dry_run:
                table.delete_item(Key={"pk": pk, "sk": f"COMPANY#{company_id}"})
            deleted += 1

    print(json.dumps({"deleted": deleted, "dry_run": args.dry_run}, ensure_ascii=False))


if __name__ == "__main__":
    main()
