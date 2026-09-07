#!/usr/bin/env python3
"""Baja las fotos de afiliados y las recorta a 640x360 en site/images/afiliados/."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
LISTINGS = ROOT / "data" / "listings.json"
SEED = ROOT / "scripts" / "seed_published.json"
OUT = ROOT / "site" / "images" / "afiliados"
SIZE = (640, 360)


def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "cavedrepa-migration"})
    with urlopen(req, timeout=30) as response:
        return response.read()


def save_cover(data: bytes, dest: Path) -> None:
    image = Image.open(BytesIO(data))
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    else:
        image = image.convert("RGB")
    fitted = ImageOps.fit(image, SIZE, method=Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    fitted.save(dest, "JPEG", quality=85, optimize=True)


def main() -> None:
    listings = json.loads(LISTINGS.read_text(encoding="utf-8"))
    saved = 0
    for item in listings:
        if item.get("status") != "publish":
            continue
        url = item.get("image_url") or ""
        if not url.startswith("http"):
            continue
        dest = OUT / f"{item['id']}.jpg"
        local = f"/images/afiliados/{item['id']}.jpg"
        if not dest.exists():
            try:
                save_cover(download(url), dest)
            except Exception as exc:
                print("fail", item["id"], exc)
                continue
        item["image_url"] = local
        saved += 1
        print("ok", item["id"], dest.name)

    LISTINGS.write_text(json.dumps(listings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    published = [item for item in listings if item.get("status") == "publish"]
    SEED.write_text(json.dumps(published, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("saved", saved, "seed", len(published))


if __name__ == "__main__":
    main()
