"""Database engine and session management for MouserCV."""

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "mousercv.db"
UPLOADS_DIR = DATA_DIR / "uploads"
FRAMES_DIR = DATA_DIR / "frames"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"

sqlite_url = f"sqlite:///{DB_PATH}"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})


def create_db_and_tables() -> None:
    """Create all SQLModel tables if they do not exist."""
    SQLModel.metadata.create_all(engine)


def ensure_data_dirs() -> None:
    """Create data directories if they do not exist."""
    for directory in (DATA_DIR, UPLOADS_DIR, FRAMES_DIR, THUMBNAILS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def get_session():
    """Yield a database session for FastAPI dependency injection."""
    with Session(engine) as session:
        yield session
