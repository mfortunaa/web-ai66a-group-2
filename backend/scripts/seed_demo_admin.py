"""Create the local Docker demo administrator when configured."""
import os


def main():
    password = os.environ.get("EVENTY_DEMO_ADMIN_PASSWORD")
    if not password:
        return

    from sqlmodel import Session, select

    from app.core.security import hash_password
    from app.db.session import begin_write, engine
    from app.models.user import User

    email = "admin-demo@example.com"
    with Session(engine) as session:
        begin_write(session)
        if session.exec(select(User.id).where(User.email == email)).first() is not None:
            return
        session.add(User(
            full_name="Quản trị viên Eventy",
            email=email,
            password_hash=hash_password(password),
            is_email_verified=True,
            role="admin",
        ))
        session.commit()


if __name__ == "__main__":
    main()
