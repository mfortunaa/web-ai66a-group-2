from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    encoded = password.encode("utf-8")
    if len(encoded) > 72 or b"\x00" in encoded:
        return False
    try:
        return bcrypt.checkpw(encoded, password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.access_token_expire_minutes)},
        settings.secret_key,
        algorithm="HS256",
    )


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, get_settings().secret_key, algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat"]},
        )
        user_id = int(payload["sub"])
        if user_id <= 0:
            raise ValueError("Invalid user ID")
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized
    user = session.get(User, user_id)
    if user is None:
        raise unauthorized
    return user
