#!/usr/bin/env python3
"""Validate the directly deployable static site without third-party packages."""

from __future__ import annotations

import html
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SKIP_PARTS = {".git", ".github", "delete_later", "scripts", "_site"}
ORIGIN = "https://northatlantaautomotive.com"


def public_files(pattern: str) -> list[Path]:
    return sorted(
        path for path in ROOT.rglob(pattern)
        if not any(part in SKIP_PARTS for part in path.relative_to(ROOT).parts)
    )


def route_file(url_path: str, source: Path) -> Path:
    decoded = unquote(url_path)
    target = ROOT / decoded.lstrip("/") if decoded.startswith("/") else source.parent / decoded
    if decoded.endswith("/"):
        target /= "index.html"
    return target.resolve()


def main() -> int:
    pages = public_files("*.html")
    errors: list[str] = []
    warnings: list[str] = []
    titles: dict[str, list[str]] = defaultdict(list)
    canonicals: dict[str, list[str]] = defaultdict(list)

    for page in pages:
        rel = page.relative_to(ROOT).as_posix()
        text = page.read_text(encoding="utf-8")
        ids = set(re.findall(r'\sid=["\']([^"\']+)["\']', text, re.I))

        title_match = re.search(r"<title>(.*?)</title>", text, re.I | re.S)
        if not title_match:
            errors.append(f"{rel}: missing <title>")
        else:
            titles[html.unescape(title_match.group(1)).strip()].append(rel)

        canonical_match = re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
            text,
            re.I,
        )
        if page.name != "404.html":
            if not canonical_match:
                errors.append(f"{rel}: missing canonical URL")
            else:
                canonical = html.unescape(canonical_match.group(1))
                canonicals[canonical].append(rel)
                expected = "/" if rel == "index.html" else "/" + rel.removesuffix("index.html")
                if canonical != ORIGIN + expected:
                    errors.append(f"{rel}: canonical is {canonical}; expected {ORIGIN + expected}")

        for attr, raw in re.findall(
            r'\b(href|src|action|poster)=["\']([^"\']+)["\']', text, re.I
        ):
            value = html.unescape(raw.strip())
            parsed = urlsplit(value)
            if parsed.scheme in {"http", "https", "mailto", "tel", "sms", "data", "javascript"}:
                continue
            if value.startswith("//"):
                continue
            if not parsed.path:
                if parsed.fragment and parsed.fragment not in ids:
                    errors.append(f"{rel}: missing fragment target #{parsed.fragment}")
                continue
            target = route_file(parsed.path, page)
            if not target.exists():
                errors.append(f"{rel}: broken {attr}={raw}")
            elif parsed.fragment and target == page.resolve() and parsed.fragment not in ids:
                errors.append(f"{rel}: missing fragment target #{parsed.fragment}")

    for title, owners in titles.items():
        if title and len(owners) > 1:
            errors.append(f"duplicate title {title!r}: {', '.join(owners)}")
    for canonical, owners in canonicals.items():
        if len(owners) > 1:
            errors.append(f"duplicate canonical {canonical}: {', '.join(owners)}")

    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists():
        errors.append("missing sitemap.xml")
    else:
        xml = sitemap.read_text(encoding="utf-8")
        sitemap_urls = re.findall(r"<loc>(.*?)</loc>", xml)
        if len(sitemap_urls) != len(set(sitemap_urls)):
            errors.append("sitemap.xml contains duplicate URLs")
        for url in sitemap_urls:
            parsed = urlsplit(html.unescape(url))
            if parsed.netloc != "northatlantaautomotive.com":
                errors.append(f"sitemap has unexpected host: {url}")
                continue
            target = route_file(parsed.path, ROOT / "index.html")
            if not target.exists():
                errors.append(f"sitemap URL has no page: {url}")

    print(f"Audited {len(pages)} HTML pages.")
    if warnings:
        print("\nWarnings:")
        print("\n".join(f"- {item}" for item in warnings))
    if errors:
        print("\nErrors:")
        print("\n".join(f"- {item}" for item in errors))
        return 1
    print("All internal links, assets, fragments, canonicals, titles, and sitemap entries passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

