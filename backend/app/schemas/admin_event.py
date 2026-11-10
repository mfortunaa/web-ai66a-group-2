from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.event_covers import is_uploaded_cover


NonnegativeInteger = Annotated[int, Field(ge=0, le=2**53 - 1)]
Capacity = Annotated[int, Field(gt=0, le=2**53 - 1)]


class SessionData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int | None = Field(default=None, gt=0, le=2**53 - 1)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    capacity: Capacity


class EventData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    image_url: str | None = Field(default=None, min_length=1, max_length=500)
    venue: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=300)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    sales_open_at: AwareDatetime
    sales_close_at: AwareDatetime
    ticket_price_vnd: NonnegativeInteger
    capacity: Capacity
    sessions: list[SessionData]

    @field_validator("image_url")
    @classmethod
    def validate_image(cls, value: str | None) -> str | None:
        if value is None or is_uploaded_cover(value):
            return value
        url = urlsplit(value)
        if not url.netloc and not url.scheme and url.path.startswith("/assets/images/") and "\\" not in value:
            return value
        if url.scheme in ("https", "http") and url.hostname and not url.username and not url.password:
            return value
        raise ValueError("Use an HTTP(S) image URL or a path under /assets/images/")

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.starts_at >= self.ends_at:
            raise ValueError("The event must end after it starts")
        if not self.sales_open_at < self.sales_close_at <= self.ends_at:
            raise ValueError("Ticket sales must close after they open and by the end of the event")
        if any(not self.starts_at <= item.starts_at < item.ends_at <= self.ends_at for item in self.sessions):
            raise ValueError("Each session must have a valid time range within the event")
        if any(item.capacity > self.capacity for item in self.sessions):
            raise ValueError("Session capacity cannot exceed event capacity")
        if len({item.starts_at for item in self.sessions}) != len(self.sessions):
            raise ValueError("Session start times must be distinct")
        ids = [item.id for item in self.sessions if item.id is not None]
        if len(set(ids)) != len(ids):
            raise ValueError("Session IDs must be distinct")
        return self


class EventCreate(EventData):
    sessions: list[SessionData] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_new_sessions(self):
        if any(item.id is not None for item in self.sessions):
            raise ValueError("New sessions cannot supply an ID")
        return self
