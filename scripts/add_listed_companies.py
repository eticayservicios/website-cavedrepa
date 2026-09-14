#!/usr/bin/env python3
"""Publica en el directorio las empresas listadas, con logo estándar si aún no tienen ficha."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from directory import (  # noqa: E402
    apply_catalog_delta,
    as_company,
    build_catalogs,
    default_expires_at,
    fold,
    get_item,
    normalize_listing,
    write_company,
)

PLACEHOLDER = "/images/afiliados/placeholder.png"
EXPIRES_AT = "2027-09-14"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
FIRST_NEW_ID = 4001

TARGETS = [
    {"name": "Agropecuaria Los Silitos, C.A.", "aliases": ["agropecuaria los silitos"]},
    {"name": "Agri Makro Ruedas, C.A.", "aliases": ["agri makro ruedas"]},
    {"name": "Servicios Internacionales Camacho, C.A.", "aliases": ["servicios internacionales camacho"]},
    {"name": "SERVINTECA, C.A.", "aliases": ["servinteca"]},
    {"name": "Zymco Bioindustrial, C.A.", "aliases": ["zymco bioindustrial"]},
    {"name": "Inversiones Pump E&B, C.A.", "aliases": ["inversiones pump e b", "inversiones pump eb"]},
    {"name": "INAGRINCA, C.A.", "aliases": ["inagrinca"]},
    {"name": "Transporte Doña María, C.A.", "aliases": ["transporte dona maria"]},
    {"name": "Maxifer de Venezuela, C.A.", "aliases": ["maxifer de venezuela"]},
    {"name": "Agropecuaria Speedway, C.A.", "aliases": ["agropecuaria speedway"]},
    {"name": "Genpar Representaciones, C.A.", "aliases": ["genpar representaciones"]},
    {"name": "Agroplus Venezuela, C.A.", "aliases": ["agroplus venezuela"]},
    {"name": "Euromac", "aliases": ["euromac", "euro mak"]},
    {"name": "Inversiones Taormina, C.A.", "aliases": ["inversiones taormina"]},
    {"name": "Agropecuaria Albisa, C.A.", "aliases": ["agropecuaria albisa"]},
    {"name": "Finarma, C.A.", "aliases": ["finarma"]},
    {"name": "Planta Procesadora de Arroz Guayabal, C.A.", "aliases": ["planta procesadora de arroz guayabal"]},
    {"name": "LC Landini Import, C.A.", "aliases": ["lc landini import"]},
    {"name": "Agrorepuestos JVP", "aliases": ["agrorepuestos jvp", "agro repuestos jvp"]},
    {"name": "VM Food Import, C.A.", "aliases": ["vm food import"]},
    {"name": "Agrosaka 5, C.A.", "aliases": ["agrosaka 5"]},
    {"name": "New Farmers Power, C.A.", "aliases": ["new farmers power"]},
    {"name": "MGM Motors & Pumps, C.A.", "aliases": ["mgm motors pumps"]},
    {"name": "Agroindustria HPB, C.A.", "aliases": ["agroindustria hpb"]},
    {"name": "Latin Tires Corp, C.A.", "aliases": ["latin tires corp"]},
    {
        "name": "Asociación Civil de Productores y Cultivadores Agrarios (APROCA)",
        "aliases": ["aproca", "asociacion civil de productores y cultivadores agrarios"],
    },
    {"name": "LC Tractor y Rodamientos, C.A.", "aliases": ["lc tractor y rodamientos"]},
    {"name": "Laureles Motors, C.A.", "aliases": ["laureles motors"]},
    {"name": "TodotractorCB, C.A.", "aliases": ["todotractorcb", "todo tractor cb"]},
]


def dump(path: Path, rows: list[dict]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")
    return slug or "empresa"


def name_key(value: str) -> str:
    text = fold(value).replace("&", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\b(c a|s a|corp)\b", " ", text)
    return " ".join(text.split())


def match_target(title: str) -> dict | None:
    key = name_key(title)
    for target in TARGETS:
        aliases = [name_key(target["name"]), *(name_key(alias) for alias in target["aliases"])]
        if key in aliases or key == name_key(target["name"]):
            return target
    return None


def unique_slug(base: str, taken: set[str]) -> str:
    slug = slugify(base)
    if slug not in taken:
        taken.add(slug)
        return slug
    index = 2
    while f"{slug}-{index}" in taken:
        index += 1
    candidate = f"{slug}-{index}"
    taken.add(candidate)
    return candidate


def promote_row(row: dict, target: dict, taken_slugs: set[str]) -> dict:
    updated = dict(row)
    meta = dict(row.get("meta") or {})
    meta["_expiry_date"] = f"{EXPIRES_AT} 00:00:00"
    meta["_listing_status"] = "post_status"
    updated["title"] = target["name"]
    updated["status"] = "publish"
    updated["modified"] = NOW
    updated["meta"] = meta
    updated["image_url"] = PLACEHOLDER
    updated["expires_at"] = EXPIRES_AT
    if not clean_slug(row.get("slug")):
        updated["slug"] = unique_slug(target["name"], taken_slugs)
    else:
        taken_slugs.add(clean_slug(row.get("slug")))
    return updated


def clean_slug(value) -> str:
    return slugify(str(value or "")) if value else ""


def stub_row(company_id: int, target: dict, taken_slugs: set[str]) -> dict:
    return {
        "id": company_id,
        "date": NOW,
        "modified": NOW,
        "status": "publish",
        "title": target["name"],
        "slug": unique_slug(target["name"], taken_slugs),
        "content": "",
        "excerpt": "",
        "author": 1,
        "meta": {
            "_featured": "0",
            "_listing_status": "post_status",
            "_expiry_date": f"{EXPIRES_AT} 00:00:00",
        },
        "tax": {
            "category": [{"name": "Sector Agrícola", "slug": "agricola"}],
            "location": [],
            "tags": [],
        },
        "image_url": PLACEHOLDER,
        "expires_at": EXPIRES_AT,
    }


def load_rows(name: str) -> list[dict]:
    path = ROOT / "scripts" / name
    return json.loads(path.read_text(encoding="utf-8"))


def copy_placeholder() -> None:
    source = Path.home() / ".cursor" / "projects" / "c-Users-migvz-OneDrive-Desktop-Data-upc-website-cavedrepa" / "assets" / "afiliado-placeholder.png"
    fallbacks = [
        source,
        ROOT / "assets" / "afiliado-placeholder.png",
        Path(r"C:\Users\migvz\.cursor\projects\c-Users-migvz-OneDrive-Desktop-Data-upc-website-cavedrepa\assets\afiliado-placeholder.png"),
    ]
    dest = ROOT / "site" / "images" / "afiliados" / "placeholder.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    for path in fallbacks:
        if path.exists():
            shutil.copyfile(path, dest)
            print(f"IMG   {dest}")
            return
    raise SystemExit("No está el placeholder de afiliado")


def prepare() -> dict:
    copy_placeholder()
    published = load_rows("seed_published.json")
    pending = load_rows("seed_pending.json")
    taken_slugs = {clean_slug(row.get("slug")) for row in published if row.get("slug")}
    taken_slugs.discard("")

    published_by_target: dict[str, dict] = {}
    for row in published:
        target = match_target(row.get("title") or "")
        if target:
            published_by_target[target["name"]] = row

    pending_keep = []
    promoted = []
    for row in pending:
        target = match_target(row.get("title") or "")
        if not target:
            pending_keep.append(row)
            continue
        if target["name"] in published_by_target:
            pending_keep.append(row)
            print(f"SKIP pending, already public  {row.get('id')}\t{row.get('title')}")
            continue
        updated = promote_row(row, target, taken_slugs)
        published.append(updated)
        published_by_target[target["name"]] = updated
        promoted.append(updated)
        print(f"PROMOTE  {updated['id']}\t{updated['title']}")

    used_ids = {int(row["id"]) for row in published + pending_keep + load_rows("seed_other.json")}
    next_id = max(FIRST_NEW_ID, max(used_ids) + 1)
    created = []
    for target in TARGETS:
        if target["name"] in published_by_target:
            row = published_by_target[target["name"]]
            if row["id"] not in {item["id"] for item in promoted}:
                print(f"KEEP    {row['id']}\t{row.get('title')}")
            continue
        while next_id in used_ids:
            next_id += 1
        row = stub_row(next_id, target, taken_slugs)
        published.append(row)
        published_by_target[target["name"]] = row
        used_ids.add(next_id)
        created.append(row)
        print(f"CREATE  {row['id']}\t{row['title']}")
        next_id += 1

    dump(ROOT / "scripts" / "seed_published.json", published)
    dump(ROOT / "scripts" / "seed_pending.json", pending_keep)
    companies = [normalize_listing(row) for row in published]
    catalogs = build_catalogs(companies)
    dump(ROOT / "site" / "data" / "catalogs.json", catalogs)

    summary = {
        "published": len(published),
        "pending": len(pending_keep),
        "promoted": [row["id"] for row in promoted],
        "created": [row["id"] for row in created],
        "already_public": [
            published_by_target[target["name"]]["id"]
            for target in TARGETS
            if target["name"] in published_by_target
            and published_by_target[target["name"]]["id"] not in {row["id"] for row in promoted + created}
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def import_to_dynamodb() -> None:
    import boto3

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("cavedrepa-web-core")
    published = load_rows("seed_published.json")
    written = 0
    skipped = 0
    for row in published:
        if not match_target(row.get("title") or ""):
            continue
        if (row.get("image_url") or "") != PLACEHOLDER:
            print(f"SKIP  {row['id']}\t{row.get('title')}\talready public")
            skipped += 1
            continue
        company = normalize_listing(row)
        if not company.get("expires_at"):
            company["expires_at"] = default_expires_at()
        previous = as_company(get_item(table, f"COMPANY#{company['id']}", "PROFILE"))
        write_company(table, company, previous)
        print(f"DDB   {company['id']}\t{company['name']}\t{previous.get('status') if previous else 'new'} -> publish")
        written += 1
    print(json.dumps({"written": written, "skipped_already_public": skipped}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-only", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    if args.import_only:
        import_to_dynamodb()
        return
    prepare()
    if not args.prepare_only:
        import_to_dynamodb()


if __name__ == "__main__":
    main()
