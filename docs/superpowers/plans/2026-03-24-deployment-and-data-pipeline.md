# MouserCV Deployment & Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dockerize MouserCV for Cloud Run, integrate GCS for video/metadata storage with auto-load on boot, add Pydantic import/export schemas, add a refresh button, and create Colab notebooks for SAM3/DLC experimentation.

**Architecture:** Single-container multi-stage Docker build (node frontend + uv-based Python backend). FastAPI serves React static build + API. GCS stores videos and metadata JSON files. On startup, the app syncs from GCS into SQLite. Colab notebooks handle GPU-heavy tasks (SAM3 tracking, DLC keypoints) manually, exporting results to GCS in the defined Pydantic schema format.

**Tech Stack:** FastAPI, SQLModel, google-cloud-storage, Pydantic v2, Docker (multi-stage), uv, pnpm, Vite, React, shadcn/ui, Google Colab, ultralytics (SAM3), deeplabcut

---

## File Map

### Backend — New Files
- `backend/app/schemas.py` — Pydantic import/export schemas (VideoMetadata, TrackExport, BehaviorExport, MovementStats, VideoExportPackage)
- `backend/app/services/gcs.py` — GCS client: list metadata, download/upload, signed URLs
- `backend/app/services/sync.py` — Sync logic: load metadata JSONs from GCS into local DB
- `backend/app/routers/sync.py` — POST /api/sync/gcs endpoint
- `backend/app/services/feature_extractor.py` — Mask geometry feature extraction (OpenCV)
- `backend/app/services/state_machine.py` — Hierarchical behavior state machine
- `backend/app/services/temporal_smoother.py` — Post-processing: median filter, min bout, gap bridge

### Backend — Modified Files
- `backend/app/models.py` — Add MaskFrame, FeatureFrame models; add source+confidence to BehaviorSegment; add gcs_uri+camera_angle+subject_count to Video
- `backend/app/main.py` — Add GCS sync to lifespan, serve static files, add sync router
- `backend/app/db.py` — No changes needed
- `backend/app/routers/analytics.py` — Update export endpoint to use Pydantic schemas
- `backend/pyproject.toml` — Add google-cloud-storage, pyyaml deps

### Frontend — Modified Files
- `frontend/src/components/layout/TopNav.tsx` — Add refresh/sync button
- `frontend/src/api/client.ts` — Add syncGcs(), exportVideo() methods

### Root — New Files
- `Dockerfile` — Multi-stage build (node+pnpm → uv+python)
- `.dockerignore`
- `cloudbuild.yaml` — Cloud Build config for Cloud Run deploy
- `.env.example` — Environment variable template

### Notebooks — New Files
- `notebooks/01_evaluate_sam3.ipynb`
- `notebooks/02_evaluate_superanimal.ipynb`
- `notebooks/03_process_video.ipynb`
- `notebooks/04_import_export.ipynb`

---

## Task 1: Pydantic Import/Export Schemas

**Files:**
- Create: `backend/app/schemas.py`

- [ ] **Step 1: Create schemas.py with all Pydantic models**

```python
# backend/app/schemas.py
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
```

- [ ] **Step 2: Verify schemas parse correctly**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/backend && uv run python -c "from app.schemas import VideoMetadata, VideoExportPackage; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add Pydantic import/export schemas"
```

---

## Task 2: Update Database Models

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: Add new fields and models**

Add to `Video` model: `gcs_uri`, `camera_angle`, `subject_count`.
Add to `BehaviorSegment`: `source`, `confidence`.
Add new models: `MaskFrame`, `FeatureFrame`.

```python
# Add these fields to Video class:
    gcs_uri: str | None = None
    camera_angle: str = "front_angled"
    subject_count: int = Field(default=2, ge=1, le=5)

# Add these fields to BehaviorSegment class:
    source: str = "manual"  # manual, state_machine, rf_classifier
    confidence: float = 1.0

# Add new models:
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
```

- [ ] **Step 2: Delete existing DB and verify tables recreate**

Run: `rm -f /Users/dejandukic/dejan_dev/mousercv/backend/data/mousercv.db && cd /Users/dejandukic/dejan_dev/mousercv/backend && uv run python -c "from app.db import create_db_and_tables; create_db_and_tables(); print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add MaskFrame, FeatureFrame models and Video/BehaviorSegment fields"
```

---

## Task 3: GCS Client Service

**Files:**
- Create: `backend/app/services/gcs.py`
- Modify: `backend/pyproject.toml` — add google-cloud-storage dependency

- [ ] **Step 1: Add google-cloud-storage dependency**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/backend && uv add google-cloud-storage pyyaml`

