import hashlib
import re
from io import BytesIO
from typing import BinaryIO, NamedTuple

from PIL import Image, UnidentifiedImageError
from sqlalchemy import delete
from sqlmodel import Session

from app.models.event import EventCover

MAX_COVER_BYTES = 5 * 1024 * 1024
MAX_COVER_PIXELS = 20_000_000
COVER_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class InvalidCover(ValueError):
    def __init__(self, code: str):
        self.code = code


class CoverUpload(NamedTuple):
    content_type: str
    content: bytes


def read_cover(file: BinaryIO) -> CoverUpload:
    content = file.read(MAX_COVER_BYTES + 1)
    if len(content) > MAX_COVER_BYTES:
        raise InvalidCover("cover_too_large")
    try:
        with Image.open(BytesIO(content), formats=list(COVER_TYPES)) as image:
            if image.width * image.height > MAX_COVER_PIXELS:
                raise InvalidCover("cover_dimensions")
            if getattr(image, "is_animated", False):
                raise InvalidCover("cover_format")
            content_type = COVER_TYPES[image.format]
            image.verify()
        with Image.open(BytesIO(content), formats=list(COVER_TYPES)) as image:
            image.load()
    except Image.DecompressionBombError as error:
        raise InvalidCover("cover_dimensions") from error
    except (UnidentifiedImageError, OSError, SyntaxError) as error:
        raise InvalidCover("cover_format") from error
    return CoverUpload(content_type, content)


def is_uploaded_cover(url: str) -> bool:
    return re.fullmatch(r"/api/events/[1-9][0-9]*/cover\?v=[a-f0-9]{16}", url) is not None


def save_cover(session: Session, event_id: int, cover: CoverUpload) -> str:
    saved = session.get(EventCover, event_id)
    if saved is None:
        session.add(EventCover(event_id=event_id, content_type=cover.content_type, content=cover.content))
    else:
        saved.content_type = cover.content_type
        saved.content = cover.content
    version = hashlib.sha256(cover.content).hexdigest()[:16]
    return f"/api/events/{event_id}/cover?v={version}"


def remove_cover(session: Session, event_id: int) -> None:
    session.exec(delete(EventCover).where(EventCover.event_id == event_id))
