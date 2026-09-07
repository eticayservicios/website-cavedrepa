#!/usr/bin/env python3
"""Carga listings de Directorist en DynamoDB cavedrepa-web-core."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from directory import (  # noqa: E402
    build_catalogs,
    catalog_items,
    items_for_company,
    normalize_listing,
)


def load_listings(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("listings.json debe ser una lista de empresas")
    return [normalize_listing(item) for item in raw]


def write_items(table, items: list[dict]) -> int:
    written = 0
    with table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as batch:
        for item in items:
            batch.put_item(Item=item)
            written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--listings",
        default=str(ROOT / "data" / "listings.json"),
        help="JSON exportado desde WordPress/Directorist",
    )
    parser.add_argument("--table", default="cavedrepa-web-core")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    listings_path = Path(args.listings)
    if not listings_path.exists():
        raise SystemExit(f"No está el archivo {listings_path}")

    companies = load_listings(listings_path)
    catalogs = build_catalogs(companies)
    items = catalog_items(catalogs)
    for company in companies:
        items.extend(items_for_company(company))

    by_status: dict[str, int] = {}
    for company in companies:
        by_status[company["status"]] = by_status.get(company["status"], 0) + 1

    print(
        json.dumps(
            {
                "companies": len(companies),
                "by_status": by_status,
                "items": len(items),
                "sectors": len(catalogs["sectors"]),
                "locations": len(catalogs["locations"]),
                "brands": len(catalogs["brands"]),
                "table": args.table,
                "dry_run": args.dry_run,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if args.dry_run:
        return

    import boto3

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    written = write_items(table, items)
    print(json.dumps({"written": written}, ensure_ascii=False))


if __name__ == "__main__":
    main()
