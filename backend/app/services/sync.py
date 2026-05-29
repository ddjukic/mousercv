"""GCS-to-database synchronization service for MouserCV.

Reads video metadata JSON files from GCS, validates them against the
``VideoMetadata`` Pydantic schema, and upserts corresponding ``Project``
and ``Video`` records in the local database.
"""

import logging

from pydantic import ValidationError
from sqlmodel import Session, select

from app.models import Project, Video
from app.schemas import VideoMetadata
from app.services import gcs

logger = logging.getLogger(__name__)


def _find_or_create_project(session: Session, project_name: str) -> Project:
    """Find an existing project by name, or create a new one.

    Args:
        session: Active SQLModel database session.
        project_name: The name of the project to find or create.

    Returns:
        The existing or newly created ``Project`` instance.
    """
    statement = select(Project).where(Project.name == project_name)
    project = session.exec(statement).first()
    if project is not None:
        return project

    project = Project(name=project_name)
    session.add(project)
    session.commit()
    session.refresh(project)
    logger.info("Created project: %s (id=%d)", project.name, project.id)
    return project


def _upsert_video(
    session: Session,
    project: Project,
    meta: VideoMetadata,
) -> tuple[Video, bool]:
    """Find a video by GCS URI and update it, or create a new one.

    Args:
        session: Active SQLModel database session.
        project: The parent project for the video.
        meta: Validated video metadata from GCS.

    Returns:
        A tuple of (video, is_new) where ``is_new`` is True if the video
        was created, False if it was updated.
    """
    statement = select(Video).where(Video.gcs_uri == meta.gcs_video_uri)
    existing = session.exec(statement).first()

    if existing is not None:
        # Update mutable fields
        existing.project_id = project.id  # type: ignore[assignment]
        existing.filename = meta.filename
        existing.duration_sec = meta.duration_sec or 0.0
        existing.fps = meta.fps or 30.0
        existing.width = meta.width or 0
        existing.height = meta.height or 0
        existing.status = meta.processing_status
        existing.camera_angle = meta.camera_angle
        existing.subject_count = meta.subject_count
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing, False

    video = Video(
        project_id=project.id,  # type: ignore[arg-type]
        filename=meta.filename,
        path="",  # GCS-sourced videos have no local path
        gcs_uri=meta.gcs_video_uri,
        duration_sec=meta.duration_sec or 0.0,
        fps=meta.fps or 30.0,
        width=meta.width or 0,
        height=meta.height or 0,
        status=meta.processing_status,
        camera_angle=meta.camera_angle,
        subject_count=meta.subject_count,
    )
    session.add(video)
    session.commit()
    session.refresh(video)
    return video, True


def sync_from_gcs(session: Session) -> dict:
    """Synchronize video metadata from GCS into the local database.

    Lists all metadata JSON files from the GCS bucket, validates each
    against the ``VideoMetadata`` schema, and creates or updates the
    corresponding ``Project`` and ``Video`` records.

    Args:
        session: Active SQLModel database session.

    Returns:
        A dictionary with keys:
        - ``videos_added``: Number of new videos created.
        - ``videos_updated``: Number of existing videos updated.
        - ``errors``: List of error messages for metadata that failed
          validation or database insertion.
    """
    metadata_list = gcs.list_metadata_jsons()
    if not metadata_list:
        logger.info("No metadata found in GCS (or GCS not configured)")
        return {"videos_added": 0, "videos_updated": 0, "errors": []}

    videos_added = 0
    videos_updated = 0
    errors: list[str] = []

    for raw_meta in metadata_list:
        try:
            meta = VideoMetadata(**raw_meta)
        except ValidationError as exc:
            video_id = raw_meta.get("video_id", "unknown")
            error_msg = f"Validation failed for {video_id}: {exc}"
            logger.warning(error_msg)
            errors.append(error_msg)
            continue

        try:
            project = _find_or_create_project(session, meta.project_name)
            video, is_new = _upsert_video(session, project, meta)

            if is_new:
                videos_added += 1
                logger.info(
                    "Added video: %s (id=%d, project=%s)",
                    video.filename,
                    video.id,
                    project.name,
                )
            else:
                videos_updated += 1
                logger.info(
                    "Updated video: %s (id=%d, project=%s)",
                    video.filename,
                    video.id,
                    project.name,
                )
        except Exception as exc:
            video_id = raw_meta.get("video_id", "unknown")
            error_msg = f"DB error for {video_id}: {exc}"
            logger.warning(error_msg)
            errors.append(error_msg)

    return {
        "videos_added": videos_added,
        "videos_updated": videos_updated,
        "errors": errors,
    }
