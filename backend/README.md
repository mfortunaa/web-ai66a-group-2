# Backend

The FastAPI foundation and authentication are implemented. See [the setup guide](../docs/SETUP.md) to run the application and tests.

- `app/api/`: HTTP routes for authentication, events, and bookings.
- `app/core/`: configuration and authentication helpers.
- `app/db/`: SQLModel engine and session dependencies.
- `app/models/`: database table definitions.
- `app/schemas/`: validated request and response models.
- `app/services/`: booking and simulated payment logic.
- `scripts/`: seed events and setup helpers.
- `tests/`: pytest and TestClient tests.

Entry point: `app/main.py`. Store actual secrets in an ignored `backend/.env` file. SQLite tables are created during application startup. Each request gets a session through `app.db.session.get_session`. Protect new routes with `Depends(app.core.security.get_current_user)`.
