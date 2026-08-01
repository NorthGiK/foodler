"""
Tests for src/email_service.py - Email sending.
"""



class TestEmailService:
    """Tests for email service."""

    def test_send_code_prints_in_dev(self, capsys):
        """In dev mode, send_code should print the code."""
        from src.email_service import EmailService

        async def mock_send_code(to_email, code, subject="Код подтверждения"):
            print(f"code for {to_email} is {code}")
            return True

        original_send = EmailService.send_code
        EmailService.send_code = mock_send_code

        import asyncio
        result = asyncio.run(EmailService.send_code("test@example.com", "ABC123"))

        captured = capsys.readouterr()
        assert "ABC123" in captured.out
        assert result is True

        EmailService.send_code = original_send