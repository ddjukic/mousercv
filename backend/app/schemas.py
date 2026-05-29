"""Pydantic schemas for MouserCV import/export and API contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VideoMetadata(BaseModel):
    """Stored as JSON in GCS alongside each video."""

    video_id: str
    filename: str
    project_name: str
    dataset_name: str | None = None
    subject_count: int = Field(ge=1, le=5)
    fps: float | None = None
    duration_sec: float | None = None
    width: int | None = None
    height: int | None = None
    camera_angle: Literal["front_angled", "overhead", "side"] = "front_angled"
    calibration_px_per_cm: float | None = None
    notes: str | None = None
    tags: list[str] = []
    gcs_video_uri: str
    gcs_results_uri: str | None = None
    processing_status: Literal["uploaded", "processing", "ready", "error"] = "uploaded"
    created_at: datetime
    processed_at: datetime | None = None


class DetectionExport(BaseModel):
    frame: int
    bbox: tuple[float, float, float, float]
    centroid: tuple[float, float]
    confidence: float


class BehaviorExport(BaseModel):
    start_frame: int
    end_frame: int
    start_sec: float
    end_sec: float
    behavior: str
    source: Literal["manual", "state_machine", "rf_classifier"] = "manual"
    confidence: float = 1.0


class MovementStats(BaseModel):
    total_distance_px: float
    total_distance_cm: float | None = None
    time_moving_sec: float
    time_idle_sec: float
    movement_bouts: int
    mean_bout_duration_sec: float
    erratic_index: float


class TrackExport(BaseModel):
    track_id: int
    label: str
    color: str
    detections: list[DetectionExport]
    behaviors: list[BehaviorExport]
    movement_stats: MovementStats


class VideoExportPackage(BaseModel):
    """Complete export of a video's analysis results."""

    video: VideoMetadata
    tracks: list[TrackExport]


class SyncResponse(BaseModel):
    videos_added: int
    videos_updated: int
    errors: list[str]
