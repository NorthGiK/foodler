"""Shared product-name normalization without ORM/import cycles."""

import re


def normalize_name(name: str) -> str:
    value = re.sub(r"[^\w\s%.\\/\\-]", "", name.lower().strip())
    return re.sub(r"\s+", " ", value).strip()
