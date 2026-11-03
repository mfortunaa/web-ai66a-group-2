import os

os.environ["SECRET_KEY"] = "eventy-test-only-secret-not-for-production-12345"
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
import re
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db.session import get_session
from app.main import app


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    messages = []
    monkeypatch.setattr("app.services.mail.send_mail", lambda *args: messages.append(args))
    return messages


@pytest.fixture
def verify_account(client, outbox):
    def verify(email):
        body = next(body for recipient, subject, body in reversed(outbox) if recipient == email.lower() and "verify" in subject)
        code = re.search(r"\b[0-9]{6}\b", body).group()
        assert client.post("/api/auth/verify-email", json={"email": email, "code": code}).status_code == 200
    return verify


@pytest.fixture
def db_engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(db_engine, outbox):
    def override_session():
        with Session(db_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        test_client.outbox = outbox
        yield test_client
    app.dependency_overrides.clear()
