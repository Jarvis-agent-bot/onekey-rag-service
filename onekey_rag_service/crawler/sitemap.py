from __future__ import annotations

import xml.etree.ElementTree as ET

import httpx


async def fetch_sitemap_urls(client: httpx.AsyncClient, sitemap_url: str, *, max_nested: int = 20) -> list[str]:
    resp = await client.get(sitemap_url, follow_redirects=True, timeout=30)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    locs: list[str] = []

    for loc in root.iter():
        if loc.tag.endswith("loc") and loc.text:
            locs.append(loc.text.strip())

    root_tag = (root.tag or "").lower()
    is_index = root_tag.endswith("sitemapindex") or any((c.tag or "").lower().endswith("sitemap") for c in list(root))

    if is_index and max_nested > 0:
        urls: list[str] = []
        for child_sitemap in locs[:max_nested]:
            try:
                urls.extend(await fetch_sitemap_urls(client, child_sitemap, max_nested=0))
            except Exception:
                continue
        return urls

    return locs
