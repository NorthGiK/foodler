import logging

import pytest

from src.email_service import _EmailService


@pytest.mark.asyncio
async def test_unconfigured_email_fails_without_exposing_code(monkeypatch, caplog, capsys):
    for name in ("SMTP_USER", "SMTP_PASSWORD", "FROM_EMAIL"):
        monkeypatch.setenv(name, "")
    service = _EmailService()

    with caplog.at_level(logging.WARNING):
        delivered = await service.send_code("private@example.com", "SECRET42")

    assert delivered is False
    output = capsys.readouterr()
    combined = output.out + output.err + caplog.text
    assert "SECRET42" not in combined
    assert "private@example.com" not in combined
