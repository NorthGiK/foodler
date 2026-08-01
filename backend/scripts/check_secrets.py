"""Fail when the repository's secret-scan findings differ from the baseline."""

from __future__ import annotations

import difflib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / ".secrets.baseline"
EXCLUDED_FILES = (
    r"\.secrets\.baseline|mobile/package-lock\.json|backend/uv\.lock|"
    r"contracts/openapi\.json|mobile/src/api/generated/.*"
)


def _stable_results(document: dict[str, object]) -> str:
    return json.dumps(document.get("results", {}), indent=2, sort_keys=True) + "\n"


def main() -> int:
    scan = subprocess.run(
        [
            sys.executable,
            "-m",
            "detect_secrets",
            "-c",
            "1",
            "scan",
            "--exclude-files",
            EXCLUDED_FILES,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    expected = _stable_results(json.loads(BASELINE.read_text()))
    actual = _stable_results(json.loads(scan.stdout))
    if expected == actual:
        return 0

    sys.stderr.writelines(
        difflib.unified_diff(
            expected.splitlines(keepends=True),
            actual.splitlines(keepends=True),
            fromfile=str(BASELINE),
            tofile="current scan",
        )
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
