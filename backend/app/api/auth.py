from typing import Annotated
import hmac

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.session import get_session
from app.models.auth_challenge import AuthChallenge
from app.models.user import User
from app.schemas.auth import EmailRequest, RegisterRequest, RegistrationResponse, ResetRequest, TokenResponse, UserPublic, VerifyRequest
from app.services import auth as service

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
SessionDep = Annotated[Session, Depends(get_session)]
RECOVERY_MESSAGE = "If eligible, an email will arrive shortly. Check your inbox or try again later."


def ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def find_user(session, email):
    return session.exec(select(User).where(User.email == str(email).strip().lower())).first()


@router.post("/register", response_model=RegistrationResponse, status_code=201)
def register(data: RegisterRequest, request: Request, session: SessionDep):
    service.begin(session)
    service.limit(session, "register-ip", ip(request), 20, 3600)
    if find_user(session, data.email):
        session.commit()
        raise HTTPException(409, detail="An account with this email already exists")
    password_hash = hash_password(data.password)
    user = User(full_name=data.full_name, email=str(data.email).lower(), password_hash=password_hash)
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, detail="An account with this email already exists")
    secret = service.issue(session, user, "verify")
    session.commit()
    result = UserPublic.model_validate(user).model_dump()
    result["verification_delivery"] = "sent" if service.deliver(user.email, "verify", secret) else "retry"
    return result


@router.post("/token", response_model=TokenResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, session: SessionDep):
    try:
        email = str(TypeAdapter(EmailStr).validate_python(form.username.strip())).lower()
    except ValidationError:
        email = ""
    service.begin(session)
    service.limit(session, "login-ip", ip(request), 60, 900)
    counter = service.login_counter(session, email)
    user = find_user(session, email)
    if user is None or not verify_password(form.password, user.password_hash):
        counter.count += 1
        if counter.count >= 5:
            counter.blocked_until = service.now() + 900
            counter.window_end = counter.blocked_until
        session.add(counter)
        if counter.count >= 5:
            service.fail(session, 429, "rate_limited", retry_after=900)
        session.commit()
        raise HTTPException(401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if session.get(type(counter), counter.key):
        session.delete(counter)
    if not user.is_email_verified:
        service.fail(session, 403, "email_not_verified", action="verify-email")
    token = create_access_token(user.id, user.token_version)
    session.commit()
    return TokenResponse(access_token=token, expires_in=get_settings().access_token_expire_minutes * 60)


@router.post("/verify-email")
def verify_email(data: VerifyRequest, request: Request, session: SessionDep):
    service.begin(session)
    service.limit(session, "verify-ip", ip(request), 30, 900)
    email = str(data.email).lower()
    service.limit(session, "verify-guesses", email, 5, 300)
    user = find_user(session, email)
    challenge = session.get(AuthChallenge, f"verify:{user.id}") if user else None
    if not challenge or challenge.attempts >= 5:
        service.fail(session, 400, "invalid_challenge")
    challenge.attempts += 1
    session.add(challenge)
    if not hmac.compare_digest(challenge.digest, service.digest(f"verify:{user.id}:{data.code}")):
        service.fail(session, 400, "invalid_challenge")
    user.is_email_verified = True
    session.add(user)
    session.delete(challenge)
    session.commit()
    return {"message": "Email verified. Please log in."}


@router.post("/resend-verification")
def resend(data: EmailRequest, request: Request, session: SessionDep):
    service.begin(session)
    email = str(data.email).lower()
    service.limit(session, "resend-ip", ip(request), 30, 3600)
    service.limit(session, "resend-email", email, 5, 3600)
    user = find_user(session, email)
    secret = service.issue(session, user, "verify") if user and not user.is_email_verified else None
    session.commit()
    if secret and not service.deliver(email, "verify", secret):
        raise HTTPException(503, detail={"code": "delivery_failed"})
    return {"message": RECOVERY_MESSAGE}


@router.post("/forgot-password")
def forgot(data: EmailRequest, request: Request, session: SessionDep, background: BackgroundTasks):
    service.begin(session)
    email = str(data.email).lower()
    service.limit(session, "recovery-ip", ip(request), 30, 3600)
    service.limit(session, "recovery-email", email, 5, 3600)
    user = find_user(session, email)
    secret = service.issue(session, user, "reset") if user else None
    session.commit()
    if secret:
        background.add_task(service.deliver, email, "reset", secret)
    return {"message": RECOVERY_MESSAGE}


@router.post("/reset-password")
def reset(data: ResetRequest, request: Request, session: SessionDep):
    service.begin(session)
    service.limit(session, "reset-ip", ip(request), 30, 900)
    challenge = session.exec(select(AuthChallenge).where(AuthChallenge.purpose == "reset", AuthChallenge.digest == service.digest(data.token))).first()
    if not challenge:
        service.fail(session, 400, "invalid_challenge")
    user = session.get(User, challenge.user_id)
    if not user:
        service.fail(session, 400, "invalid_challenge")
    user.password_hash = hash_password(data.password)
    user.token_version += 1
    session.add(user)
    session.delete(challenge)
    session.commit()
    return {"message": "Password updated. Please log in."}


@router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
