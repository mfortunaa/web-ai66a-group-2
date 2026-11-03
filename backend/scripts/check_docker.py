"""Exercise a disposable local demo account against real API + Mailpit containers.

Run: docker compose exec -T backend python -m scripts.check_docker
Creates test data; never prints OTPs, reset tokens, passwords or JWTs.
"""
import argparse
import json
import os
import re
import secrets
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def request(url, data=None, *, form=False, token=None):
    headers = {}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        data = (urlencode(data) if form else json.dumps(data)).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = urlopen(Request(url, data=data, headers=headers), timeout=15)
    except HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        try:
            body = json.loads(body)
        except ValueError:
            pass
        return response.status, body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-url", default="http://127.0.0.1:8000")
    parser.add_argument("--mail-url", default="http://mailpit:8025")
    parser.add_argument("--expected-origin", default=os.getenv("FRONTEND_URL", "http://localhost:8080"))
    args = parser.parse_args()
    api = args.app_url.rstrip("/")
    mailbox = args.mail_url.rstrip("/")
    email = f"docker-smoke-{secrets.token_hex(6)}@example.com"
    password, replacement = secrets.token_urlsafe(18), secrets.token_urlsafe(18)

    def post(action, data):
        return request(api + "/api/auth/" + action, data)

    def login(password):
        return request(api + "/api/auth/token", {"username": email, "password": password}, form=True)

    def message(subject):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            status, data = request(mailbox + "/api/v1/messages")
            assert status == 200, "Mailpit unavailable"
            for item in data["messages"]:
                if subject in item["Subject"] and any(to["Address"] == email for to in item["To"]):
                    return request(mailbox + "/api/v1/message/" + item["ID"])[1]["Text"]
            time.sleep(0.25)
        raise AssertionError("Email did not reach local Mailpit")

    assert request(api + "/health") == (200, {"status": "ok"})
    assert 'id="login-form"' in request(api + "/")[1]
    for page in ("verify-email", "forgot-password", "reset-password"):
        assert request(api + f"/pages/{page}.html")[0] == 200
    status, data = post("register", {"full_name": "Docker smoke test", "email": email, "password": password})
    assert status == 201 and data["verification_delivery"] == "sent", "Registration/delivery failed"
    assert login(password)[0] == 403, "Unverified account received a token"
    code = re.search(r"\b[0-9]{6}\b", message("verify your email")).group()
    assert post("verify-email", {"email": email, "code": code})[0] == 200
    assert post("verify-email", {"email": email, "code": code})[0] == 400
    status, data = login(password)
    assert status == 200
    old_token = data["access_token"]
    assert request(api + "/api/events", token=old_token)[0] == 200
    assert post("forgot-password", {"email": email})[0] == 200
    link = re.search(r"http\S+#token=(\S+)", message("reset your password"))
    assert link, "Reset link missing"
    assert link.group(0).startswith(args.expected_origin.rstrip("/") + "/pages/reset-password.html#token="), "Reset link has wrong browser origin"
    reset_token = link.group(1)
    assert post("reset-password", {"token": reset_token, "password": replacement})[0] == 200
    assert post("reset-password", {"token": reset_token, "password": replacement})[0] == 400
    assert request(api + "/api/auth/me", token=old_token)[0] == 401
    assert login(password)[0] == 401
    assert login(replacement)[0] == 200
    for _ in range(4):
        assert login("incorrect")[0] == 401
    assert login("incorrect")[0] == 429
    print("PASS: frontend, SMTP/OTP, reset, JWT revocation, event authorization and login limits")


if __name__ == "__main__":
    main()
