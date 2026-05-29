"""SQLModel data models for MouserCV."""

from datetime import datetime

from sqlmodel import Field, SQLModel


class Project(SQLModel, table=True):
    """A research project containing one or more videos."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Video(SQLModel, table=True):
    """A video file uploaded for analysis."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    filename: str
    path: str
    duration_sec: float = 0.0
    fps: float = 30.0
    width: int = 0
    height: int = 0
    status: str = "uploaded"  # uploaded, processing, ready, error
    gcs_uri: str | None = None
    camera_angle: str = "front_angled"
    subject_count: int = Field(default=2, ge=1, le=5)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Track(SQLModel, table=True):
    """A tracked subject (mouse) within a video."""

    id: int | None = Field(default=None, primary_key=True)
    video_id: int = Field(foreign_key="video.id")
    label: str
    color: str
    is_active: bool = True


class Detection(SQLModel, table=True):
    """A bounding-box detection for a single frame."""

    id: int | None = Field(default=None, primary_key=True)
    track_id: int = Field(foreign_key="track.id")
    frame_number: int
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    centroid_x: float
    centroid_y: float


class BehaviorSegment(SQLModel, table=True):
    """A contiguous segment of classified behavior."""

    __tablename__ = "behaviorsegment"

    id: int | None = Field(default=None, primary_key=True)
    track_id: int = Field(foreign_key="track.id")
    start_frame: int
    end_frame: int
    behavior: str  # grooming, scratching, rearing, idle, uncertain
    source: str = "manual"  # manual, state_machine, rf_classifier
    confidence: float = 1.0


class Keyframe(SQLModel, table=True):
    """A user-annotated keyframe within a track."""

    id: int | None = Field(default=None, primary_key=True)
    track_id: int = Field(foreign_key="track.id")
    frame_number: int
    label: str
    thumbnail_path: str | None = None


class MaskFrame(SQLModel, table=True):
    """Per-frame segmentation mask from SAM3."""

    __tablename__ = "maskframe"

    id: int | None = Field(default=None, primary_key=True)
    track_id: int = Field(foreign_key="track.id")
    frame_number: int
    mask_rle: str
    centroid_x: float = 0.0
    centroid_y: float = 0.0
    area: float = 0.0
    confidence: float = 0.0


class FeatureFrame(SQLModel, table=True):
    """Per-frame extracted features for behavior classification."""

    __tablename__ = "featureframe"

    id: int | None = Field(default=None, primary_key=True)
    track_id: int = Field(foreign_key="track.id")
    frame_number: int
    features_json: str  # JSON dict of feature_name: value