- [ ] **Step 2: Create GCS service**

```python
# backend/app/services/gcs.py
"""Google Cloud Storage client for MouserCV."""

import json
import os
import logging
from pathlib import Path

from google.cloud import storage

logger = logging.getLogger(__name__)

BUCKET_NAME = os.environ.get("GCS_BUCKET", "mousercv-data")


def get_client() -> storage.Client | None:
    """Get GCS client. Returns None if not configured."""
    try:
        return storage.Client()
    except Exception as e:
        logger.warning(f"GCS not configured: {e}")
        return None


def list_metadata_jsons() -> list[dict]:
    """List all metadata/*.json files in the bucket and parse them."""
    client = get_client()
    if not client:
        return []

    bucket = client.bucket(BUCKET_NAME)
    blobs = bucket.list_blobs(prefix="metadata/")

    results = []
    for blob in blobs:
        if blob.name.endswith(".json"):
            try:
                content = blob.download_as_text()
                data = json.loads(content)
                results.append(data)
            except Exception as e:
                logger.error(f"Failed to parse {blob.name}: {e}")

    return results


def download_results(video_id: str) -> dict | None:
    """Download results for a video from GCS."""
    client = get_client()
    if not client:
        return None

    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(f"results/{video_id}/behaviors.json")

    if not blob.exists():
        return None

    content = blob.download_as_text()
    return json.loads(content)


def upload_metadata(video_id: str, metadata: dict) -> str:
    """Upload metadata JSON to GCS. Returns the GCS URI."""
    client = get_client()
    if not client:
        raise RuntimeError("GCS not configured")

    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(f"metadata/{video_id}.json")
    blob.upload_from_string(json.dumps(metadata, default=str), content_type="application/json")

    return f"gs://{BUCKET_NAME}/metadata/{video_id}.json"


def get_signed_video_url(gcs_uri: str, expiration_minutes: int = 60) -> str | None:
    """Generate a signed URL for a video in GCS."""
    client = get_client()
    if not client:
        return None

    import datetime

    # Parse gs://bucket/path
    if not gcs_uri.startswith("gs://"):
        return None
    parts = gcs_uri[5:].split("/", 1)
    if len(parts) != 2:
        return None

    bucket = client.bucket(parts[0])
    blob = bucket.blob(parts[1])

    url = blob.generate_signed_url(
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url
```

- [ ] **Step 3: Verify import works**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/backend && uv run python -c "from app.services.gcs import get_client; print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/gcs.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add GCS client service"
```

---

## Task 4: GCS Sync Service + Router

**Files:**
- Create: `backend/app/services/sync.py`
- Create: `backend/app/routers/sync.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create sync service**

```python
# backend/app/services/sync.py
"""Sync videos and metadata from GCS into local database."""

import logging
from datetime import datetime

from sqlmodel import Session, select

from app.models import Project, Video
from app.services import gcs
from app.schemas import VideoMetadata

logger = logging.getLogger(__name__)


def sync_from_gcs(session: Session) -> dict:
    """Sync metadata from GCS into the local database.

    Returns summary dict with videos_added, videos_updated, errors.
    """
    metadata_list = gcs.list_metadata_jsons()

    added = 0
    updated = 0
    errors: list[str] = []

    for raw in metadata_list:
        try:
            meta = VideoMetadata(**raw)
        except Exception as e:
            errors.append(f"Invalid metadata: {e}")
            continue

        # Find or create project
        project = session.exec(
            select(Project).where(Project.name == meta.project_name)
        ).first()
        if not project:
            project = Project(name=meta.project_name)
            session.add(project)
            session.flush()

        # Find or create video
        existing = session.exec(
            select(Video).where(Video.gcs_uri == meta.gcs_video_uri)
        ).first()

        if existing:
            existing.status = meta.processing_status
            if meta.fps:
                existing.fps = meta.fps
            if meta.duration_sec:
                existing.duration_sec = meta.duration_sec
            if meta.width:
                existing.width = meta.width
            if meta.height:
                existing.height = meta.height
            existing.camera_angle = meta.camera_angle
            existing.subject_count = meta.subject_count
            updated += 1
        else:
            video = Video(
                project_id=project.id,
                filename=meta.filename,
                path=meta.gcs_video_uri,
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
            added += 1

    session.commit()

    summary = {"videos_added": added, "videos_updated": updated, "errors": errors}
    logger.info(f"GCS sync complete: {summary}")
    return summary
```

