from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    full_name: str = Field(max_length=100)
    email: str = Field(index=True, unique=True, max_length=254)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
