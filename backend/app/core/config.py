from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    secret_key: str = Field(min_length=32)
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'eventy.db').as_posix()}"
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    cors_origins: list[str] = ["http://localhost:5500", "http://127.0.0.1:5500"]
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    mail_from: str = "noreply@eventy.local"
    frontend_url: str = "http://localhost:8000"

    @field_validator("secret_key")
    @classmethod
    def reject_placeholder(cls, value: str) -> str:
        if value.startswith("replace-with-"):
            raise ValueError("Generate a random SECRET_KEY and save it in backend/.env")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
