from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_PHONE = r"^\+?[0-9 .\-]+$"


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name is required")
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
    date_of_birth: date | None = None
    phone_number: str | None = None


class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date | None = None
    phone_number: str | None = Field(default=None, min_length=8, max_length=20, pattern=_PHONE)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name is required")
        return value

    @field_validator("phone_number", mode="before")
    @classmethod
    def clean_phone_number(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("phone_number")
    @classmethod
    def validate_phone_digits(cls, value: str | None) -> str | None:
        if value is not None:
            digits = sum(character in "0123456789" for character in value)
            if not 8 <= digits <= 15:
                raise ValueError("Phone number must contain between 8 and 15 digits")
        return value

    @field_validator("date_of_birth", mode="before")
    @classmethod
    def clean_date_of_birth(cls, value):
        return None if value == "" else value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyRequest(EmailRequest):
    code: str = Field(pattern=r"^[0-9]{6}$")


class ResetRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
