"""
Tests for src/auth.py - JWT token management and authentication.
"""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt, JWTError

from src.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_user_optional,
)
from src.config import SECRET_KEY, ALGORITHM


class TestPasswordHashing:
    """Tests for password hashing and verification."""

    def test_hash_password_returns_hex_string(self):
        """hash_password should return a hex string."""
        hashed = hash_password("TestPass123!")
        assert isinstance(hashed, str)
        assert len(hashed) > 0
        # bcrypt hex-encoded hash starts with "243262243132" (which is "$2b$12$")
        assert hashed.startswith("24326224")

    def test_verify_password_correct(self):
        """verify_password should return True for correct password."""
        hashed = hash_password("TestPass123!")
        assert verify_password("TestPass123!", hashed) is True

    def test_verify_password_incorrect(self):
        """verify_password should return False for wrong password."""
        hashed = hash_password("TestPass123!")
        assert verify_password("WrongPassword!", hashed) is False

    def test_verify_password_empty(self):
        """verify_password should handle empty passwords."""
        hashed = hash_password("TestPass123!")
        assert verify_password("", hashed) is False

    def test_same_password_different_hashes(self):
        """Each password hash should be unique (different salt)."""
        hash1 = hash_password("TestPass123!")
        hash2 = hash_password("TestPass123!")
        assert hash1 != hash2

    def test_password_with_special_chars(self):
        """Handle passwords with special characters."""
        password = "P@ssw0rd!#$%^&*()"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True


class TestAccessToken:
    """Tests for JWT access token creation and verification."""

    def test_create_access_token_returns_string(self):
        """create_access_token should return a JWT string."""
        token = create_access_token("user_id_123")
        assert isinstance(token, str)
        assert len(token.split(".")) == 3  # JWT has 3 parts

    def test_create_access_token_contains_user_id(self):
        """Token payload should contain the user ID."""
        token = create_access_token("user_id_123")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "user_id_123"

    def test_create_access_token_has_correct_type(self):
        """Token should have 'access' type."""
        token = create_access_token("user_id_123")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == "access"

    def test_create_access_token_has_expiration(self):
        """Token should have expiration claim."""
        token = create_access_token("user_id_123")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload
        assert isinstance(payload["exp"], int)

    def test_create_access_token_expires(self):
        """Token from the past should be invalid."""
        expire = datetime.now(timezone.utc) - timedelta(hours=1)
        payload = {"sub": "user_id_123", "exp": expire, "type": "access"}
        expired_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

        with pytest.raises(JWTError):
            jwt.decode(expired_token, SECRET_KEY, algorithms=[ALGORITHM])

    def test_create_access_token_different_user_id_gives_different_token(self):
        """Tokens for different users should be different."""
        token1 = create_access_token("user_1")
        token2 = create_access_token("user_2")
        assert token1 != token2

    def test_invalid_token_signature(self):
        """Tokens with wrong signature should be rejected."""
        fake_token = jwt.encode(
            {"sub": "user_id_123", "exp": 9999999999, "type": "access"},
            "wrong_secret_key",
            algorithm=ALGORITHM,
        )
        with pytest.raises(JWTError):
            jwt.decode(fake_token, SECRET_KEY, algorithms=[ALGORITHM])


class TestRefreshToken:
    """Tests for refresh token creation."""

    def test_create_refresh_token_returns_string(self):
        """create_refresh_token should return a hex string."""
        token = create_refresh_token()
        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_refresh_token_has_min_length(self):
        """Refresh token should be at least 64 chars (two UUIDs)."""
        token = create_refresh_token()
        assert len(token) >= 64

    def test_create_refresh_token_unique(self):
        """Each refresh token should be unique."""
        token1 = create_refresh_token()
        token2 = create_refresh_token()
        assert token1 != token2

    def test_create_refresh_token_hex_chars(self):
        """Refresh token should contain only hex characters."""
        token = create_refresh_token()
        assert all(c in "0123456789abcdef" for c in token)


class TestGetCurrentUser:
    """Tests for get_current_user and get_current_user_optional."""

    @pytest.mark.asyncio
    async def test_get_current_user_valid_token(self, async_session, test_user, auth_headers):
        """Should return user for valid token."""
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=auth_headers["Authorization"].replace("Bearer ", ""),
        )
        user = await get_current_user(credentials, async_session)
        assert user.id == test_user.id
        assert user.email == test_user.email

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, async_session):
        """Should raise for invalid token."""
        from fastapi.security import HTTPAuthorizationCredentials
        from fastapi import HTTPException

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="invalid_token_here"
        )
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials, async_session)
        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_nonexistent_user(self, async_session):
        """Should raise if user does not exist."""
        from fastapi.security import HTTPAuthorizationCredentials
        from fastapi import HTTPException

        token = create_access_token("nonexistent_user_id")
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials, async_session)
        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_optional_no_token(self, async_session):
        """Should return None when no token provided."""
        user = await get_current_user_optional(credentials=None, db=async_session)
        assert user is None

    @pytest.mark.asyncio
    async def test_get_current_user_optional_invalid_token(self, async_session):
        """Should return None when invalid token provided."""
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid_token")
        user = await get_current_user_optional(credentials=credentials, db=async_session)
        assert user is None
