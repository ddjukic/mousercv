"""Video upload, processing, and frame-serving endpoints."""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlmodel import Session, select

from app.db import UPLOADS_DIR, get_session
from app.models import BehaviorSegment, Detection, Track, Video
from app.services.mock_detector import (
    create_behavior_segments_for_track,
    create_detections_for_track,
    generate_mock_data,
)
from app.services.video_processor import (
    extract_frame,
    extract_metadata,
    generate_placeholder_frame,
)

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile,
    project_id: int,
    session: Session = Depends(get_session),
) -> Video:
    """Upload a video file.

    Saves the file to data/uploads/ and extracts metadata with OpenCV.
    If OpenCV cannot read the file, the video is still created with default metadata.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    # Save file to disk
    dest = UPLOADS_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Extract metadata
    metadata = {
        "fps": 30.0,
        "duration_sec": 0.0,
        "width": 640,
        "height": 480,
    }
    try:
        metadata = extract_metadata(str(dest))
    except Exception:
        # Video may not be readable by OpenCV (e.g., corrupted or unsupported codec)
        pass

    video = Video(
        project_id=project_id,
        filename=file.filename,
        path=str(dest),
        fps=metadata.get("fps", 30.0),
        duration_sec=metadata.get("duration_sec", 0.0),
        width=metadata.get("width", 640),
        height=metadata.get("height", 480),
        status="uploaded",
    )
    session.add(video)
    session.commit()
    session.refresh(video)
    return video


@router.get("/{video_id}")
def get_video(
    video_id: int,
    session: Session = Depends(get_session),
) -> Video:
    """Get video metadata and status."""
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )
    return video


@router.post("/{video_id}/process")
def process_video(
    video_id: int,
    num_mice: int = 2,
    session: Session = Depends(get_session),
) -> dict:
    """Trigger mock processing on a video.

    Creates tracks, detections, and behavior segments using the mock detector.
    """
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )

    # Update status
    video.status = "processing"
    session.add(video)
    session.commit()

    try:
        # Compute total frames from metadata
        total_frames = int(video.duration_sec * video.fps) if video.duration_sec > 0 else 900
        if total_frames < 1:
            total_frames = 900  # Default: 30 seconds at 30fps

        # Generate mock data
        tracks, _, _ = generate_mock_data(
            video_id=video_id,
            total_frames=total_frames,
            num_mice=min(num_mice, 5),
            arena_w=video.width or 640,
            arena_h=video.height or 480,
        )

        tracks_created = 0
        detections_created = 0
        behaviors_created = 0

        for track in tracks:
            session.add(track)
            session.commit()
            session.refresh(track)

            # Create detections from stored positions
            positions = track._positions  # type: ignore[attr-defined]
            detections = create_detections_for_track(track.id, positions)

            # Batch insert detections
            for det in detections:
                session.add(det)
            session.commit()
            detections_created += len(detections)

            # Create behavior segments
            behavior_tuples = track._behavior_segments  # type: ignore[attr-defined]
            behavior_segments = create_behavior_segments_for_track(
                track.id, behavior_tuples
            )
            for seg in behavior_segments:
                session.add(seg)
            session.commit()
            behaviors_created += len(behavior_segments)

            tracks_created += 1

        video.status = "ready"
        session.add(video)
        session.commit()

        return {
            "status": "ready",
            "tracks_created": tracks_created,
            "detections_created": detections_created,
            "behavior_segments_created": behaviors_created,
            "total_frames": total_frames,
        }

    except Exception as exc:
        video.status = "error"
        session.add(video)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Processing failed: {exc}",
        )


@router.get("/{video_id}/frames/{frame_number}")
def get_frame(
    video_id: int,
    frame_number: int,
    session: Session = Depends(get_session),
) -> Response:
    """Serve a single video frame as JPEG.

    Falls back to a placeholder image if the video file is not accessible.
    """
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )

    if frame_number < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frame number must be non-negative",
        )

    try:
        jpeg_bytes = extract_frame(video.path, frame_number)
    except (FileNotFoundError, RuntimeError, ValueError):
        # Return a placeholder frame
        jpeg_bytes = generate_placeholder_frame(
            width=video.width or 640,
            height=video.height or 480,
            frame_number=frame_number,
        )

    return Response(content=jpeg_bytes, media_type="image/jpeg")


@router.get("/{video_id}/tracks")
def get_video_tracks(
    video_id: int,
    session: Session = Depends(get_session),
) -> list[Track]:
    """Get all tracks for a video."""
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )

    statement = select(Track).where(Track.video_id == video_id)
    return list(session.exec(statement).all())
