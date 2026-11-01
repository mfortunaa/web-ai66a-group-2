from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.session import get_session
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/register", response_model=UserPublic, status_code=201)
def register(data: RegisterRequest, session: SessionDep):
    user = User(full_name=data.full_name, email=str(data.email).lower(), password_hash=hash_password(data.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    session.refresh(user)
    return user


@router.post("/token", response_model=TokenResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep):
    # Match registration's email normalization while retaining OAuth2's username field.
    try:
        email = str(TypeAdapter(EmailStr).validate_python(form.username.strip())).lower()
    except ValidationError:
        email = ""
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=create_access_token(user.id), expires_in=get_settings().access_token_expire_minutes * 60)


@router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
