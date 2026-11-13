from datetime import datetime, timedelta, timezone

import jwt
import pytest
import bcrypt
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
    assert me.json() == {
        "id": 1, "full_name": "Nguyen An", "email": "an@example.com",
        "is_email_verified": True, "role": "user",
        "date_of_birth": None, "phone_number": None,
    }


def test_duplicate_email_case_insensitive(client):
    client.post("/api/auth/register", json=ACCOUNT)
    assert client.post("/api/auth/register", json={**ACCOUNT, "email": "an@example.com"}).status_code == 409


@pytest.mark.parametrize("changes", [
    {"email": "invalid"}, {"full_name": "   "}, {"password": "short"},
])
def test_invalid_registration(client, changes):
    assert client.post("/api/auth/register", json={**ACCOUNT, **changes}).status_code == 422


def test_long_passwords_work_for_registration_login_and_reset(client, verify_account):
    password = "ế" * 40
    assert client.post("/api/auth/register", json={**ACCOUNT, "password": password}).status_code == 201
    verify_account("an@example.com")
    assert client.post("/api/auth/token", data={"username": "an@example.com", "password": password}).status_code == 200

    token = client.post("/api/auth/forgot-password", json={"email": "an@example.com"})
    assert token.status_code == 200
    reset_token = client.outbox[-1][2].split("#token=")[1].split()[0]
    new_password = "🌓" * 25
    assert client.post("/api/auth/reset-password", json={"token": reset_token, "password": new_password}).status_code == 200
    assert client.post("/api/auth/token", data={"username": "an@example.com", "password": new_password}).status_code == 200


def test_profile_can_change_name_but_rejects_email(client, verify_account):
    client.post("/api/auth/register", json=ACCOUNT)
    verify_account("an@example.com")
    token = client.post("/api/auth/token", data={"username": "an@example.com", "password": ACCOUNT["password"]}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    updated = client.patch("/api/auth/me", headers=headers, json={"full_name": "  New Name  "})
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "New Name"
    assert updated.json()["email"] == "an@example.com"
    updated = client.patch("/api/auth/me", headers=headers, json={
        "full_name": "New Name", "date_of_birth": "2000-02-29", "phone_number": "+84 901 234 567",
    })
    assert updated.status_code == 200
    assert updated.json()["date_of_birth"] == "2000-02-29"
    assert updated.json()["phone_number"] == "+84 901 234 567"
    cleared = client.patch("/api/auth/me", headers=headers, json={
        "full_name": "New Name", "date_of_birth": "", "phone_number": "",
    })
    assert cleared.status_code == 200
    assert cleared.json()["date_of_birth"] is None
    assert cleared.json()["phone_number"] is None
    assert client.patch("/api/auth/me", headers=headers, json={"full_name": "New Name", "email": "changed@example.com"}).status_code == 422
    assert client.patch("/api/auth/me", headers=headers, json={
        "full_name": "New Name", "date_of_birth": "2999-01-01",
    }).status_code == 422
    assert client.patch("/api/auth/me", headers=headers, json={
        "full_name": "New Name", "phone_number": "123",
    }).status_code == 422
    assert client.get("/api/auth/me", headers=headers).json()["email"] == "an@example.com"


def test_legacy_bcrypt_hashes_remain_verifiable():
    legacy_hash = bcrypt.hashpw(b"legacy-password", bcrypt.gensalt()).decode()
    assert verify_password("legacy-password", legacy_hash)
    assert not verify_password("different-password", legacy_hash)
    assert not verify_password("x" * 73, legacy_hash)


def test_legacy_password_hash_upgrades_after_successful_login(client, verify_account, db_engine):
    client.post("/api/auth/register", json=ACCOUNT)
    verify_account("an@example.com")
    legacy_hash = bcrypt.hashpw(ACCOUNT["password"].encode(), bcrypt.gensalt()).decode()
    with Session(db_engine) as session:
        user = session.exec(select(User)).one()
        user.password_hash = legacy_hash
        session.add(user)
        session.commit()

    assert client.post("/api/auth/token", data={"username": "an@example.com", "password": ACCOUNT["password"]}).status_code == 200
    with Session(db_engine) as session:
        upgraded_hash = session.exec(select(User)).one().password_hash
    assert upgraded_hash.startswith("$argon2id$")
    assert verify_password(ACCOUNT["password"], upgraded_hash)


@pytest.mark.parametrize("username,password", [
    ("an@example.com", "wrong"), ("missing@example.com", "password123"),
    ("invalid", "password123"),
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
