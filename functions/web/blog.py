"""Blog: modelo DynamoDB y consultas de entradas migradas de WordPress."""

from __future__ import annotations

import html
import re
import time
from datetime import datetime, timezone
from typing import Any

from directory import clean, dynamodb_safe, fold, get_item, paginate, query_pk

PAGE_SIZE = 12
CARD_FIELDS = ("id", "slug", "title", "excerpt", "date", "image_url", "categories")


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return clean(re.sub(r"\s+", " ", html.unescape(text)))


def clean_html(value: str) -> str:
    text = html.unescape(value or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", "", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", "", text, flags=re.I | re.S)
    return text.strip()


def terms(items: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    result = []
    seen: set[str] = set()
    for item in items or []:
        slug = clean(item.get("slug")).lower()
        name = clean(item.get("name"))
        if not slug or slug in seen:
            continue
        seen.add(slug)
        result.append({"name": name, "slug": slug})
    return result


def normalize_post(raw: dict[str, Any]) -> dict[str, Any]:
    title = strip_html(raw.get("title") if isinstance(raw.get("title"), str) else (raw.get("title") or {}).get("rendered") or "")
    excerpt = strip_html(raw.get("excerpt") if isinstance(raw.get("excerpt"), str) else (raw.get("excerpt") or {}).get("rendered") or "")
    content = raw.get("content") if isinstance(raw.get("content"), str) else (raw.get("content") or {}).get("rendered") or ""
    if not excerpt:
        excerpt = strip_html(content)[:220]
    post = {
        "id": int(raw["id"]),
        "slug": clean(raw.get("slug")).lower(),
        "title": title,
        "excerpt": excerpt,
        "content": clean_html(content),
        "date": clean(raw.get("date") or raw.get("published_at") or ""),
        "modified": clean(raw.get("modified") or ""),
        "image_url": clean(raw.get("image_url")),
        "categories": terms(raw.get("categories")),
        "status": clean(raw.get("status")) or "publish",
        "source": "wordpress",
    }
    if post["slug"] in {"", "__trashed"} or not post["title"]:
        post["status"] = "draft"
    post["search"] = fold(" ".join([post["title"], post["excerpt"], " ".join(item["name"] for item in post["categories"])]))
    return post


def card(post: dict[str, Any]) -> dict[str, Any]:
    return {field: post.get(field) for field in CARD_FIELDS}


def items_for_post(post: dict[str, Any]) -> list[dict[str, Any]]:
    post_id = post["id"]
    items = [
        {
            "pk": f"POST#{post_id}",
            "sk": "PROFILE",
            "entity": "post",
            **post,
        }
    ]
    if post.get("status") != "publish":
        return [dynamodb_safe(item) for item in items]
    summary = {"entity": "post_card", "search": post.get("search") or "", **card(post)}
    items.append({"pk": "BLOG#publish", "sk": f"POST#{post_id}", **summary})
    if post.get("slug"):
        items.append(
            {
                "pk": f"SLUG#post#{post['slug']}",
                "sk": "POST",
                "id": post_id,
                "slug": post["slug"],
            }
        )
    return [dynamodb_safe(item) for item in items]


def blog_categories(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for post in posts:
        for item in post.get("categories") or []:
            slug = item.get("slug") or ""
            if not slug:
                continue
            current = buckets.setdefault(slug, {"name": item.get("name") or slug, "slug": slug, "count": 0})
            current["count"] += 1
    return sorted(
        buckets.values(),
        key=lambda item: (
            0 if str(item["slug"]).isdigit() else 1,
            -int(item["slug"]) if str(item["slug"]).isdigit() else 0,
            fold(item["name"]),
        ),
    )


def search_blog(table, filters: dict[str, str]) -> dict[str, Any]:
    query = fold(filters.get("q"))
    category = clean(filters.get("categoria") or filters.get("category")).lower()
    rows = query_pk(table, "BLOG#publish")
    posts = []
    for row in rows:
        if query and query not in (row.get("search") or ""):
            continue
        posts.append(card(row))
    posts.sort(key=lambda item: item.get("date") or "", reverse=True)
    categories = blog_categories(posts)
    recent = posts[:5]
    if category:
        posts = [
            post
            for post in posts
            if category in {item.get("slug") for item in post.get("categories") or []}
        ]
    page_items, paging = paginate(posts, filters.get("page"), filters.get("per_page") or PAGE_SIZE)
    return {
        "ok": True,
        "total": paging["total"],
        "page": paging["page"],
        "pages": paging["pages"],
        "per_page": paging["per_page"],
        "categoria": category,
        "recent": recent,
        "categories": categories,
        "posts": page_items,
    }


def get_post(table, key: str) -> dict[str, Any] | None:
    raw = clean(key)
    if not raw:
        return None
    if raw.isdigit():
        item = get_item(table, f"POST#{int(raw)}", "PROFILE")
    else:
        pointer = get_item(table, f"SLUG#post#{raw.lower()}", "POST")
        if not pointer:
            return None
        item = get_item(table, f"POST#{int(pointer['id'])}", "PROFILE")
    if not item or item.get("status") != "publish":
        return None
    detail = {**card(item)}
    detail["content"] = item.get("content") or ""
    return detail


PROFILE_SKIP = {"pk", "sk", "entity"}


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def slugify_post(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")
    return slug or "entrada"


def as_post(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None
    post = {key: value for key, value in item.items() if key not in PROFILE_SKIP}
    if "id" in post:
        post["id"] = int(post["id"])
    return post


def scan_posts(table) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    kwargs = {
        "FilterExpression": "entity = :entity",
        "ExpressionAttributeValues": {":entity": "post"},
    }
    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items") or [])
        last = response.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def write_post(table, post: dict[str, Any], previous: dict[str, Any] | None = None) -> None:
    if previous:
        for item in items_for_post(previous):
            table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    for item in items_for_post(post):
        table.put_item(Item=item)


def post_summary(post: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(post.get("id") or 0),
        "slug": post.get("slug") or "",
        "title": post.get("title") or "",
        "excerpt": post.get("excerpt") or "",
        "date": post.get("date") or "",
        "status": post.get("status") or "draft",
        "categories": post.get("categories") or [],
        "image_url": post.get("image_url") or "",
    }


def list_admin_posts(table, filters: dict[str, str] | None = None) -> dict[str, Any]:
    filters = filters or {}
    wanted = clean(filters.get("status")).lower()
    query = fold(filters.get("q"))
    counts = {"all": 0, "publish": 0, "draft": 0}
    posts = []
    for item in scan_posts(table):
        post = as_post(item)
        if not post or not post.get("title"):
            continue
        status = post.get("status") or "draft"
        counts["all"] += 1
        if status == "publish":
            counts["publish"] += 1
        else:
            counts["draft"] += 1
        if wanted == "publish" and status != "publish":
            continue
        if wanted == "draft" and status == "publish":
            continue
        blob = fold(
            " ".join(
                [
                    str(post.get("title") or ""),
                    str(post.get("excerpt") or ""),
                    str(post.get("search") or ""),
                ]
            )
        )
        if query and query not in blob:
            continue
        posts.append(post_summary(post))
    posts.sort(key=lambda item: item.get("date") or "", reverse=True)
    return {"ok": True, "total": len(posts), "counts": counts, "posts": posts}


def get_admin_post(table, key: str) -> dict[str, Any] | None:
    raw = clean(key)
    if not raw.isdigit():
        return None
    return as_post(get_item(table, f"POST#{int(raw)}", "PROFILE"))


def categories_from_payload(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw = payload.get("categories")
    if isinstance(raw, list):
        items = raw
    else:
        items = [
            {"name": part.strip(), "slug": slugify_post(part)}
            for part in re.split(r"[,;/|]+", str(raw or ""))
            if part.strip()
        ]
    return terms(items)


def save_admin_post(table, payload: dict[str, Any], key: str = "") -> dict[str, Any]:
    title = strip_html(str(payload.get("title") or ""))[:200]
    if not title:
        return {"ok": False, "error": "Escribe un título."}
    content = clean_html(str(payload.get("content") or ""))[:50_000]
    excerpt = strip_html(str(payload.get("excerpt") or ""))[:400]
    if not excerpt:
        excerpt = strip_html(content)[:220]
    status = "publish" if clean(payload.get("status")).lower() == "publish" else "draft"
    now = now_stamp()
    date = clean(payload.get("date") or "") or now
    previous = get_admin_post(table, key) if key else None
    post_id = int(previous["id"]) if previous else int(time.time() * 1000)
    slug = slugify_post(str(payload.get("slug") or title))
    pointer = get_item(table, f"SLUG#post#{slug}", "POST")
    if pointer and int(pointer.get("id") or 0) != post_id:
        slug = f"{slug}-{post_id}"
    post = {
        "id": post_id,
        "slug": slug,
        "title": title,
        "excerpt": excerpt,
        "content": content,
        "date": date,
        "modified": now,
        "image_url": clean(payload.get("image_url") or (previous or {}).get("image_url") or ""),
        "categories": categories_from_payload(payload),
        "status": status,
        "source": (previous or {}).get("source") or "admin",
    }
    post["search"] = fold(
        " ".join([post["title"], post["excerpt"], " ".join(item["name"] for item in post["categories"])])
    )
    write_post(table, post, previous)
    return {"ok": True, "post": post}


def delete_admin_post(table, key: str) -> dict[str, Any]:
    post = get_admin_post(table, key)
    if not post:
        return {"ok": False, "error": "No se encontró esa entrada."}
    for item in items_for_post(post):
        table.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    return {"ok": True, "id": post["id"]}
