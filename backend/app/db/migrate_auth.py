"""Run `python -m app.db.migrate_auth [--verify-email account@example.com]`."""
import argparse
from sqlalchemy import inspect, text
from app.db.session import engine, create_db_and_tables


def migrate_booking_cancellation(connection):
    columns = {c["name"] for c in inspect(connection).get_columns("bookings")}
    if "cancelled_at" not in columns:
        connection.execute(text("ALTER TABLE bookings ADD COLUMN cancelled_at DATETIME"))


def migrate():
    parser = argparse.ArgumentParser(description="Migrate auth; optionally verify one explicit development account.")
    parser.add_argument("--verify-email")
    args = parser.parse_args()
    with engine.begin() as connection:
        if "users" in inspect(connection).get_table_names():
            columns = {c["name"] for c in inspect(connection).get_columns("users")}
            for name, definition in (
                ("is_email_verified", "BOOLEAN NOT NULL DEFAULT 0"),
                ("token_version", "INTEGER NOT NULL DEFAULT 0"),
                ("role", "VARCHAR(5) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))"),
            ):
                if name not in columns:
                    connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))
    create_db_and_tables()
    with engine.begin() as connection:
        migrate_booking_cancellation(connection)
    if args.verify_email:
        with engine.begin() as connection:
            result = connection.execute(text("UPDATE users SET is_email_verified=1 WHERE email=:email"), {"email": args.verify_email.strip().lower()})
            if result.rowcount != 1:
                raise SystemExit("Expected exactly one existing development account")


if __name__ == "__main__":
    migrate()
