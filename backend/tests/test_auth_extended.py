import re
import socketserver
import threading
import subprocess
import sys
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.session import get_session
from app.main import app
from app.models.auth_challenge import AuthChallenge, AuthLimit
from app.models.user import User
from app.services import auth as service
from app.services import mail
from app.core.config import get_settings

ACCOUNT = {"full_name": "An", "email": "an@example.com", "password": "password123"}


def register(client):
    assert client.post("/api/auth/register", json=ACCOUNT).status_code == 201
    return re.search(r"\b[0-9]{6}\b", client.outbox[-1][2]).group()


def verify(client, code, email=ACCOUNT["email"]):
    return client.post("/api/auth/verify-email", json={"email": email, "code": code})


def login(client, password="password123", email="an@example.com"):
    return client.post("/api/auth/token", data={"username": email, "password": password})


def reset_token(client):
    client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]})
    return client.outbox[-1][2].split("#token=")[1].split()[0]


def test_unverified_contract_and_single_use(client):
    code = register(client)
    assert login(client, "incorrect").status_code == 401
    response = login(client)
    assert response.status_code == 403 and response.json()["detail"]["code"] == "email_not_verified"
    assert verify(client, code, "other@example.com").status_code == 400
    assert verify(client, code).status_code == 200
    assert verify(client, code).status_code == 400
    assert login(client).status_code == 200


def test_resend_expiry_and_guess_budget(client, monkeypatch):
    clock = [service.now()]
    monkeypatch.setattr(service, "now", lambda: clock[0])
    old = register(client)
    response = client.post("/api/auth/resend-verification", json={"email": ACCOUNT["email"]})
    assert response.status_code == 429 and int(response.headers["retry-after"]) == 60
    for _ in range(3):
        assert verify(client, "invalid").status_code == 422
        assert verify(client, "000000" if old != "000000" else "111111").status_code == 400
    clock[0] += 61
    assert client.post("/api/auth/resend-verification", json={"email": ACCOUNT["email"]}).status_code == 200
    new = re.search(r"\b[0-9]{6}\b", client.outbox[-1][2]).group()
    assert verify(client, "000000" if new != "000000" else "111111").status_code == 400
    assert verify(client, "000000" if new != "000000" else "111111").status_code == 400
    assert verify(client, new).status_code == 429
    clock[0] += 301
    assert verify(client, new).status_code == 400  # expired


def test_recovery_reset_revokes_jwt(client, verify_account, db_engine):
    register(client); verify_account(ACCOUNT["email"])
    jwt = login(client).json()["access_token"]
    known = client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]})
    unknown = client.post("/api/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()
    old = client.outbox[-1][2].split("#token=")[1].split()[0]
    new = reset_token(client)
    assert client.post("/api/auth/reset-password", json={"token": old, "password": "replacement123"}).status_code == 400
    with Session(db_engine) as db:
        challenge = db.exec(select(AuthChallenge).where(AuthChallenge.purpose == "reset")).one()
        assert challenge.digest != new and len(challenge.digest) == 64
    assert client.post("/api/auth/reset-password", json={"token": new, "password": "replacement123"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": new, "password": "replacement123"}).status_code == 400
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {jwt}"}).status_code == 401
    assert login(client).status_code == 401
    assert login(client, "replacement123").status_code == 200


def test_reset_expired_and_purpose_bound(client, monkeypatch):
    clock = [service.now()]; monkeypatch.setattr(service, "now", lambda: clock[0])
    code = register(client)
    token = reset_token(client)
    assert verify(client, token).status_code == 422
    assert client.post("/api/auth/reset-password", json={"token": code * 4, "password": "replacement123"}).status_code == 400
    clock[0] += 901
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "replacement123"}).status_code == 400


def test_login_limits_normalization_expiry_and_success_clear(client, verify_account, monkeypatch):
    clock = [service.now()]; monkeypatch.setattr(service, "now", lambda: clock[0])
    register(client); verify_account(ACCOUNT["email"])
    for _ in range(4): assert login(client, "wrong", " AN@example.com ").status_code == 401
    assert login(client).status_code == 200  # clears failures
    for _ in range(4): assert login(client, "wrong").status_code == 401
    blocked = login(client, "wrong")
    assert blocked.status_code == 429 and blocked.headers["retry-after"] == "900"
    assert login(client).status_code == 429
    clock[0] += 901
    assert login(client).status_code == 200


def test_ip_limit_ignores_forwarded_headers(client):
    for i in range(60):
        response = client.post("/api/auth/token", data={"username": f"u{i}@example.com", "password": "wrong"}, headers={"X-Forwarded-For": f"10.0.0.{i}"})
        assert response.status_code == 401
    blocked = login(client)
    assert blocked.status_code == 429
    response = client.post("/api/auth/token", data={"username": "x@example.com", "password": "wrong"}, headers={"Origin": "http://localhost:5500"})
    assert response.headers["access-control-expose-headers"] == "Retry-After"


def test_delivery_failure_keeps_account_and_generic_recovery(client, db_engine, monkeypatch):
    def broken(*args): raise OSError("SMTP offline")
    monkeypatch.setattr("app.services.mail.send_mail", broken)
    result = client.post("/api/auth/register", json=ACCOUNT)
    assert result.status_code == 201 and result.json()["verification_delivery"] == "retry"
    with Session(db_engine) as db:
        assert not db.exec(select(User)).one().is_email_verified
    a = client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]})
    b = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert a.json() == b.json()


