"""Optional SMTP notification. Unset SMTP_HOST is a no-op, not an error."""

import logging
import smtplib
from email.message import EmailMessage

from blixtbo.config import settings

log = logging.getLogger("blixtbo.support")


def mail_configured() -> bool:
    return bool((settings.smtp_host or "").strip())


def support_inbox() -> str:
    return (settings.support_email or "support@blixtbo.se").strip()


def owner_inbox() -> str:
    return (settings.owner_alert_email or support_inbox() or "support@blixtbo.se").strip()


def send_email(*, to: str, subject: str, body: str) -> bool:
    """Send one plain-text message. Returns False when mail is unset or the send fails.

    The log line is only the outcome. The body, the SMTP password and the API key are not logged.
    """
    host = (settings.smtp_host or "").strip()
    recipient = (to or "").strip()
    if not host or not recipient or "@" not in recipient:
        return False
    sender = (settings.smtp_from or settings.smtp_user or recipient).strip()
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = " ".join((subject or "").split())[:200] or "Blixtbo"
    message.set_content(body or "")
    try:
        with smtplib.SMTP(host, int(settings.smtp_port or 587), timeout=10) as client:
            if settings.smtp_tls:
                client.starttls()
            if (settings.smtp_user or "").strip():
                client.login(settings.smtp_user, settings.smtp_password)
            client.send_message(message)
    except Exception:
        log.info("support mail failed")
        return False
    log.info("support mail sent")
    return True
