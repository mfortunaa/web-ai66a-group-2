from contextlib import asynccontextmanager
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.admin_events import router as admin_events_router
from app.api.auth import router as auth_router
from app.api.bookings import router as bookings_router
from app.api.events import router as events_router
from app.api.my_bookings import router as my_bookings_router
from app.core.config import get_settings
from app.db.session import create_db_and_tables

mimetypes.add_type("image/webp", ".webp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Eventy API", version="0.1.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    if request.url.path.startswith("/api/auth/"):
        # FastAPI normally echoes invalid inputs; never reflect credentials/challenges.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]})
    return await request_validation_exception_handler(request, exc)


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["Retry-After"],
)
app.include_router(auth_router)
app.include_router(admin_events_router)
app.include_router(events_router)
app.include_router(my_bookings_router)
app.include_router(bookings_router)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# Mount last so API routes and Swagger keep priority. One server can run the demo.
app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend", html=True), name="frontend")
