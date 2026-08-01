import asyncio
import base64
import binascii
import logging
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

logger = logging.getLogger(__name__)


class _EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "465"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)
        self.timeout_seconds = float(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))

    async def send_code(
        self,
        to_email: str,
        code: str,
        subject: str = "Код подтверждения",
    ) -> bool:
        """Send verification code via email"""
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.from_email
        msg["To"] = to_email

        msg.set_content(
            Path("index.html").read_text().replace("^^^", code[:4]).replace("***", code[4:]),
            subtype="html",
        )

        if not self.smtp_user or not self.smtp_password or not self.from_email:
            logger.warning("SMTP is not configured", extra={"provider": "smtp"})
            return False

        try:
            async with asyncio.timeout(self.timeout_seconds + 1):
                await asyncio.to_thread(self._send_message, msg)
            return True
        except (OSError, smtplib.SMTPException, TimeoutError):
            logger.warning("Email delivery failed", extra={"provider": "smtp"})
            return False

    async def send_feedback(
        self,
        from_email: str,
        text: str,
        images: list[str] | None = None,
    ) -> bool:
        """Send feedback email to SMTP_USER"""
        msg = EmailMessage()
        msg["Subject"] = f"Feedback from {from_email}"
        msg["From"] = self.from_email
        msg["To"] = self.smtp_user
        msg.set_content(text)

        if images:
            for i, img_b64 in enumerate(images):
                try:
                    img_data = base64.b64decode(img_b64)
                    maintype = "image"
                    subtype = "png"
                    msg.add_attachment(
                        img_data,
                        maintype=maintype,
                        subtype=subtype,
                        filename=f"image_{i}.{subtype}",
                    )
                except (binascii.Error, ValueError):
                    logger.warning("Feedback attachment rejected")

        if not self.smtp_user or not self.smtp_password or not self.from_email:
            logger.warning("SMTP is not configured", extra={"provider": "smtp"})
            return False
        try:
            async with asyncio.timeout(self.timeout_seconds + 1):
                await asyncio.to_thread(self._send_message, msg)
            return True
        except (OSError, smtplib.SMTPException, TimeoutError):
            logger.warning("Feedback delivery failed", extra={"provider": "smtp"})
            return False

    def _send_message(self, message: EmailMessage) -> None:
        with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=self.timeout_seconds) as smtp:
            smtp.login(self.smtp_user, self.smtp_password)
            smtp.send_message(message)


# Global instance
EmailService = _EmailService()
