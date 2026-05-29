"""MouserCV FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db import create_db_and_tables, engine, ensure_data_dirs
from app.routers import analytics, annotations, projects, sync, tracks, videos

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: set up database and data directories on startup."""
    ensure_data_dirs()
    create_db_and_tables()

    # Best-effort GCS sync on startup
    try:
        from sqlmodel import Session as _Session

        from app.services.sync import sync_from_gcs

        with _Session(engine) as session:
            result = sync_from_gcs(session)
            logger.info("Startup GCS sync: %s", result)
    except Exception as e:
        logger.warning("GCS sync skipped on startup: %s", e)

    yield


app = FastAPI(
    title="MouserCV",
    description="Mice behavior video analysis platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(videos.router)
app.include_router(tracks.router)
app.include_router(annotations.router)
app.include_router(analytics.router)
app.include_router(sync.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "mousercv"}


# Serve frontend static files (must be AFTER all API routes)
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
