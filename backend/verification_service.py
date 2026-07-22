"""Kayıt doğrulama: SMS ve e-posta kodları (mock veya Twilio/SMTP)."""

import os
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText


def _friendly_send_error(exc: Exception) -> str:
    raw = re.sub(r"\x1b\[[0-9;]*m", "", str(exc))
    lower = raw.lower()
    if "21408" in raw or "geo permission" in lower or "permission to send an sms" in lower:
        return (
            "Twilio hesabınızda Türkiye (+90) için SMS izni kapalı. "
            "Twilio Console → Messaging → Settings → Geo Permissions → "
            "Türkiye'yi etkinleştirin."
        )
    if "21608" in raw or "unverified" in lower:
        return (
            "Trial hesapta SMS yalnızca doğrulanmış numaralara gider. "
            "Twilio → Verified Caller IDs listesine numaranızı ekleyin."
        )
    if len(raw) > 220:
        return raw[:220] + "..."
    return raw or "Bilinmeyen gönderim hatası"

from werkzeug.security import check_password_hash, generate_password_hash

VERIFICATION_MOCK = os.getenv("VERIFICATION_MOCK", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)
CODE_TTL_MINUTES = int(os.getenv("VERIFICATION_CODE_TTL_MINUTES", "10"))


def normalize_phone(raw: str) -> str | None:
    """Türkiye telefon numarasını +90XXXXXXXXXX biçimine getirir."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("90") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+9{digits}"
    if len(digits) == 10 and digits.startswith("5"):
        return f"+90{digits}"
    return None


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return generate_password_hash(code)


def verify_code(code: str, code_hash: str) -> bool:
    return check_password_hash(code_hash, code)


def _twilio_configured() -> bool:
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID")
        and os.getenv("TWILIO_AUTH_TOKEN")
        and os.getenv("TWILIO_FROM_NUMBER")
    )


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def send_sms(phone: str, code: str) -> tuple[bool, str | None]:
    if VERIFICATION_MOCK or not _twilio_configured():
        print(f"[VERIFICATION_MOCK] SMS -> {phone}: {code}")
        return True, None

    try:
        from twilio.rest import Client

        client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN"),
        )
        client.messages.create(
            body=f"Etherescan kayıt doğrulama kodunuz: {code}",
            from_=os.getenv("TWILIO_FROM_NUMBER"),
            to=phone,
        )
        return True, None
    except Exception as e:
        return False, _friendly_send_error(e)


def send_email(to_email: str, code: str) -> tuple[bool, str | None]:
    if VERIFICATION_MOCK or not _smtp_configured():
        print(f"[VERIFICATION_MOCK] E-posta -> {to_email}: {code}")
        return True, None

    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user)

    msg = MIMEText(
        f"Etherescan kayıt doğrulama kodunuz: {code}\n\n"
        f"Bu kod {CODE_TTL_MINUTES} dakika geçerlidir."
    )
    msg["Subject"] = "Etherescan — Kayıt Doğrulama Kodu"
    msg["From"] = from_addr
    msg["To"] = to_email

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if port == 587:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())
        return True, None
    except Exception as e:
        return False, _friendly_send_error(e)


def verification_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)


def is_expired(expires_at) -> bool:
    if expires_at is None:
        return True
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires_at
