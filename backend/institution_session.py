"""Kurum oturumu, giriş kilidi ve token doğrulama."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

_INSTITUTION_SESSIONS: dict[str, dict] = {}
_LOGIN_ATTEMPTS: dict[str, dict] = {}

SESSION_HOURS = int(os.getenv("INSTITUTION_SESSION_HOURS", "8"))
MAX_LOGIN_ATTEMPTS = int(os.getenv("INSTITUTION_MAX_LOGIN_ATTEMPTS", "5"))
LOCKOUT_MINUTES = int(os.getenv("INSTITUTION_LOCKOUT_MINUTES", "15"))


def issue_token(
    institution_id: int,
    code: str,
    name: str,
    password_version: int,
) -> str:
    token = secrets.token_urlsafe(32)
    _INSTITUTION_SESSIONS[token] = {
        "institution_id": institution_id,
        "code": code.upper(),
        "name": name,
        "password_version": password_version,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
    }
    return token


def revoke_token(token: str | None) -> None:
    if token:
        _INSTITUTION_SESSIONS.pop(token, None)


def revoke_institution_sessions(institution_id: int) -> None:
    dead = [
        t
        for t, s in _INSTITUTION_SESSIONS.items()
        if s.get("institution_id") == institution_id
    ]
    for token in dead:
        _INSTITUTION_SESSIONS.pop(token, None)


def get_session(token: str | None) -> dict | None:
    if not token:
        return None
    session = _INSTITUTION_SESSIONS.get(token)
    if not session:
        return None
    expires_at = session.get("expires_at")
    if expires_at and datetime.now(timezone.utc) > expires_at:
        _INSTITUTION_SESSIONS.pop(token, None)
        return None
    return session


def validate_session(session: dict | None, password_version: int | None) -> bool:
    if not session:
        return False
    if password_version is not None and session.get("password_version") != password_version:
        return False
    return True


def check_login_allowed(code: str) -> tuple[bool, str | None]:
    key = (code or "").upper()
    entry = _LOGIN_ATTEMPTS.get(key)
    if not entry:
        return True, None
    locked_until = entry.get("locked_until")
    if locked_until and datetime.now(timezone.utc) < locked_until:
        mins = max(1, int((locked_until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        return False, f"Çok fazla hatalı giriş. {mins} dakika sonra tekrar deneyin."
    if locked_until and datetime.now(timezone.utc) >= locked_until:
        _LOGIN_ATTEMPTS.pop(key, None)
    return True, None


def record_login_failure(code: str) -> None:
    key = (code or "").upper()
    entry = _LOGIN_ATTEMPTS.setdefault(key, {"count": 0, "locked_until": None})
    entry["count"] = int(entry.get("count", 0)) + 1
    if entry["count"] >= MAX_LOGIN_ATTEMPTS:
        entry["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
        entry["count"] = 0


def record_login_success(code: str) -> None:
    _LOGIN_ATTEMPTS.pop((code or "").upper(), None)
