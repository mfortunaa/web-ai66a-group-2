"""Persistent auth challenges and limits. Caller holds a SQLite write transaction."""
import hashlib
import hmac
import math
import secrets
import time

from fastapi import HTTPException
from sqlalchemy import delete, text
from sqlmodel import Session

from app.core.config import get_settings
from app.models.auth_challenge import AuthChallenge, AuthLimit
from app.services import mail


def now() -> float:
    return time.time()


def digest(value: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


def begin(session: Session) -> None:
    # Acquire the write lock BEFORE reading counters/challenges; works across processes.
    session.execute(text("BEGIN IMMEDIATE"))
    session.exec(delete(AuthLimit).where(AuthLimit.window_end <= now(), AuthLimit.blocked_until <= now()))
    session.exec(delete(AuthChallenge).where(AuthChallenge.expires_at <= now()))


def fail(session: Session, status: int, code: str, **detail):
    session.commit()  # Preserve guesses and limits even when returning an error.
    headers = {"Retry-After": str(detail["retry_after"])} if status == 429 else None
    raise HTTPException(status, detail={"code": code, **detail}, headers=headers)


def limit(session: Session, scope: str, identity: str, maximum: int, window: int) -> None:
    key = scope + ":" + digest(identity)
    row = session.get(AuthLimit, key)
    if row is None:
        row = AuthLimit(key=key, window_end=now() + window)
    if row.count >= maximum:
        fail(session, 429, "rate_limited", retry_after=max(1, math.ceil(row.window_end - now())))
    row.count += 1
    session.add(row)


def login_counter(session: Session, email: str) -> AuthLimit:
    key = "login-account:" + digest(email)
    row = session.get(AuthLimit, key)
    if row is None:
        row = AuthLimit(key=key, window_end=now() + 900)
    if row.blocked_until > now():
        fail(session, 429, "rate_limited", retry_after=math.ceil(row.blocked_until - now()))
    return row


def issue(session: Session, user, purpose: str) -> str:
    key = f"{purpose}:{user.id}"
    previous = session.get(AuthChallenge, key)
    if purpose == "verify" and previous and previous.issued_at + 60 > now():
        fail(session, 429, "rate_limited", retry_after=math.ceil(previous.issued_at + 60 - now()))
    secret = f"{secrets.randbelow(1000000):06d}" if purpose == "verify" else secrets.token_urlsafe(32)
    row = previous or AuthChallenge(key=key, user_id=user.id, purpose=purpose, digest="", expires_at=0, issued_at=0)
    row.digest = digest(f"{purpose}:{user.id}:{secret}") if purpose == "verify" else digest(secret)
    row.expires_at = now() + (300 if purpose == "verify" else 900)
    row.issued_at = now()
    row.attempts = 0
    session.add(row)
    return secret


def deliver(email: str, purpose: str, secret: str) -> bool:
    if purpose == "verify":
        subject, body = "Eventy: verify your email", f"Your verification code is {secret}. It expires in 5 minutes."
    else:
        # Fragment avoids putting the token into ordinary HTTP access logs.
        url = get_settings().frontend_url.rstrip("/") + "/pages/reset-password.html#token=" + secret
        subject, body = "Eventy: reset your password", f"Open this link within 15 minutes: {url}\nIgnore this email if you did not request it."
    try:
        mail.send_mail(email, subject, body)
        return True
    except (OSError, ValueError):
        return False
