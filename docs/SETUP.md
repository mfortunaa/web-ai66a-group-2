# Local Setup & Authentication Handoff

## Requirements

Python 3.10+ and two terminals. Run the following PowerShell commands from the repository root.

## 1. Install dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
python -c "import secrets; print(secrets.token_hex(32))"
```

Replace the placeholder `SECRET_KEY` in `backend/.env` with the generated value. Do not commit `.env`. The app refuses to start with a missing or placeholder key. Keep the same key between restarts to preserve existing tokens.

## 2. Run the backend

```powershell
Set-Location backend
..\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
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
2. Registration redirects to login with a success message.
3. Sign in. The temporary event page greets the authenticated user; the catalog is a separate task.
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

Tests use an isolated in-memory SQLite database and a test-only signing key. They do not modify the development database.

## Backend contract for teammates

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `POST /api/auth/register` | JSON: `full_name`, `email`, `password` | 201: `id`, `full_name`, `email` |
| `POST /api/auth/token` | Form data: `username` (email), `password` | 200: `access_token`, `token_type: bearer`, `expires_in` (seconds) |
| `GET /api/auth/me` | `Authorization: Bearer <access_token>` | 200: `id`, `full_name`, `email` |

Use `from app.db.session import get_session` for the session dependency and `from app.core.security import get_current_user` for authenticated routes. The user table class is `app.models.user.User`. Add new routers to `app/main.py` and import new tables inside `create_db_and_tables()` in `app/db/session.py`.

Email is normalized to lowercase for registration and login. Passwords must have at least eight characters, no null characters, and at most 72 UTF-8 bytes, matching bcrypt's input limit. Errors: 409 duplicate email, 422 invalid registration, 401 invalid credentials/token. JWT uses HS256, a user ID `sub`, and required `iat`/`exp` claims.

## Frontend contract for teammates

Import from `frontend/js/auth.js`: `getToken()`, `getCurrentUser()`, `requireAuth()`, `logout()`, and `clearToken()`. `requireAuth()` returns the user or redirects to login on 401; network/server failures remain visible to the calling page. Use `getToken()` in the `Authorization` header of event/booking requests. On their 401 responses, clear the token and redirect to `loginUrl`.

`config.js` owns the API base URL. Auth-specific Fetch code stays in `auth.js`; the future shared event/booking Fetch helper can use the same configuration. The temporary `events.html` and `account-page.js` should be replaced by the catalog owner, retaining the authentication guard and logout behavior. Auth styling is isolated in `auth.css`.

The short-lived token is stored in sessionStorage for this tab. Closing the tab or logging out removes the local session. Logout does not revoke an already issued JWT on the server; it remains valid until expiry. There is no refresh-token flow in this MVP. Frontend guards control navigation; backend dependencies enforce access to data.

## Implementation references

- [FastAPI OAuth2 and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [FastAPI database session dependencies](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [bcrypt documentation](https://pypi.org/project/bcrypt/)
