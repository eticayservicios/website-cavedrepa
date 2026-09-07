#!/usr/bin/env python3
"""Baja las fotos de afiliados y las encaja completas en 640x360."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from images import fit_listing_image  # noqa: E402

LISTINGS = ROOT / "data" / "listings.json"
SEED = ROOT / "scripts" / "seed_published.json"
OUT = ROOT / "site" / "images" / "afiliados"


def parse_ids(value) -> list[int]:
    if not value:
        return []
    if str(value).isdigit():
        return [int(value)]
    return [int(item) for item in re.findall(r's:\d+:"(\d+)"', str(value))]


def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "cavedrepa-migration"})
    with urlopen(req, timeout=30) as response:
        return response.read()


def media_url(media_id: int) -> str:
    url = f"https://www.cavedrepa.org/wp-json/wp/v2/media/{media_id}"
    req = Request(url, headers={"User-Agent": "cavedrepa-migration"})
    with urlopen(req, timeout=20) as response:
        payload = json.loads(response.read().decode())
    return payload.get("source_url") or ""


def source_url(item: dict) -> str:
    current = item.get("image_url") or ""
    if current.startswith("http"):
        return current
    meta = item.get("meta") or {}
    for key in ("_listing_prv_img", "_thumbnail_id", "_listing_img"):
        for media_id in parse_ids(meta.get(key)):
            try:
                url = media_url(media_id)
            except Exception:
                url = ""
            if url:
                return url
            time.sleep(0.05)
    return ""


def main() -> None:
    listings = json.loads(LISTINGS.read_text(encoding="utf-8"))
    saved = 0
    OUT.mkdir(parents=True, exist_ok=True)
    for item in listings:
        if item.get("status") != "publish":
            continue
        url = source_url(item)
        if not url:
            print("miss", item["id"])
            continue
        dest = OUT / f"{item['id']}.jpg"
        try:
            dest.write_bytes(fit_listing_image(download(url)))
        except Exception as exc:
            print("fail", item["id"], exc)
            continue
        item["image_url"] = f"/images/afiliados/{item['id']}.jpg"
        saved += 1
        print("ok", item["id"])

    LISTINGS.write_text(json.dumps(listings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    published = [item for item in listings if item.get("status") == "publish"]
    SEED.write_text(json.dumps(published, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("saved", saved, "seed", len(published))


if __name__ == "__main__":
    main()
