"""Export the FastAPI schema deterministically for client generation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from src.main import app


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/export_openapi.py OUTPUT")

    output = Path(sys.argv[1]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
