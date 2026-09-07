#!/usr/bin/env python3
"""Baja las fotos de ubicaciones del directorio de WordPress."""

from __future__ import annotations

import re
from html import unescape
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "images" / "ubicaciones"
WP_PAGE = "https://www.cavedrepa.org/directorio-ubicacion/"
CARD = re.compile(
    r'class="directorist-location__single[^"]*"(.*?)</div>\s*</div>\s*</div>',
    re.I | re.S,
)
IMG = re.compile(r'<img[^>]+src="([^"]+)"', re.I)
HREF = re.compile(r'href="https://www\.cavedrepa\.org/directorio-localizacion/([^"/]+)/?"', re.I)


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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    html = download(WP_PAGE).decode("utf-8", "replace")
    saved = 0
    for block in CARD.findall(html):
        href = HREF.search(block)
        img = IMG.search(block)
        if not href or not img:
            continue
        slug = unescape(href.group(1)).strip()
        url = unescape(img.group(1))
        dest = OUT / f"{slug}.jpg"
        try:
            dest.write_bytes(fit_cover(download(url)))
            saved += 1
            print(f"ok {slug}")
        except Exception as exc:
            print(f"fail {slug}: {exc}")
    print(f"saved {saved}")


if __name__ == "__main__":
    main()
