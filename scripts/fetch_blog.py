#!/usr/bin/env python3
"""Baja las entradas públicas de WordPress y arma el seed del blog."""

from __future__ import annotations

import json
import sys
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "scripts" / "seed_blog.json"
OUT_IMG = ROOT / "site" / "images" / "blog"
WP = "https://www.cavedrepa.org/wp-json/wp/v2/posts"


def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "cavedrepa-migration"})
    with urlopen(req, timeout=40) as response:
        return response.read()


def fit_cover(data: bytes) -> bytes:
    image = Image.open(BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image = ImageOps.fit(image, (960, 540), method=Image.Resampling.LANCZOS)
    out = BytesIO()
    image.save(out, "JPEG", quality=82, optimize=True)
    return out.getvalue()


def featured_url(post: dict) -> str:
    media = ((post.get("_embedded") or {}).get("wp:featuredmedia") or [{}])[0]
    if isinstance(media, dict):
        return media.get("source_url") or ""
    return ""


def categories(post: dict) -> list[dict[str, str]]:
    groups = (post.get("_embedded") or {}).get("wp:term") or []
    items = groups[0] if groups else []
    return [{"name": item.get("name") or "", "slug": item.get("slug") or ""} for item in items if item.get("slug")]


def main() -> None:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    posts = []
    page = 1
    while True:
        url = f"{WP}?per_page=50&page={page}&_embed=1&status=publish"
        try:
            payload = json.loads(download(url).decode())
        except Exception as exc:
            if page == 1:
                raise
            print("stop", page, exc)
            break
        if not payload:
            break
        for raw in payload:
            item = {
                "id": raw["id"],
                "slug": raw.get("slug") or "",
                "status": raw.get("status") or "publish",
                "date": raw.get("date") or "",
                "modified": raw.get("modified") or "",
                "title": (raw.get("title") or {}).get("rendered") or "",
                "excerpt": (raw.get("excerpt") or {}).get("rendered") or "",
                "content": (raw.get("content") or {}).get("rendered") or "",
                "categories": categories(raw),
                "image_url": "",
            }
            src = featured_url(raw)
            dest = OUT_IMG / f"{item['id']}.jpg"
            if src:
                try:
                    dest.write_bytes(fit_cover(download(src)))
                    item["image_url"] = f"/images/blog/{item['id']}.jpg"
                except Exception as exc:
                    print("img-fail", item["id"], exc)
            posts.append(item)
            print("ok", item["id"], item["slug"][:60])
        if len(payload) < 50:
            break
        page += 1

    posts.sort(key=lambda item: item.get("date") or "", reverse=True)
    OUT_JSON.write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("saved", len(posts), "bytes", OUT_JSON.stat().st_size)


if __name__ == "__main__":
    sys.exit(main())
