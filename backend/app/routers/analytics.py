"""Analytics and export endpoints."""

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import BehaviorSegment, Detection, Track, Video
from app.services.behavior import (
    compute_behavior_counts,
    compute_behavior_durations,
    compute_heatmap,
    compute_movement_stats,
    compute_timeline_data,
)

router = APIRouter(prefix="/api/videos", tags=["analytics"])


@router.get("/{video_id}/analytics")
def get_analytics(
    video_id: int,
    session: Session = Depends(get_session),
) -> dict:
    """Compute comprehensive analytics for a video.

    Returns per-track:
    - behavior_counts: count of segments per behavior
    - behavior_durations: total seconds per behavior
    - movement_stats: distance, speed, movement bouts, erratic index
    - heatmap_data: 20x20 position density grid
    - timeline_data: segments formatted for timeline rendering
    """
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )

    tracks = list(
        session.exec(select(Track).where(Track.video_id == video_id)).all()
    )

    if not tracks:
        return {
            "video_id": video_id,
            "tracks": [],
        }

    fps = video.fps or 30.0
    arena_w = video.width or 640
    arena_h = video.height or 480

    track_analytics = []

    for track in tracks:
        # Fetch detections
        detections = list(
            session.exec(
                select(Detection)
                .where(Detection.track_id == track.id)
                .order_by(Detection.frame_number)
            ).all()
        )

        # Fetch behavior segments
        behaviors = list(
            session.exec(
                select(BehaviorSegment)
                .where(BehaviorSegment.track_id == track.id)
                .order_by(BehaviorSegment.start_frame)
            ).all()
        )

        track_analytics.append(
            {
                "track_id": track.id,
                "label": track.label,
                "color": track.color,
                "behavior_counts": compute_behavior_counts(behaviors),
                "behavior_durations": compute_behavior_durations(behaviors, fps),
                "movement_stats": compute_movement_stats(detections, fps),
                "heatmap_data": compute_heatmap(
                    detections,
                    grid_size=20,
                    arena_w=arena_w,
                    arena_h=arena_h,
                ),
                "timeline_data": compute_timeline_data(behaviors, fps),
            }
        )

    return {
        "video_id": video_id,
        "fps": fps,
        "duration_sec": video.duration_sec,
        "tracks": track_analytics,
    }


@router.get("/{video_id}/export")
def export_data(
    video_id: int,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    session: Session = Depends(get_session),
) -> Response:
    """Export video tracking data as JSON or CSV.

    JSON format: full analytics + raw detections.
    CSV format: one row per detection with track label and behavior.
    """
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )

    tracks = list(
        session.exec(select(Track).where(Track.video_id == video_id)).all()
    )

    if format == "json":
        return _export_json(video, tracks, session)
    else:
        return _export_csv(video, tracks, session)


def _export_json(video: Video, tracks: list[Track], session: Session) -> Response:
    """Export full data as JSON."""
    export_data = {
        "video": {
            "id": video.id,
            "filename": video.filename,
            "fps": video.fps,
            "duration_sec": video.duration_sec,
            "width": video.width,
            "height": video.height,
        },
        "tracks": [],
    }

    for track in tracks:
        detections = list(
            session.exec(
                select(Detection)
                .where(Detection.track_id == track.id)
                .order_by(Detection.frame_number)
            ).all()
        )

        behaviors = list(
            session.exec(
                select(BehaviorSegment)
                .where(BehaviorSegment.track_id == track.id)
                .order_by(BehaviorSegment.start_frame)
            ).all()
        )

        track_data = {
            "track_id": track.id,
            "label": track.label,
            "color": track.color,
            "detections": [
                {
                    "frame_number": d.frame_number,
                    "x1": d.x1,
                    "y1": d.y1,
                    "x2": d.x2,
                    "y2": d.y2,
                    "confidence": d.confidence,
                    "centroid_x": d.centroid_x,
                    "centroid_y": d.centroid_y,
                }
                for d in detections
            ],
            "behavior_segments": [
                {
                    "start_frame": b.start_frame,
                    "end_frame": b.end_frame,
                    "behavior": b.behavior,
                }
                for b in behaviors
            ],
        }
        export_data["tracks"].append(track_data)

    content = json.dumps(export_data, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="video_{video.id}_export.json"'
        },
    )


def _export_csv(video: Video, tracks: list[Track], session: Session) -> Response:
    """Export detection data as CSV with one row per detection."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(
        [
            "track_id",
            "track_label",
            "frame_number",
            "x1",
            "y1",
            "x2",
            "y2",
            "confidence",
            "centroid_x",
            "centroid_y",
            "behavior",
        ]
    )

    for track in tracks:
        detections = list(
            session.exec(
                select(Detection)
                .where(Detection.track_id == track.id)
                .order_by(Detection.frame_number)
            ).all()
        )

        # Build a frame-to-behavior map
        behaviors = list(
            session.exec(
                select(BehaviorSegment)
                .where(BehaviorSegment.track_id == track.id)
            ).all()
        )
        frame_behavior: dict[int, str] = {}
        for b in behaviors:
            for f in range(b.start_frame, b.end_frame + 1):
                frame_behavior[f] = b.behavior

        for d in detections:
            writer.writerow(
                [
                    track.id,
                    track.label,
                    d.frame_number,
                    round(d.x1, 2),
                    round(d.y1, 2),
                    round(d.x2, 2),
                    round(d.y2, 2),
                    round(d.confidence, 4),
                    round(d.centroid_x, 2),
                    round(d.centroid_y, 2),
                    frame_behavior.get(d.frame_number, ""),
                ]
            )

    content = output.getvalue()
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="video_{video.id}_export.csv"'
        },
    )
