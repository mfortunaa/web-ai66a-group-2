# Backend

The FastAPI foundation, authentication, and event catalog API are implemented. See [the setup guide](../docs/SETUP.md) to run the application and tests.

- `app/api/`: HTTP routes for authentication and events; booking routes are planned.
- `app/core/`: configuration and authentication helpers.
- `app/db/`: SQLModel engine and session dependencies.
- `app/models/`: database table definitions.
- `app/schemas/`: validated request and response models.
- `app/services/`: booking and simulated payment logic.
- `scripts/`: repeatable sample-event seeding.
- `tests/`: pytest and TestClient tests.

Entry point: `app/main.py`. Store actual secrets in an ignored `backend/.env` file. SQLite tables are created during application startup. Each request gets a session through `app.db.session.get_session`. Protect new routes with `Depends(app.core.security.get_current_user)`.

From this directory, seed the project-provided real events and their sessions with `python -m scripts.seed_events`. The command is repeatable and synchronizes the seeded event/session details. It refuses to change a seeded event referenced by a booking. Use `python -m scripts.seed_events --replace-old-samples` to remove only the earlier built-in fictional samples; it also refuses to remove any sample event referenced by a booking. Event dates are the supplied demo dates and are not automatically shifted.
