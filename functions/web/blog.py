"""Blog: modelo DynamoDB y consultas de entradas migradas de WordPress."""

from __future__ import annotations

import html
import re
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
