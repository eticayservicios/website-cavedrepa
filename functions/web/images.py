"""Normaliza fotos de afiliados al bloque 640x360 sin recortar."""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

SIZE = (640, 360)
CANVAS = (247, 251, 246)
PAD_X = 64
PAD_Y = 52


def fit_listing_image(data: bytes) -> bytes:
    image = Image.open(BytesIO(data))
    image = image.convert("RGB")
    inner = (SIZE[0] - PAD_X * 2, SIZE[1] - PAD_Y * 2)
    contained = ImageOps.contain(image, inner, method=Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", SIZE, CANVAS)
    left = (SIZE[0] - contained.width) // 2
    top = (SIZE[1] - contained.height) // 2
    canvas.paste(contained, (left, top))
    out = BytesIO()
    canvas.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue()
