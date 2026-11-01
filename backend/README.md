# Backend

Reserved for the FastAPI application. No runnable backend exists yet.

- `app/api/`: HTTP routes for authentication, events, and bookings.
- `app/core/`: configuration and authentication helpers.
- `app/db/`: SQLModel engine and session dependencies.
- `app/models/`: database table definitions.
- `app/schemas/`: validated request and response models.
- `app/services/`: booking and simulated payment logic.
- `scripts/`: seed events and setup helpers.
- `tests/`: pytest and TestClient tests.

During implementation, add the entry point at `app/main.py`, a dependency file, and `.env.example` with placeholder values. Store actual secrets in an ignored `.env` file. Use SQLite initially and manage sessions with FastAPI dependencies.
