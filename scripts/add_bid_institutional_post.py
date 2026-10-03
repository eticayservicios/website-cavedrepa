#!/usr/bin/env python3
"""Insert the BID institutional news post into site/data/blog.json and blog-side.json."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOG_JSON = ROOT / "site" / "data" / "blog.json"
SIDE_JSON = ROOT / "site" / "data" / "blog-side.json"
IMG_DEST = ROOT / "site" / "images" / "blog" / "3400.jpg"

POST = {
    "id": 3400,
    "slug": "cavedrepa-presente-encuentro-grupo-bid",
    "title": "CAVEDREPA presente en el Encuentro con el Grupo BID",
    "excerpt": (
        "Erick Hartkopf participó en la jornada del Consejo Nacional de Economía junto a "
        "representantes de BID Invest, enfocada en financiamiento e inversión para el sector privado."
    ),
    "content": (
        "<p>Nuestro Director, Erick Hartkopf, participó en el Encuentro con el Grupo BID, "
        "realizado en el marco del Consejo Nacional de Economía.</p>"
        "<p>La jornada reunió a representantes del sector público, la banca, gremios empresariales "
        "y la delegación de BID Invest para dialogar sobre mecanismos de financiamiento, inversión "
        "y oportunidades para fortalecer a las empresas privadas venezolanas.</p>"
        "<p>Durante el encuentro, se abordaron alternativas financieras y la importancia de contar "
        "con modelos de flujo de caja que permitan a las empresas estructurar proyectos sostenibles "
        "y acceder a nuevas fuentes de financiamiento.</p>"
    ),
    "date": "2026-10-02T10:09:22",
    "image_url": "/images/blog/3400.jpg",
    "categories": [
        {"name": "Actualidad institucional", "slug": "actualidad-institucional"},
        {"name": "Noticias", "slug": "noticias"},
        {"name": "2026", "slug": "2026"},
    ],
    "status": "publish",
}


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src and src.is_file():
        IMG_DEST.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, IMG_DEST)
        print(f"Copied image to {IMG_DEST}")
    elif not IMG_DEST.is_file():
        print(
            "Warning: no image at site/images/blog/3400.jpg. "
            "Pass the WhatsApp JPEG path as the first argument.",
            file=sys.stderr,
        )

    data = json.loads(BLOG_JSON.read_text(encoding="utf-8"))
    posts = data.get("posts") or []
    posts = [p for p in posts if p.get("id") != POST["id"] and p.get("slug") != POST["slug"]]
    posts.insert(0, POST)
    data["posts"] = posts
    data["total"] = len(posts)
    card = {k: POST[k] for k in ("id", "slug", "title", "excerpt", "date", "image_url", "categories")}
    recent = data.get("recent") or []
    recent = [r for r in recent if r.get("id") != POST["id"]]
    recent.insert(0, card)
    data["recent"] = recent[:5]
    cats = data.get("categories") or []
    slug = "actualidad-institucional"
    found = False
    for item in cats:
        if item.get("slug") == slug:
            item["count"] = int(item.get("count") or 0) + 1
            found = True
            break
    if not found:
        cats.append({"name": "Actualidad institucional", "slug": slug, "count": 1})
    data["categories"] = cats
    BLOG_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    side = json.loads(SIDE_JSON.read_text(encoding="utf-8"))
    side_recent = side.get("recent") or []
    side_recent = [r for r in side_recent if r.get("id") != POST["id"]]
    side_recent.insert(
        0,
        {
            "id": POST["id"],
            "slug": POST["slug"],
            "title": POST["title"],
            "date": POST["date"],
            "image_url": POST["image_url"],
        },
    )
    side["recent"] = side_recent[:5]
    side_cats = side.get("categories") or []
    side_found = False
    for item in side_cats:
        if item.get("slug") == slug:
            item["count"] = int(item.get("count") or 0) + 1
            side_found = True
            break
    if not side_found:
        side_cats.append({"name": "Actualidad institucional", "slug": slug, "count": 1})
    side["categories"] = side_cats
    SIDE_JSON.write_text(json.dumps(side, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Updated blog.json and blog-side.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
