"""Google Play subscription verification through Android Publisher API v2."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout, ContentTypeError
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

from src.config import (
    GOOGLE_PLAY_PACKAGE_NAME,
    GOOGLE_PLAY_SERVICE_ACCOUNT_FILE,
    GOOGLE_PLAY_TIMEOUT_SECONDS,
)
from src.integrations.http import get_http_session

_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"


class GooglePlayError(RuntimeError):
    """Google Play verification is unavailable or returned invalid data."""


class GooglePlayGateway:
    def __init__(self) -> None:
        self._credentials: service_account.Credentials | None = None
        self._credentials_lock = asyncio.Lock()

    async def get_subscription(self, purchase_token: str) -> dict[str, Any]:
        if not GOOGLE_PLAY_PACKAGE_NAME or not GOOGLE_PLAY_SERVICE_ACCOUNT_FILE:
            raise GooglePlayError("Google Play is not configured")
        access_token = await self._access_token()
        package = quote(GOOGLE_PLAY_PACKAGE_NAME, safe="")
        token = quote(purchase_token, safe="")
        url = (
            "https://androidpublisher.googleapis.com/androidpublisher/v3/"
            f"applications/{package}/purchases/subscriptionsv2/tokens/{token}"
        )
        timeout = ClientTimeout(total=GOOGLE_PLAY_TIMEOUT_SECONDS)
        session = await get_http_session()
        try:
            async with session.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=timeout,
            ) as response:
                if not response.ok:
                    raise GooglePlayError("Google Play rejected verification")
                payload = await response.json()
        except (ClientError, ContentTypeError, TimeoutError, ValueError) as exc:
            raise GooglePlayError("Google Play verification failed") from exc
        if not isinstance(payload, dict):
            raise GooglePlayError("Google Play returned invalid data")
        return payload

    async def _access_token(self) -> str:
        async with self._credentials_lock:
            credentials = self._credentials
            if credentials is None:
                credential_path = Path(GOOGLE_PLAY_SERVICE_ACCOUNT_FILE)
                if not credential_path.is_file():
                    raise GooglePlayError("Google Play credentials are unavailable")
                try:
                    credentials = service_account.Credentials.from_service_account_file(
                        str(credential_path),
                        scopes=[_ANDROID_PUBLISHER_SCOPE],
                    )
                except (GoogleAuthError, OSError, ValueError) as exc:
                    raise GooglePlayError("Google Play credentials are invalid") from exc
                self._credentials = credentials
            if not credentials.valid:
                try:
                    await asyncio.to_thread(credentials.refresh, GoogleAuthRequest())
                except (GoogleAuthError, OSError, TimeoutError) as exc:
                    raise GooglePlayError("Google Play authentication failed") from exc
            if not credentials.token:
                raise GooglePlayError("Google Play did not return an access token")
            return credentials.token


google_play_gateway = GooglePlayGateway()


def get_google_play_gateway() -> GooglePlayGateway:
    return google_play_gateway
