"""Plain-text mail for keep-alive. No-op until SMTP is configured.

Zoho (smtp.zoho.eu:465, support@blixtbo.se) is not set up yet. Leave the
variables empty and nothing is sent. The body is Swedish and has no secrets.
"""

import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger("blixtbo.mailer")

_disabled_logged = False


def smtp_configured() -> bool:
    return all(os.environ.get(name) for name in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"))


def reset_disabled_log() -> None:
    global _disabled_logged
    _disabled_logged = False


def send(to: str, subject: str, body: str) -> bool:
    """Send one plain-text message. Returns False when mail is off or the send fails."""
    global _disabled_logged
    host = os.environ.get("SMTP_HOST") or ""
    port = os.environ.get("SMTP_PORT") or ""
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    sender = os.environ.get("SMTP_FROM") or ""
    if not host or not port or not user or not password or not sender:
        if not _disabled_logged:
            log.info("mail_disabled")
            _disabled_logged = True
        return False
    if not to or "@" not in to:
        return False
    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject[:200]
    message.set_content(body)
    try:
        with smtplib.SMTP_SSL(host, int(port), timeout=20) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    except Exception:
        log.info("mail_failed")
        return False
    log.info("mail_sent")
    return True
