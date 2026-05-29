"""Track-level endpoints: detections, behaviors, keyframes."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import BehaviorSegment, Detection, Keyframe, Track

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


# ---- Detections ----


@router.get("/{track_id}/detections")
def get_detections(
    track_id: int,
    start_frame: int | None = Query(default=None, ge=0),
    end_frame: int | None = Query(default=None, ge=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=1000, ge=1, le=10000),
    session: Session = Depends(get_session),
) -> dict:
    """Get detections for a track, optionally filtered by frame range.

    Returns paginated results with total count.
    """
    track = session.get(Track, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )

    # Build query
    stmt = select(Detection).where(Detection.track_id == track_id)

    if start_frame is not None:
        stmt = stmt.where(Detection.frame_number >= start_frame)
    if end_frame is not None:
        stmt = stmt.where(Detection.frame_number <= end_frame)

    stmt = stmt.order_by(Detection.frame_number)

    # Count total before pagination
    count_stmt = select(func.count()).select_from(Detection).where(
        Detection.track_id == track_id
    )
    if start_frame is not None:
        count_stmt = count_stmt.where(Detection.frame_number >= start_frame)
    if end_frame is not None:
        count_stmt = count_stmt.where(Detection.frame_number <= end_frame)

    total = session.exec(count_stmt).one()

    # Apply pagination
    stmt = stmt.offset(offset).limit(limit)
    detections = list(session.exec(stmt).all())

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "detections": detections,
    }


# ---- Behaviors ----


class BehaviorCreate(BaseModel):
    """Schema for creating a behavior segment."""

    start_frame: int
    end_frame: int
    behavior: str


class BehaviorUpdate(BaseModel):
    """Schema for updating a behavior segment."""

    start_frame: int | None = None
    end_frame: int | None = None
    behavior: str | None = None


VALID_BEHAVIORS = {"grooming", "scratching", "rearing", "idle"}


@router.get("/{track_id}/behaviors")
def get_behaviors(
    track_id: int,
    session: Session = Depends(get_session),
) -> list[BehaviorSegment]:
    """Get all behavior segments for a track."""
    track = session.get(Track, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )

    stmt = (
        select(BehaviorSegment)
        .where(BehaviorSegment.track_id == track_id)
        .order_by(BehaviorSegment.start_frame)
    )
    return list(session.exec(stmt).all())


@router.post("/{track_id}/behaviors", status_code=status.HTTP_201_CREATED)
def create_behavior(
    track_id: int,
    data: BehaviorCreate,
    session: Session = Depends(get_session),
) -> BehaviorSegment:
    """Create a new behavior segment for a track."""
    track = session.get(Track, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )

    if data.behavior not in VALID_BEHAVIORS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid behavior '{data.behavior}'. Must be one of: {VALID_BEHAVIORS}",
        )

    segment = BehaviorSegment(
        track_id=track_id,
        start_frame=data.start_frame,
        end_frame=data.end_frame,
        behavior=data.behavior,
    )
    session.add(segment)
    session.commit()
    session.refresh(segment)
    return segment


@router.put("/{track_id}/behaviors/{behavior_id}")
def update_behavior(
    track_id: int,
    behavior_id: int,
    data: BehaviorUpdate,
    session: Session = Depends(get_session),
) -> BehaviorSegment:
    """Update an existing behavior segment."""
    segment = session.get(BehaviorSegment, behavior_id)
    if not segment or segment.track_id != track_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Behavior segment {behavior_id} not found for track {track_id}",
        )

    update_data = data.model_dump(exclude_unset=True)
    if "behavior" in update_data and update_data["behavior"] not in VALID_BEHAVIORS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid behavior. Must be one of: {VALID_BEHAVIORS}",
        )

    for key, value in update_data.items():
        setattr(segment, key, value)

    session.add(segment)
    session.commit()
    session.refresh(segment)
    return segment


@router.delete("/{track_id}/behaviors/{behavior_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_behavior(
    track_id: int,
    behavior_id: int,
    session: Session = Depends(get_session),
) -> None:
    """Delete a behavior segment."""
    segment = session.get(BehaviorSegment, behavior_id)
    if not segment or segment.track_id != track_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Behavior segment {behavior_id} not found for track {track_id}",
        )
    session.delete(segment)
    session.commit()


# ---- Keyframes ----


class KeyframeCreate(BaseModel):
    """Schema for creating a keyframe."""

    frame_number: int
    label: str
    thumbnail_path: str | None = None


@router.get("/{track_id}/keyframes")
def get_keyframes(
    track_id: int,
    session: Session = Depends(get_session),
) -> list[Keyframe]:
    """Get all keyframes for a track."""
    track = session.get(Track, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )

    stmt = (
        select(Keyframe)
        .where(Keyframe.track_id == track_id)
        .order_by(Keyframe.frame_number)
    )
    return list(session.exec(stmt).all())


@router.post("/{track_id}/keyframes", status_code=status.HTTP_201_CREATED)
def create_keyframe(
    track_id: int,
    data: KeyframeCreate,
    session: Session = Depends(get_session),
) -> Keyframe:
    """Create a new keyframe annotation for a track."""
    track = session.get(Track, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )

    keyframe = Keyframe(
        track_id=track_id,
        frame_number=data.frame_number,
        label=data.label,
        thumbnail_path=data.thumbnail_path,
    )
    session.add(keyframe)
    session.commit()
    session.refresh(keyframe)
    return keyframe
