"""Bounded authenticated HTTP load smoke test.

Usage:
    FOODLER_LOAD_TOKEN=... uv run python -m scripts.load_smoke \
        --base-url http://127.0.0.1:8000 --requests 100 --concurrency 10
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time

import httpx


async def _one_request(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    path: str,
) -> tuple[int, float]:
    async with semaphore:
        started = time.monotonic()
        response = await client.get(path)
        return response.status_code, time.monotonic() - started


async def run(base_url: str, path: str, requests: int, concurrency: int) -> int:
    token = os.getenv("FOODLER_LOAD_TOKEN")
    if not token:
        raise RuntimeError("FOODLER_LOAD_TOKEN is required")
    semaphore = asyncio.Semaphore(concurrency)
    timeout = httpx.Timeout(15)
    async with httpx.AsyncClient(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    ) as client:
        results = await asyncio.gather(
            *(_one_request(client, semaphore, path) for _ in range(requests))
        )
    statuses = [status for status, _ in results]
    durations = sorted(duration for _, duration in results)
    p95_index = min(len(durations) - 1, int(len(durations) * 0.95))
    sys.stdout.write(
        f"requests={requests} success={sum(status < 400 for status in statuses)} "
        f"median_ms={statistics.median(durations) * 1000:.1f} "
        f"p95_ms={durations[p95_index] * 1000:.1f}\n"
    )
    return 0 if all(status < 500 for status in statuses) else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--path", default="/api/receipts?limit=20")
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.requests <= 10_000:
        parser.error("--requests must be between 1 and 10000")
    if not 1 <= args.concurrency <= 100:
        parser.error("--concurrency must be between 1 and 100")
    return asyncio.run(run(args.base_url, args.path, args.requests, args.concurrency))


if __name__ == "__main__":
    raise SystemExit(main())