def test_file_database_restart_and_concurrent_redemption(tmp_path, monkeypatch, outbox):
    # New engine/client recreates process-local state; real SQLite connections race.
    path = tmp_path / "auth.sqlite"
    def engine(): return create_engine(f"sqlite:///{path.as_posix()}", connect_args={"check_same_thread": False, "timeout": 20})
    db = engine(); SQLModel.metadata.create_all(db)
    def dependency():
        with Session(db) as session: yield session
    app.dependency_overrides[get_session] = dependency
    try:
        with TestClient(app) as c:
            c.outbox = outbox
            code = register(c)
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: verify(c, code).status_code, range(2)))
            assert sorted(results) == [200, 400]
            token = reset_token(c)
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: c.post("/api/auth/reset-password", json={"token": token, "password": "replacement123"}).status_code, range(2)))
            assert sorted(results) == [200, 400]
            for _ in range(5): login(c, "wrong")
        db.dispose(); db = engine()
        with TestClient(app) as c:
            assert login(c, "replacement123").status_code == 429
    finally:
        app.dependency_overrides.clear(); db.dispose()


def test_resend_and_recovery_caps_and_expiry(client, monkeypatch):
    clock = [service.now()]; monkeypatch.setattr(service, "now", lambda: clock[0])
    register(client)
    for _ in range(5):
        clock[0] += 61
        assert client.post("/api/auth/resend-verification", json={"email": ACCOUNT["email"]}).status_code == 200
    assert client.post("/api/auth/resend-verification", json={"email": ACCOUNT["email"]}).status_code == 429
    for _ in range(5): assert client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]}).status_code == 200
    assert client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]}).status_code == 429
    clock[0] += 3601
    assert client.post("/api/auth/resend-verification", json={"email": ACCOUNT["email"]}).status_code == 200
    assert client.post("/api/auth/forgot-password", json={"email": ACCOUNT["email"]}).status_code == 200


def test_recovery_ip_cap_across_addresses(client):
    for i in range(30):
        assert client.post("/api/auth/forgot-password", json={"email": f"unknown{i}@example.com"}).status_code == 200
    assert client.post("/api/auth/forgot-password", json={"email": "different@example.com"}).status_code == 429


def test_validation_never_echoes_auth_secrets(client):
    secret = "sensitive-invalid-token"
    response = client.post("/api/auth/reset-password", json={"token": secret, "password": "short"})
    assert response.status_code == 422
    assert secret not in response.text and '"input"' not in response.text
    response = verify(client, "sensitive-invalid-otp")
    assert response.status_code == 422 and "sensitive-invalid-otp" not in response.text


def test_migration_existing_accounts_is_repeatable(tmp_path):
    path = tmp_path / "legacy.sqlite"
    db = create_engine(f"sqlite:///{path.as_posix()}")
    with db.begin() as c:
        c.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, email TEXT, password_hash TEXT, created_at DATETIME)"))
        c.execute(text("INSERT INTO users VALUES (1, 'A', 'a@example.com', 'hash', CURRENT_TIMESTAMP), (2, 'B', 'b@example.com', 'hash', CURRENT_TIMESTAMP)"))
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{path.as_posix()}"}
    command = [sys.executable, "-m", "app.db.migrate_auth"]
    cwd = Path(__file__).resolve().parents[1]
    for _ in range(2): subprocess.run(command, env=env, cwd=cwd, check=True, capture_output=True)
    with db.connect() as c:
        assert c.execute(text("SELECT is_email_verified, token_version, role FROM users")).all() == [
            (0, 0, "user"), (0, 0, "user")
        ]
        assert c.execute(text("SELECT date_of_birth, phone_number FROM users")).all() == [
            (None, None), (None, None)
        ]
    subprocess.run([*command, "--verify-email", "A@example.com"], env=env, cwd=cwd, check=True, capture_output=True)
    with db.connect() as c:
        assert c.execute(text("SELECT is_email_verified FROM users ORDER BY id")).all() == [(1,), (0,)]
    grant = [sys.executable, "-m", "scripts.grant_admin"]
    refused = subprocess.run([*grant, "b@example.com"], env=env, cwd=cwd, capture_output=True)
    assert refused.returncode != 0
    for _ in range(2):
        subprocess.run([*grant, "A@example.com"], env=env, cwd=cwd, check=True, capture_output=True)
    with db.connect() as c:
        assert c.execute(text("SELECT role, token_version FROM users ORDER BY id")).all() == [
            ("admin", 1), ("user", 0)
        ]
    db.dispose()


def test_real_smtp_adapter_with_local_capture(monkeypatch):
    captured = []
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            self.wfile.write(b"220 local capture\r\n")
            while line := self.rfile.readline():
                if line.upper().startswith(b"DATA"):
                    self.wfile.write(b"354 send message\r\n")
                    body = b""
                    while (part := self.rfile.readline()) != b".\r\n": body += part
                    captured.append(body)
                    self.wfile.write(b"250 accepted\r\n")
                elif line.upper().startswith(b"QUIT"):
                    self.wfile.write(b"221 bye\r\n"); break
                else: self.wfile.write(b"250 OK\r\n")
    from importlib import reload
    # Restore the real adapter just for this local socket integration check.
    with socketserver.TCPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        settings = get_settings()
        monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
        monkeypatch.setattr(settings, "smtp_port", server.server_address[1])
        try:
            reload(mail).send_mail("local@example.com", "Capture check", "Local SMTP message")
            assert b"Local SMTP message" in captured[0]
        finally: server.shutdown(); thread.join(timeout=2)
