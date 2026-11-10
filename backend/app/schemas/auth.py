from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name is required")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72 or "\x00" in value:
            raise ValueError("Password must not exceed 72 UTF-8 bytes or contain null characters")
        return value


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    is_email_verified: bool


class RegistrationResponse(UserPublic):
    verification_delivery: str


class UserProfile(UserPublic):
    role: Literal["user", "admin"]


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyRequest(EmailRequest):
    code: str = Field(pattern=r"^[0-9]{6}$")


class ResetRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=8, max_length=72)

    _password_rules = field_validator("password")(RegisterRequest.validate_password.__func__)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
