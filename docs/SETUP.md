# Local Setup & Authentication Handoff

## Requirements

Python 3.10+ and two terminals. The backend installs the `tzdata` timezone database package for `ZoneInfo` support on Windows. Run the following PowerShell commands from the repository root.

## 1. Install dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
python -c "import secrets; print(secrets.token_hex(32))"
```

Replace the placeholder `SECRET_KEY` in `backend/.env` with the generated value. Do not commit `.env`. The app refuses to start with a missing or placeholder key. Keep the same key between restarts to preserve existing tokens.

Seed sample events once before the demo. From the repository root:

```powershell
Set-Location backend
..\.venv\Scripts\python -m scripts.seed_events
Set-Location ..
```

The repeatable seed command adds or synchronizes the current sample events and their performance sessions. Before a presentation, run `python -m scripts.seed_events --refresh-demo-dates` from `backend/` to shift event dates to today while preserving the sample scenarios. Date refresh is blocked if it would change an event referenced by a booking; use a disposable demo database if you have test bookings. If you already ran an older version with fictional built-in samples, run `python -m scripts.seed_events --replace-old-samples` to remove only those known rows; the command refuses to remove referenced events.

## 2. Run the backend

```powershell
Set-Location backend
..\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000 --no-proxy-headers
```

Database paths in `DATABASE_URL` are relative to the backend working directory. The example creates `backend/eventy.db`, ignored by Git. Tables are created at startup.

- Health check: [localhost:8000/health](http://localhost:8000/health)
- Swagger UI: [localhost:8000/docs](http://localhost:8000/docs)

For the quickest demo, open [127.0.0.1:8000](http://127.0.0.1:8000). FastAPI also serves the frontend, so only one terminal is needed. API requests use the same origin in this mode. The separate frontend server below is optional.

## 3. Run the frontend (second terminal, repository root)

```powershell
python -m http.server 5500 --directory frontend
```

Open [localhost:5500](http://localhost:5500). Use the HTTP server rather than opening HTML files directly. If the backend URL changes, edit `frontend/js/config.js`. If the frontend origin changes, update the JSON list `CORS_ORIGINS` in `backend/.env` and restart the backend.

## 4. Verify the flow

1. Open the registration link and create an account with your name, email, and password.
2. Registration opens the verification screen. Read the six-digit OTP in the local SMTP inbox, then verify it.
3. Sign in after verification and open the event catalog. Login before verification offers the verification screen.
4. Reload the page: the session remains in this tab until the JWT expires (default: 30 minutes).
5. Log out, then open `/pages/events.html` directly: it redirects to login.
6. Check duplicate email, incorrect password, and mismatched password confirmation errors.

No shared test accounts are seeded. Create your own account through the registration form.

## Tests

From the repository root:

```powershell
Set-Location backend
..\.venv\Scripts\python -m pytest
```

Tests use isolated in-memory and temporary file SQLite databases and a test-only signing key. They do not modify the development database.

## Backend contract for teammates

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `POST /api/auth/register` | JSON: `full_name`, `email`, `password` | 201: `id`, `full_name`, `email`, `is_email_verified`, `verification_delivery` |
| `POST /api/auth/token` | Form data: `username` (email), `password` | 200: `access_token`, `token_type: bearer`, `expires_in` (seconds) |
| `GET /api/auth/me` | `Authorization: Bearer <access_token>` | 200: `id`, `full_name`, `email`, `is_email_verified` |

Use `from app.db.session import get_session` for the session dependency and `from app.core.security import get_current_user` for authenticated routes. The user table class is `app.models.user.User`. Add new routers to `app/main.py` and import new tables inside `create_db_and_tables()` in `app/db/session.py`.

Email is normalized to lowercase for registration and login. Passwords must have at least eight characters, no null characters, and at most 72 UTF-8 bytes, matching bcrypt's input limit. Errors: 409 duplicate email, 422 invalid registration, 401 invalid credentials/token. JWT uses HS256, a user ID `sub`, and required `iat`/`exp`/`ver` claims.

## Frontend contract for teammates

Import from `frontend/js/auth.js`: `getToken()`, `getCurrentUser()`, `requireAuth()`, `logout()`, and `clearToken()`. `requireAuth()` returns the user or redirects to login on 401; network/server failures remain visible to the calling page. Use `getToken()` in the `Authorization` header of event/booking requests. On their 401 responses, clear the token and redirect to `loginUrl`.

`config.js` owns the API base URL. Auth-specific Fetch code stays in `auth.js`; the future shared event/booking Fetch helper can use the same configuration. The temporary `events.html` and `account-page.js` should be replaced by the catalog owner, retaining the authentication guard and logout behavior. Auth styling is isolated in `auth.css`.

The short-lived token is stored in sessionStorage for this tab. Closing the tab or logging out removes the local session. Logout does not revoke an already issued JWT on the server; it remains valid until expiry. There is no refresh-token flow in this MVP. Frontend guards control navigation; backend dependencies enforce access to data.

## Implementation references

- [FastAPI OAuth2 and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [FastAPI database session dependencies](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [bcrypt documentation](https://pypi.org/project/bcrypt/)

## Email verification and password recovery (#6)

Use a local Mailpit inbox for development/demo. Install Mailpit from its official release and run `mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in another terminal. Open `http://localhost:8025` to read captured email. No external email service is required. Docker packaging is tracked in #12.

The example environment uses `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_STARTTLS=false`, blank SMTP credentials, and `MAIL_FROM=noreply@eventy.local`. For a provider, use its host/port, sender and credentials and enable STARTTLS when required. Credentials belong only in the ignored `.env`. The adapter supports STARTTLS, not implicit TLS on port 465. Set `FRONTEND_URL` to the exact frontend origin used to open emailed reset links (for example `http://localhost:8000` or `http://localhost:5500`).

Before using an existing database, stop the app and back up the SQLite file, then run from `backend/`:

```powershell
..\.venv\Scripts\python -m app.db.migrate_auth
```

The migration is repeatable, adds `is_email_verified=false` and `token_version=0`, and creates challenge/limit tables. Existing accounts stay unverified: use the verification page's resend action. To explicitly verify ONE existing development account, run `python -m app.db.migrate_auth --verify-email an@example.com` with the virtualenv Python. This is a development-only action; the normal signup/demo flow always uses emailed OTPs. JWTs issued before migration lack the required version and must log in again. `create_all` alone does not upgrade existing columns.

Run Uvicorn with `--no-proxy-headers` so arbitrary forwarded headers cannot change the IP used by auth limits. Limits use the direct peer IP; deployments behind a proxy need a separate trusted-proxy design. Retain SQLite and the signing key across restarts.

Demo: register → read OTP in Mailpit → verify → log in. Then log out, choose “Quên mật khẩu?”, request a link, read it in Mailpit, enter a matching new password twice, and return to login. The old password and earlier JWTs are rejected. Reset links expire in 15 minutes; OTPs expire in 5 minutes. See [auth contract](auth-contract.md) for limits/errors. SMTP failure preserves registration and offers resend; recovery always gives the same generic message, so users can check the inbox or retry later without exposing account existence.

No OTP/reset secret is returned by the API or logged by the adapter. Reset secrets use a URL fragment, removed by the page immediately. Tests use fake delivery and a local SMTP fixture; never send test mail to real users.
