import os
import smtplib
from email.message import EmailMessage
from pathlib import Path


class _EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "465"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)

        if not self.smtp_user or not self.smtp_password:
            # Fallback to file-based auth for development
            gmail_code_path = Path.home() / ".gmail_code"
            if gmail_code_path.exists():
                self.smtp_user = self.smtp_user or "loh228putin@gmail.com"
                self.smtp_password = (
                    self.smtp_password or gmail_code_path.read_text().strip()
                )

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

        msg.set_content(Path("index.html").read_text().replace("^^^", code[:4]).replace("***", code[4:]), subtype='html')

        try:
            with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port) as smtp:
                smtp.login(self.smtp_user, self.smtp_password)
                smtp.send_message(msg)
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            print(f"DEV MODE: Verification code for {to_email}: {code}")
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
                import base64
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
                except Exception:
                    pass

        try:
            with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port) as smtp:
                smtp.login(self.smtp_user, self.smtp_password)
                smtp.send_message(msg)
            return True
        except Exception as e:
            print(f"Failed to send feedback: {e}")
            return False


# Global instance
EmailService = _EmailService()