#!/usr/bin/env python3
"""Concatena los JS del sitio y falla si hay un SyntaxError."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SCRIPTS = [
    SITE / "js" / "config.js",
    SITE / "js" / "api.js",
    SITE / "js" / "main.js",
    SITE / "js" / "directory.js",
    SITE / "js" / "affiliate.js",
    SITE / "js" / "blog.js",
    SITE / "js" / "sitios.js",
]


def main() -> None:
    missing = [str(path) for path in SCRIPTS if not path.exists()]
    if missing:
        raise SystemExit(f"Faltan scripts: {', '.join(missing)}")

    bundle = "\n;\n".join(path.read_text(encoding="utf-8") for path in SCRIPTS)
    proc = subprocess.run(
        ["node", "--check"],
        input=bundle,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout or "JS inválido\n")
        raise SystemExit(1)
    print("ok site js")


if __name__ == "__main__":
    main()
