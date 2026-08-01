"""
Tests for src/utils.py - Utility functions.
"""

import pytest

from src.utils import (
    validate_password,
    PasswordValidationError,
    get_password_requirements,
)


class TestValidatePassword:
    """Tests for password validation."""

    def test_valid_password_passes(self):
        """A password meeting all requirements should pass."""
        # Default: only min_length=8 is enforced
        validate_password("short123")  # > 8 chars, should pass

    def test_too_short_password(self):
        """Should raise for passwords shorter than min length."""
        with pytest.raises(PasswordValidationError) as exc:
            validate_password("Ab1!")
        assert "8" in str(exc.value.message) or "символов" in str(exc.value.message)

    def test_empty_password(self):
        """Should raise for empty password."""
        with pytest.raises(PasswordValidationError):
            validate_password("")

    def test_min_length_boundary(self):
        """Should accept password at minimum length."""
        validate_password("12345678")  # exactly 8 chars - should pass

    def test_unicode_password(self):
        """Should handle unicode characters."""
        # Even with unicode, just check length
        validate_password("привет123")  # > 8 chars, should pass


class TestGetPasswordRequirements:
    """Tests for password requirements endpoint."""

    def test_returns_dict(self):
        """Should return a dictionary of requirements."""
        reqs = get_password_requirements()
        assert isinstance(reqs, dict)

    def test_contains_min_length(self):
        """Should contain minLength key."""
        reqs = get_password_requirements()
        assert "minLength" in reqs
        assert reqs["minLength"] >= 1

    def test_contains_requirement_flags(self):
        """Should contain all requirement flags."""
        reqs = get_password_requirements()
        assert "requireUppercase" in reqs
        assert "requireLowercase" in reqs
        assert "requireDigit" in reqs
        assert "requireSpecial" in reqs
        assert isinstance(reqs["requireUppercase"], bool)
        assert isinstance(reqs["requireLowercase"], bool)
        assert isinstance(reqs["requireDigit"], bool)
        assert isinstance(reqs["requireSpecial"], bool)