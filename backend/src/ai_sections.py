"""
AI response formatters for src/routers/ai.py.

Converts raw model output into structured AiSection blocks.
"""

import json
import re
from typing import Any


def _coerce_sections(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    text = raw.strip()
    if not text:
        return []
    # Strip markdown code blocks (```json...``` or ```...```)
    text = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", text, flags=re.DOTALL).strip()
    # Try to extract JSON array if present
    match = re.search(r"(\[[\s\S]*\])", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    # Try to extract JSON object (single section) if present
    match = re.search(r"(\{[\s\S]*\})", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, dict):
                return [parsed]
        except json.JSONDecodeError:
            pass
    # Fallback: single text section
    return [{"type": "text", "title": "Ответ", "text": text}]
