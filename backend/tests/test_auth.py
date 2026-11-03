from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import verify_password
from app.models.user import User

ACCOUNT = {"full_name": "  Nguyen An  ", "email": "An@example.com", "password": "password123"}


def test_registration_login_and_profile(client, db_engine, verify_account):
    response = client.post("/api/auth/register", json=ACCOUNT)
    assert response.status_code == 201
    assert response.json() == {"id": 1, "full_name": "Nguyen An", "email": "an@example.com", "is_email_verified": False, "verification_delivery": "sent"}
    verify_account("an@example.com")
    with Session(db_engine) as session:
        user = session.exec(select(User)).one()
        assert user.password_hash != ACCOUNT["password"]
        assert verify_password(ACCOUNT["password"], user.password_hash)
    token = client.post("/api/auth/token", data={"username": "AN@example.com", "password": ACCOUNT["password"]})
    assert token.status_code == 200
    assert token.json()["token_type"] == "bearer"
    assert token.json()["expires_in"] > 0
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json() == {"id": 1, "full_name": "Nguyen An", "email": "an@example.com", "is_email_verified": True}


def test_duplicate_email_case_insensitive(client):
    client.post("/api/auth/register", json=ACCOUNT)
    assert client.post("/api/auth/register", json={**ACCOUNT, "email": "an@example.com"}).status_code == 409


@pytest.mark.parametrize("changes", [
    {"email": "invalid"}, {"full_name": "   "}, {"password": "short"},
    {"password": "a" * 73}, {"password": "ế" * 25}, {"password": "abcd\x00efgh"},
])
def test_invalid_registration(client, changes):
    assert client.post("/api/auth/register", json={**ACCOUNT, **changes}).status_code == 422


@pytest.mark.parametrize("username,password", [
    ("an@example.com", "wrong"), ("missing@example.com", "password123"),
    ("invalid", "password123"), ("an@example.com", "a" * 73),
])
def test_invalid_credentials(client, username, password):
    client.post("/api/auth/register", json=ACCOUNT)
    response = client.post("/api/auth/token", data={"username": username, "password": password})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_missing_and_malformed_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer broken"}).status_code == 401


@pytest.mark.parametrize("kind", ["expired", "forged", "missing_exp", "bad_subject", "deleted_user"])
def test_reject_unusable_jwt(client, kind):
    client.post("/api/auth/register", json=ACCOUNT)
    now = datetime.now(timezone.utc)
    payload = {"sub": "1", "iat": now, "exp": now + timedelta(minutes=5)}
    secret = get_settings().secret_key
    if kind == "expired":
        payload["exp"] = now - timedelta(minutes=1)
    elif kind == "forged":
        secret = "different-signing-key-that-is-long-enough"
    elif kind == "missing_exp":
        del payload["exp"]
    elif kind == "bad_subject":
        payload["sub"] = "not-an-integer"
    elif kind == "deleted_user":
        payload["sub"] = "9999"
    token = jwt.encode(payload, secret, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_health_and_cors(client):
    assert client.get("/health").json() == {"status": "ok"}
    response = client.options("/api/auth/me", headers={
        "Origin": "http://localhost:5500", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5500"
    rejected = client.options("/api/auth/me", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET",
    })
    assert "access-control-allow-origin" not in rejected.headers


def test_frontend_is_served_without_shadowing_api(client):
    page = client.get("/")
    assert page.status_code == 200
    assert 'id="login-form"' in page.text
    assert client.get("/pages/register.html").status_code == 200
    assert client.get("/js/auth.js").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
