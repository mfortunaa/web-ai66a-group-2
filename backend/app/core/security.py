from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("$argon2"):
        try:
            return password_hasher.verify(password_hash, password)
        except (InvalidHashError, VerificationError):
            return False

    encoded = password.encode("utf-8")
    if not password_hash.startswith(("$2a$", "$2b$", "$2y$")) or len(encoded) > 72 or b"\x00" in encoded:
        return False
    try:
        return bcrypt.checkpw(encoded, password_hash.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def create_access_token(user_id: int, token_version: int = 0) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "ver": token_version, "iat": now, "exp": now + timedelta(minutes=settings.access_token_expire_minutes)},
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
            options={"require": ["sub", "exp", "iat", "ver"]},
        )
        user_id = int(payload["sub"])
        if user_id <= 0:
            raise ValueError("Invalid user ID")
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized
    user = session.get(User, user_id)
    if user is None or not user.is_email_verified or payload["ver"] != user.token_version:
        raise unauthorized
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
