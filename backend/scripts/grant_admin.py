"""Grant admin access to a verified account: python -m scripts.grant_admin EMAIL."""
import argparse

from sqlmodel import Session, select

from app.db.session import begin_write, engine
from app.models.user import User


def main():
    parser = argparse.ArgumentParser(description="Grant admin access to an existing verified Eventy account.")
    parser.add_argument("email")
    args = parser.parse_args()
    with Session(engine) as session:
        begin_write(session)
        user = session.exec(select(User).where(User.email == args.email.strip().lower())).first()
        if user is None or not user.is_email_verified:
            raise SystemExit("A verified account with that email is required.")
        if user.role != "admin":
            user.role = "admin"
            user.token_version += 1
        session.commit()
    print("Admin access granted. Sign in again to start an admin session.")


if __name__ == "__main__":
    main()
