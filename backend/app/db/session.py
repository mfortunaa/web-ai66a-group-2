from sqlmodel import Session, SQLModel, create_engine, text

from app.core.config import get_settings

database_url = get_settings().database_url
engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
)


def create_db_and_tables() -> None:
    # Import table models here so SQLModel knows them before creating tables.
    from app.models.booking import Booking  # noqa: F401
    from app.models.event import Event, EventCover, EventIdCounter, EventSession  # noqa: F401
    from app.models.user import User  # noqa: F401
    from app.models.auth_challenge import AuthChallenge, AuthLimit  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


def begin_read(session: Session) -> None:
    # Read events and their session stock from the same SQLite snapshot.
    session.execute(text("BEGIN"))


def begin_write(session: Session) -> None:
    # SQLite's deferred transactions do not lock a row when it is read.
    session.execute(text("BEGIN IMMEDIATE"))
