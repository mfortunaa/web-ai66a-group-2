from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, String
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),)

    id: int | None = Field(default=None, primary_key=True)
    full_name: str = Field(max_length=100)
    email: str = Field(index=True, unique=True, max_length=254)
    password_hash: str
    is_email_verified: bool = False
    token_version: int = 0
    role: str = Field(default="user", sa_column=Column(String(5), nullable=False, server_default="user"))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
