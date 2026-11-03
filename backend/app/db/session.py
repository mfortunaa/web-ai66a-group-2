from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

database_url = get_settings().database_url
engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
)


def create_db_and_tables() -> None:
    # Import table models here so SQLModel knows them before creating tables.
    from app.models.user import User  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
