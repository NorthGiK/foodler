"""Small dependency-free Prometheus registry for core HTTP signals."""

from __future__ import annotations

from collections import defaultdict
from threading import Lock

_lock = Lock()
_request_count: dict[tuple[str, str, int], int] = defaultdict(int)
_duration_sum: dict[tuple[str, str], float] = defaultdict(float)
_duration_count: dict[tuple[str, str], int] = defaultdict(int)


def record_http_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    key = (method, route, status_code)
    duration_key = (method, route)
    with _lock:
        _request_count[key] += 1
        _duration_sum[duration_key] += duration_seconds
        _duration_count[duration_key] += 1


def _escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def render_prometheus() -> str:
    lines = [
        "# HELP foodler_http_requests_total Total HTTP requests.",
        "# TYPE foodler_http_requests_total counter",
    ]
    with _lock:
        for (method, route, status_code), count in sorted(_request_count.items()):
            lines.append(
                "foodler_http_requests_total"
                f'{{method="{_escape_label(method)}",route="{_escape_label(route)}",'
                f'status="{status_code}"}} {count}'
            )
        lines.extend(
            (
                "# HELP foodler_http_request_duration_seconds_sum "
                "Cumulative HTTP request duration.",
                "# TYPE foodler_http_request_duration_seconds_sum counter",
            )
        )
        for (method, route), duration in sorted(_duration_sum.items()):
            labels = f'method="{_escape_label(method)}",route="{_escape_label(route)}"'
            lines.append(f"foodler_http_request_duration_seconds_sum{{{labels}}} {duration:.6f}")
            lines.append(
                f"foodler_http_request_duration_seconds_count{{{labels}}} "
                f"{_duration_count[(method, route)]}"
            )
    return "\n".join(lines) + "\n"
