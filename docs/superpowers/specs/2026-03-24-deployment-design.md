---
title: MouserCV Deployment & Data Architecture
date: 2026-03-24
status: approved
---

# MouserCV Deployment & Data Architecture

## Overview

Cloud Run deployment with GCS video storage, Pydantic import/export schemas,
and Colab notebooks for GPU experimentation. Auto-loads videos from GCS on boot.

## GCP Project

- Project ID: `mousercv` (created, needs billing linked)
- Region: europe-west1

## Architecture

```
Cloud Run: mousercv-api (CPU)
  Single container: FastAPI + React static build
  Multi-stage Docker: node frontend build → python/uv backend
  Auto-loads videos + metadata from GCS on startup
  Refresh button triggers re-sync from GCS

GCS: gs://mousercv-data/
  videos/{project}/{video_id}.mp4
  results/{video_id}/masks.jsonl
  results/{video_id}/features.jsonl
  results/{video_id}/behaviors.json
  metadata/{video_id}.json
  exports/{video_id}/export.csv

Colab Notebooks (manual GPU compute):
  01_evaluate_sam3.ipynb         — SAM3 video tracking evaluation
  02_evaluate_superanimal.ipynb  — DLC SuperAnimal keypoint evaluation
  03_process_video.ipynb         — Full pipeline: SAM3 → DLC → features → classify
  04_import_export.ipynb         — Bulk video import to GCS + metadata export
```

## Data Schemas (Pydantic)

### VideoMetadata — stored as JSON in GCS alongside each video

```python
class VideoMetadata(BaseModel):
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
```

### TrackExport

```python
class TrackExport(BaseModel):
    track_id: int
    label: str
    color: str
    detections: list[DetectionExport]
    behaviors: list[BehaviorExport]
    movement_stats: MovementStats

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
    source: Literal["manual", "state_machine", "rf_classifier"]
    confidence: float

class MovementStats(BaseModel):
    total_distance_px: float
    total_distance_cm: float | None = None
    time_moving_sec: float
    time_idle_sec: float
    movement_bouts: int
    mean_bout_duration_sec: float
    erratic_index: float
```

### VideoExportPackage — full export

```python
class VideoExportPackage(BaseModel):
    video: VideoMetadata
    tracks: list[TrackExport]
```

## API Endpoints (new/modified)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/sync/gcs | Trigger re-sync from GCS (refresh button) |
| GET | /api/videos/{id}/export | Full analysis export (JSON) |
| GET | /api/videos/{id}/export?format=csv | CSV export |
| POST | /api/videos/{id}/import-results | Import results from GCS |

## Auto-Load from GCS

On startup (lifespan handler):
1. List gs://mousercv-data/metadata/*.json
2. For each metadata JSON not already in local DB, create Video + Project records
3. Check for corresponding results/ directory, import if available
4. Log sync summary

Refresh button calls POST /api/sync/gcs to re-run this.

## Dockerfile

Multi-stage build, uv for Python:

```dockerfile
FROM node:22-slim AS frontend
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS backend
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ .
COPY --from=frontend /app/dist ./static
ENV PORT=8080
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## Colab Notebooks

Manual GPU compute. Each notebook:
- Installs deps (ultralytics, deeplabcut, google-cloud-storage)
- Authenticates to GCS via Colab auth
- Downloads video from GCS signed URL
- Runs pipeline step
- Uploads results back to GCS in the schema format
- Prints summary

### 01_evaluate_sam3.ipynb
- Load a test video
- Run SAM3 prompt-propagation with different prompts
- Visualize masks overlaid on frames
- Measure tracking quality (ID consistency, mask IoU)
- Export masks as JSONL

### 02_evaluate_superanimal.ipynb
- Load same test video
- Run DLC SuperAnimal-Quadruped zero-shot
- Visualize keypoints overlaid on frames
- Assess which keypoints are reliable for mice
- Test video_adapt mode
- Export keypoints

### 03_process_video.ipynb
- Full pipeline: SAM3 → DLC → feature extraction → state machine classify
- Takes video_id and GCS bucket as params
- Uploads results in the schema format
- Designed to be run per-video

### 04_import_export.ipynb
- Bulk upload videos to GCS with metadata JSON
- Bulk download results and convert to CSV/Excel
- Dataset management utilities

## Environment Variables

```
GCS_BUCKET=mousercv-data
GOOGLE_CLOUD_PROJECT=mousercv
PORT=8080
DATABASE_URL=sqlite:///data/mousercv.db  (local)
```

## Dependencies to Add

Backend:
- google-cloud-storage (GCS client)
- google-auth (for service account)

Frontend:
- No new deps (refresh button uses existing API client)
