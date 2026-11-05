# Local Setup & Authentication Handoff

## Docker Compose development/demo (#12)

This runs the existing FastAPI server (including the frontend), SQLite and a local Mailpit inbox. Install Docker Desktop with Linux containers and Docker Compose v2+ (`docker compose version`). Start Docker Desktop first. The Docker route needs no host Python or separately installed Mailpit. First build requires internet to download the images and Python packages.

### 1. Get the project on a new machine

Install Git if you want to clone the repository, then run in PowerShell:

```powershell
git clone https://github.com/mfortunaa/web-ai66a-group-2.git
Set-Location web-ai66a-group-2
docker version
docker compose version
```

Alternatively, download and extract the repository ZIP, then open PowerShell in the extracted folder containing `compose.yaml`. Git is not required for the ZIP route. `docker version` must show both Client and Server; if the Server is unavailable, start Docker Desktop and wait for it to be ready.

### 2. Configure and start Docker

From the repository root, create the Docker-only `.env` once. This is separate from the native Python setup's `backend/.env`; neither file is copied into the image.

```powershell
Copy-Item .env.example .env
# Generate a local key without displaying it. Run only during initial setup.
$eventyKeyBytes = New-Object byte[] 32
$eventyRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$eventyRng.GetBytes($eventyKeyBytes)
$eventyRng.Dispose()
$eventyKey = [BitConverter]::ToString($eventyKeyBytes).Replace('-', '').ToLowerInvariant()
(Get-Content .env -Raw).Replace('replace-with-a-random-secret-at-least-32-characters', $eventyKey) | Set-Content .env -Encoding ascii
docker compose config --quiet
docker compose up -d --build --wait
```

Keep your `.env` and key between runs; do not overwrite an existing configured `.env`. You may instead generate a random key using your own tool and set `EVENTY_SECRET_KEY` manually. The app rejects the placeholder. `docker compose config --quiet` validates without printing the configured key. Shell variables override `.env` values, so remove old `EVENTY_*` overrides if you see unexpected settings.

| Service | Local URL / storage |
| --- | --- |
| Frontend + API | http://localhost:8080 |
| Swagger / health | http://localhost:8080/docs / http://localhost:8080/health |
| Local email inbox | http://localhost:8025 |
| SQLite | `/data/eventy.db` in the `eventy-data` named volume |
| Captured messages | `/data/mailpit.db` in the `mailpit-data` named volume |

Both published ports bind to loopback. SMTP is available to the backend at `mailpit:1025` inside Compose and is not published on the host. The Compose environment configures the existing #6 mail adapter, using no SMTP credentials or external delivery. Mailpit does not relay messages externally. The image runs the app as a non-root user and checks `/health`; the backend waits for Mailpit readiness and runs the repeatable auth migration before starting. A fresh volume starts empty. Native `backend/eventy.db` is not imported or modified.

### 3. Load data: sample events or an existing database

Choose one route after the services start:

- **New installation with sample events:** run the seed command below. It creates events and sessions, but no shared test accounts.
- **Use a database supplied by a teammate or from another machine:** follow [Import an existing SQLite database](#import-an-existing-sqlite-database) below. You do not need to seed events if the imported database already contains them.

```powershell
docker compose exec backend python -m scripts.seed_events --refresh-demo-dates
```

### 4. Open the app and verify the flow

Open http://localhost:8080 and register → read OTP at http://localhost:8025 → verify → log in. If you imported a database, you can sign in with an existing verified account; unverified accounts still need an emailed OTP. Use “Quên mật khẩu?” and the captured reset link to test recovery; the old password and older JWTs must fail. No test messages should be sent to real users.

```powershell
# Repeatable integration check: creates one disposable test account and local emails.
docker compose exec -T backend python -m scripts.check_docker
```

The check exercises the real SMTP path, OTP, recovery/reset, single-use challenges, JWT revocation, event authorization and login cooldowns without printing secrets. It leaves its test account and emails in the local demo database/inbox. Do not run repeatedly against a shared demo in a short interval: normal auth request quotas apply.

### Stop, restart and rebuild

```powershell
docker compose ps
docker compose logs --tail=100 backend mailpit
docker compose stop
docker compose start --wait
# Rebuild after changing source; source is copied into the image (no hot reload).
docker compose up -d --build --wait
# Remove containers/network while retaining the database and inbox volumes.
docker compose down
```

Normal restart, rebuild and `down` retain both volumes, including email verification, reset challenges and login-limit counters. Keep the same Compose project name/directory to reuse those volumes. `docker compose down --volumes` explicitly deletes the project's database and captured messages; use it only when you intentionally want to discard all demo data. Native database files are unaffected.

### Export a SQLite backup

Run these commands from the repository root on the source machine. For a consistent backup, stop the backend before copying SQLite, then start it again:

```powershell
docker compose stop backend
docker compose cp backend:/data/eventy.db ./eventy-backup.sqlite
docker compose start --wait backend
```

This copies data **from Docker to your machine**. Send `eventy-backup.sqlite` to the destination machine if you want to transfer that database.

### Import an existing SQLite database

Complete steps 1 and 2 on the destination machine first so that the containers and database volume exist. Place the supplied `eventy-backup.sqlite` in the repository root, beside `compose.yaml`. If the source is a native `backend/eventy.db`, stop the native backend before making its backup and use that backup as the input file.

The import replaces the destination database, including its accounts, events and bookings. Stop the destination backend and preserve its current database first. Choose a different backup filename if `eventy-before-import.sqlite` already exists:

```powershell
Test-Path ./eventy-backup.sqlite # Must return True before continuing.
docker compose stop backend
docker compose cp backend:/data/eventy.db ./eventy-before-import.sqlite
```

After the backup succeeds, copy the supplied database **from your machine into Docker**. Restore its ownership because the backend runs as UID 10001, then start the backend to run the repeatable auth migration:

```powershell
docker compose cp ./eventy-backup.sqlite backend:/data/eventy.db
docker compose run --rm --no-deps --user root backend chown 10001:10001 /data/eventy.db
docker compose start --wait backend
docker compose ps
```

Continue only if each command succeeds. If startup fails, inspect `docker compose logs --tail=100 backend`. Open http://localhost:8080 and sign in again to check the imported data. The destination uses its own configured signing key, so existing browser sessions may require a new login. The startup migration adds auth columns without verifying old accounts; use emailed verification as described below. This transfers only the application database; Mailpit's captured inbox is stored separately.

### Ports and troubleshooting

Reserve port 5500 for the optional standalone frontend. If 8080/8025 is occupied, change `EVENTY_HTTP_PORT` / `EVENTY_MAIL_PORT` in the root `.env` and rerun `docker compose up -d --wait`. The backend derives its emailed reset-link origin from `EVENTY_HTTP_PORT`; open the app at `http://localhost:<that port>`. The frontend uses the same origin, including custom ports. Native FastAPI (8000) and standalone frontend (5500) remain supported. After changes to Compose environment, use `up`, not only `restart`, to recreate services with the new values.

If startup fails, check `docker compose logs backend` for invalid keys/migration errors and `docker compose ps` for health. Docker's SQLite file belongs to UID 10001 inside its volume; avoid replacing it with files owned by a different user. See [Docker environment precedence](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) and [Mailpit Docker documentation](https://mailpit.axllent.org/docs/install/docker/) for the underlying configuration. This setup targets local development/demo.

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
