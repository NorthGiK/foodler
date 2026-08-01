"""Process-local pooled HTTP session shared by external-service adapters."""

from __future__ import annotations

import asyncio

from aiohttp import ClientSession

_session: ClientSession | None = None
_lock = asyncio.Lock()


async def get_http_session() -> ClientSession:
    global _session
    if _session is not None and not _session.closed:
        return _session
    async with _lock:
        if _session is None or _session.closed:
            _session = ClientSession()
    return _session


async def close_http_session() -> None:
    global _session
    if _session is not None and not _session.closed:
        await _session.close()
    _session = None
