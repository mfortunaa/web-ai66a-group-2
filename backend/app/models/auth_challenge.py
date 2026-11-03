from sqlmodel import Field, SQLModel


class AuthChallenge(SQLModel, table=True):
    # One current challenge per account/purpose; replacement invalidates the old one.
    key: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    purpose: str
    digest: str = Field(index=True)
    expires_at: float
    issued_at: float
    attempts: int = 0


class AuthLimit(SQLModel, table=True):
    key: str = Field(primary_key=True)
    count: int = 0
    window_end: float
    blocked_until: float = 0
