#!/usr/bin/env python3
"""Carga entradas del blog en DynamoDB cavedrepa-web-core."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "functions" / "web"))

from blog import items_for_post, normalize_post  # noqa: E402


def write_items(table, items: list[dict]) -> int:
    written = 0
    with table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as batch:
        for item in items:
            batch.put_item(Item=item)
            written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--posts", default=str(ROOT / "scripts" / "seed_blog.json"))
    parser.add_argument("--table", default="cavedrepa-web-core")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    path = Path(args.posts)
    if not path.exists():
        raise SystemExit(f"No está el archivo {path}")

    raw = json.loads(path.read_text(encoding="utf-8"))
    posts = [normalize_post(item) for item in raw]
    items = []
    for post in posts:
        items.extend(items_for_post(post))

    print(
        json.dumps(
            {
                "posts": len(posts),
                "items": len(items),
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
