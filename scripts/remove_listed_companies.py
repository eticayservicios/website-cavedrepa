#!/usr/bin/env python3
"""Quita del directorio las empresas señaladas, sin tocar Luiros ni Imperio de Venezuela."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from directory import (  # noqa: E402
    apply_catalog_delta,
    as_company,
    build_catalogs,
    get_item,
    items_for_company,
    normalize_listing,
)

REMOVE_IDS = {
    431,  # Belcat, C.A
    827,  # Corporación Vanlui, C.A. (Banlui)
    2805,  # DISTRIBUIDORA COSECHAGRI C.A.
    2715,  # DISTRIBUIDORA SANIFER, C.A.
    2093,  # Fundicion Pacifico, C.A
    2090,  # General Distribuidora, S.A GEDISA
    2492,  # INVERSIONES CAXIAS C.A.
    860,  # Prosemillas, C.A.
    2815,  # REDEQUIP GROUP,CA
    987,  # SIVETI, C.A.
    975,  # Turbo Center C.A.
    2491,  # AGRODALIAN, C.A
}

KEEP_IDS = {
    824,  # Corporación Luiros, C.A.
    3145,  # IMPERIO DE VENEZUELA C.A.
}


def delete_company(table, company: dict) -> None:
    company_id = int(company["id"])
    for item in items_for_company(company):
        table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    table.delete_item(Key={"pk": "APPLICATION#pending", "sk": f"APPLICATION#{company_id}"})
    if company.get("status") == "publish":
        apply_catalog_delta(table, company, -1)


def main() -> None:
    seed_path = ROOT / "scripts" / "seed_published.json"
    rows = json.loads(seed_path.read_text(encoding="utf-8"))
    removed = [row for row in rows if int(row.get("id") or 0) in REMOVE_IDS]
    kept = [row for row in rows if int(row.get("id") or 0) not in REMOVE_IDS]
    for row in kept:
        company_id = int(row.get("id") or 0)
        if company_id in KEEP_IDS:
            print(f"KEEP  {company_id}\t{row.get('title')}")
    for row in removed:
        print(f"DROP  {int(row['id'])}\t{row.get('title')}")

    if removed:
        seed_path.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        companies = [normalize_listing(item) for item in kept]
        catalogs = build_catalogs(companies)
        catalog_path = ROOT / "site" / "data" / "catalogs.json"
        catalog_path.write_text(json.dumps(catalogs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    images_dir = ROOT / "site" / "images" / "afiliados"
    for company_id in sorted(REMOVE_IDS):
        image = images_dir / f"{company_id}.jpg"
        if image.exists():
            image.unlink()
            print(f"IMG   removed {image.name}")

    import boto3

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("cavedrepa-web-core")
    for company_id in sorted(REMOVE_IDS):
        profile = as_company(get_item(table, f"COMPANY#{company_id}", "PROFILE"))
        if not profile:
            print(f"DDB   missing COMPANY#{company_id}")
            continue
        delete_company(table, profile)
        print(f"DDB   deleted {company_id}\t{profile.get('name')}")

    print(json.dumps({"kept": len(kept), "removed_from_seed": len(removed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