- [ ] **Step 2: Create sync router**

```python
# backend/app/routers/sync.py
"""GCS sync endpoints."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas import SyncResponse
from app.services.sync import sync_from_gcs

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/gcs", response_model=SyncResponse)
def trigger_gcs_sync(session: Session = Depends(get_session)):
    """Trigger a re-sync from GCS. Called by the refresh button."""
    result = sync_from_gcs(session)
    return SyncResponse(**result)
```

- [ ] **Step 3: Update main.py — add sync router + GCS sync on startup + static file serving**

In `backend/app/main.py`:
- Import and include the sync router
- Add GCS sync call in the lifespan handler (best-effort, don't crash if GCS unavailable)
- Add static file serving for the React build (when `./static` directory exists)

```python
# Add to imports:
from app.routers import sync
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# In lifespan, after create_db_and_tables():
    # Best-effort GCS sync on startup
    try:
        from app.services.sync import sync_from_gcs
        from app.db import engine
        from sqlmodel import Session
        with Session(engine) as session:
            result = sync_from_gcs(session)
            logger.info(f"Startup GCS sync: {result}")
    except Exception as e:
        logger.warning(f"GCS sync skipped on startup: {e}")

# After all router includes:
app.include_router(sync.router)

# At the bottom, after all routes:
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
```

- [ ] **Step 4: Verify server starts with new routes**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/backend && uv run uvicorn app.main:app --port 8000 &` then `curl -s http://localhost:8000/api/health`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sync.py backend/app/routers/sync.py backend/app/main.py
git commit -m "feat: add GCS sync service, router, and startup auto-sync"
```

---

## Task 5: Export Endpoint with Pydantic Schemas

**Files:**
- Modify: `backend/app/routers/analytics.py`

- [ ] **Step 1: Add /api/videos/{id}/export endpoint returning VideoExportPackage**

Read the existing analytics.py first, then add a new endpoint that:
- Loads the video, its tracks, all detections, all behavior segments
- Computes movement stats per track
- Assembles a VideoExportPackage and returns it
- Supports `?format=csv` query param for CSV download

- [ ] **Step 2: Test the export endpoint**

Run: `curl -s http://localhost:8000/api/videos/1/export | python3 -m json.tool | head -30`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/analytics.py
git commit -m "feat: add Pydantic-validated export endpoint"
```

---

## Task 6: Frontend Refresh Button

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/layout/TopNav.tsx`

- [ ] **Step 1: Add syncGcs method to API client**

```typescript
// Add to api object in client.ts:
syncGcs: () => request<{ videos_added: number; videos_updated: number; errors: string[] }>("/sync/gcs", { method: "POST" }),
```

- [ ] **Step 2: Add refresh button to TopNav**

Add a `RefreshCw` icon button next to Export that calls `api.syncGcs()` and shows a brief loading state.

- [ ] **Step 3: Build and verify**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/frontend && pnpm build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/layout/TopNav.tsx
git commit -m "feat: add GCS refresh button to top nav"
```

---

## Task 7: Dockerfile + .dockerignore

**Files:**
- Create: `Dockerfile` (project root)
- Create: `.dockerignore`
- Create: `.env.example`

- [ ] **Step 1: Create .dockerignore**

```
node_modules/
.venv/
__pycache__/
*.pyc
backend/data/
dist/
.git/
.DS_Store
*.db
```

- [ ] **Step 2: Create Dockerfile (multi-stage, uv-based)**

```dockerfile
# Stage 1: Build React frontend
FROM node:22-slim AS frontend
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# Stage 2: Python backend with uv
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app

# Install dependencies first for caching
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy backend source
COPY backend/ .

# Copy frontend build as static files
COPY --from=frontend /app/dist ./static

# Runtime config
ENV PORT=8080
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

- [ ] **Step 3: Create .env.example**

```
GCS_BUCKET=mousercv-data
GOOGLE_CLOUD_PROJECT=mousercv
PORT=8080
```

- [ ] **Step 4: Test Docker build locally**

Run: `cd /Users/dejandukic/dejan_dev/mousercv && docker build -t mousercv:local .`
Expected: Build succeeds.

Run: `docker run --rm -p 8080:8080 -e PORT=8080 mousercv:local` (briefly, to verify it starts)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore .env.example
git commit -m "feat: add multi-stage Dockerfile for Cloud Run deployment"
```

---

## Task 8: Cloud Build + Deploy Config

**Files:**
- Create: `cloudbuild.yaml`

- [ ] **Step 1: Create cloudbuild.yaml**

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'europe-west1-docker.pkg.dev/$PROJECT_ID/mousercv/api:$COMMIT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'europe-west1-docker.pkg.dev/$PROJECT_ID/mousercv/api:$COMMIT_SHA']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mousercv-api'
      - '--image=europe-west1-docker.pkg.dev/$PROJECT_ID/mousercv/api:$COMMIT_SHA'
      - '--region=europe-west1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--memory=1Gi'
      - '--cpu=1'
      - '--set-env-vars=GCS_BUCKET=mousercv-data,GOOGLE_CLOUD_PROJECT=$PROJECT_ID'

images:
  - 'europe-west1-docker.pkg.dev/$PROJECT_ID/mousercv/api:$COMMIT_SHA'
```

- [ ] **Step 2: Commit**

```bash
git add cloudbuild.yaml
git commit -m "feat: add Cloud Build config for Cloud Run deployment"
```

---

## Task 9: Colab Notebook — SAM3 Evaluation

**Files:**
- Create: `notebooks/01_evaluate_sam3.ipynb`

- [ ] **Step 1: Create notebook with cells for:**

1. Install deps: `!pip install ultralytics google-cloud-storage opencv-python-headless`
2. Auth: `from google.colab import auth; auth.authenticate_user()`
3. Config: GCS bucket, video path parameters
4. Download video from GCS
5. Extract frames to directory
6. Load SAM3: `from ultralytics import SAM; model = SAM("sam3.pt")`
7. Prompt on first frame (configurable click/box coordinates)
8. Run video propagation with `model.predict()` in video mode
9. Visualize: overlay masks on 5 sample frames, display in notebook
10. Measure tracking quality: count frames with valid masks per object
11. Export masks as JSONL (frame, object_id, mask_rle, bbox, centroid, area)
12. Upload results to GCS: `gs://mousercv-data/results/{video_id}/masks.jsonl`

- [ ] **Step 2: Commit**

```bash
git add notebooks/01_evaluate_sam3.ipynb
git commit -m "feat: add SAM3 evaluation Colab notebook"
```

---

## Task 10: Colab Notebook — DLC SuperAnimal Evaluation

**Files:**
- Create: `notebooks/02_evaluate_superanimal.ipynb`

- [ ] **Step 1: Create notebook with cells for:**

1. Install: `!pip install deeplabcut[gui,modelzoo] google-cloud-storage`
2. Auth + config (same pattern as notebook 01)
3. Download video from GCS
4. Run zero-shot inference:
   ```python
   import deeplabcut
   deeplabcut.video_inference_superanimal(
       [video_path],
       superanimal_name="superanimal_quadruped",
       model_name="hrnet_w32",
       detector_name="fasterrcnn_resnet50_fpn_v2",
       video_adapt=True,
       pcutoff=0.3,
   )
   ```
5. Load results (DLC outputs h5/csv), display sample frames with keypoints
6. Assess per-keypoint confidence: which of the 39 keypoints are reliable on mice?
7. Compute summary: mean confidence per keypoint, percent of frames above pcutoff
8. Export keypoints as JSONL (frame, keypoint_name, x, y, confidence)
9. Upload to GCS: `gs://mousercv-data/results/{video_id}/keypoints.jsonl`

- [ ] **Step 2: Commit**

```bash
git add notebooks/02_evaluate_superanimal.ipynb
git commit -m "feat: add DLC SuperAnimal evaluation Colab notebook"
```

---

## Task 11: Colab Notebook — Full Processing Pipeline

**Files:**
- Create: `notebooks/03_process_video.ipynb`

- [ ] **Step 1: Create notebook with cells for:**

1. Install all deps: ultralytics, deeplabcut, google-cloud-storage, opencv, numpy, scipy
2. Auth + config (video_id, GCS bucket as params)
3. Download video from GCS
4. **SAM3 tracking**: prompt + propagate → per-frame masks
5. **DLC keypoints**: run SuperAnimal-Quadruped on cropped mouse regions
6. **Feature extraction**: mask geometry (area, aspect_ratio, convexity, circularity, ellipse_angle) + temporal features (velocity, oscillation indices)
7. **Behavior classification**: apply the state machine rules from the spec
8. **Temporal smoothing**: median filter + min bout + gap bridge
9. **Export all results** in schema format:
   - `masks.jsonl` — per-frame mask data
   - `features.jsonl` — per-frame extracted features
   - `behaviors.json` — behavior segments (matching BehaviorExport schema)
   - `metadata.json` — updated VideoMetadata with processing_status="ready"
10. Upload to GCS: `gs://mousercv-data/results/{video_id}/`
11. Update metadata JSON with processed_at timestamp

- [ ] **Step 2: Commit**

```bash
git add notebooks/03_process_video.ipynb
git commit -m "feat: add full processing pipeline Colab notebook"
```

---

## Task 12: Colab Notebook — Bulk Import/Export

**Files:**
- Create: `notebooks/04_import_export.ipynb`

- [ ] **Step 1: Create notebook with cells for:**

1. Install: google-cloud-storage, pydantic, pandas
2. Auth + config
3. **Bulk upload videos**: given a local directory of .mp4 files, upload each to GCS and create metadata JSON
4. **Create metadata**: auto-detect fps/duration/resolution with OpenCV, generate VideoMetadata, upload to GCS
5. **Bulk download results**: for all processed videos, download behaviors.json and convert to a single pandas DataFrame
6. **Export to CSV/Excel**: combined behavior statistics across all videos
7. **Dataset summary**: total videos, total annotated frames, behavior distribution

- [ ] **Step 2: Commit**

```bash
git add notebooks/04_import_export.ipynb
git commit -m "feat: add bulk import/export Colab notebook"
```

---

## Task 13: Behavior State Machine Service

**Files:**
- Create: `backend/app/services/feature_extractor.py`
- Create: `backend/app/services/state_machine.py`
- Create: `backend/app/services/temporal_smoother.py`

- [ ] **Step 1: Create feature_extractor.py**

Extracts mask geometry features from a binary mask (numpy array):
- area, centroid, aspect_ratio, ellipse_angle, convexity, circularity, perimeter
- Returns a dict of feature_name: float

Uses only OpenCV + numpy. Input is a binary mask as numpy array. Does NOT depend on the DB.

- [ ] **Step 2: Create state_machine.py**

Implements the 3-level hierarchical state machine from the spec:
- Level 1: MOVING/STATIONARY based on centroid velocity with hysteresis
- Level 2: IDLE/GROOMING/SCRATCHING/REARING based on feature predicates
- Level 3: UNCERTAIN when confidence is low

Takes a sequence of feature dicts (one per frame), returns a sequence of (behavior, confidence) tuples.

Includes auto-calibration from first 300 frames.
Thresholds loaded from YAML config with defaults.

- [ ] **Step 3: Create temporal_smoother.py**

Post-processing on raw state sequence:
- Temporal median filter (window=7)
- Minimum bout duration enforcement
- Gap bridging for same-behavior segments
- Merge adjacent same-label segments into BehaviorSegment-compatible output

Input: list of (frame, behavior, confidence) tuples
Output: list of BehaviorSegment-like dicts (start_frame, end_frame, behavior, source, confidence)

- [ ] **Step 4: Verify all imports work**

Run: `cd /Users/dejandukic/dejan_dev/mousercv/backend && uv run python -c "from app.services.feature_extractor import extract_mask_features; from app.services.state_machine import BehaviorStateMachine; from app.services.temporal_smoother import smooth_behaviors; print('OK')"`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/feature_extractor.py backend/app/services/state_machine.py backend/app/services/temporal_smoother.py
git commit -m "feat: add behavior state machine, feature extractor, and temporal smoother"
```

---

## Dependency Graph

Tasks 1-2 must complete before Tasks 3-6 (they define the schemas and models).
Tasks 3-4 must complete before Task 5 (export needs GCS).
Tasks 7-8 are independent of backend tasks.
Tasks 9-12 (notebooks) are fully independent of each other and of backend tasks.
Task 13 is independent of deployment tasks (7-8) but should come after Task 2 (models).

**Parallel execution groups:**
- Group A: Tasks 1, 2 (sequential — schemas then models)
- Group B: Tasks 3, 4, 5, 6 (sequential — GCS → sync → export → refresh button)
- Group C: Tasks 7, 8 (Docker + deploy config, independent)
- Group D: Tasks 9, 10, 11, 12 (notebooks, all independent, can parallelize)
- Group E: Task 13 (state machine, independent after Task 2)

Groups C, D, E can run in parallel with Group B once Group A is done.
