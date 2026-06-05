from __future__ import annotations

import re
from pathlib import Path


TEMPLATE_ROW = re.compile(
    r"^\|\s*`(?P<slug>[^`]+)`\s*\|\s*(?P<name>[^|]+?)\s*\|\s*(?P<pages>\d+)\s*\|\s*(?P<color>[^|]+?)\s*\|\s*(?P<description>[^|]+?)\s*\|$"
)


def parse_templates(index_path: Path) -> list[dict[str, object]]:
    templates: list[dict[str, object]] = []
    if not index_path.exists():
        return templates

    for line in index_path.read_text(encoding="utf-8").splitlines():
        match = TEMPLATE_ROW.match(line.strip())
        if not match:
            continue
        slug = match.group("slug").strip()
        templates.append(
            {
                "slug": slug,
                "name": match.group("name").strip(),
                "page_count": int(match.group("pages")),
                "primary_color": match.group("color").strip(),
                "description": match.group("description").strip(),
                "preview_url": f"/api/templates/{slug}/preview.png",
            }
        )
    return templates
