---
title: MouserCV - Mice Behavior Video Analysis Platform
date: 2026-03-24
status: approved
---

# MouserCV Design Specification

## Overview

A fullstack platform for analyzing lab mice behavior from video recordings.
Two primary modes: **Annotation** (review/correct tracks, label behavior segments)
and **Analytics** (heatmaps, behavior timelines, statistics, export).

Stack: React + Vite + shadcn/ui frontend, FastAPI + SQLite backend.
CV pipeline: YOLO detection + SAM segmentation + custom re-identification tracker.

## Architecture

```
mousercv/
  backend/              # FastAPI (Python, uv managed)
    app/
      main.py           # App entry, lifespan, CORS
      db.py             # SQLite via SQLModel
      models.py         # Data models
      routers/
        projects.py
        videos.py
        tracks.py
        annotations.py
        analytics.py
      services/
        video_processor.py   # Frame extraction (OpenCV)
        detector.py          # Mock detector (real: YOLO+SAM)
        reidentifier.py      # Hungarian algorithm tracker with ghost tracks
        behavior.py          # Rule-based behavior classification
    pyproject.toml
    data/                    # Uploads, frames, thumbnails

  frontend/             # React + Vite + shadcn
    src/
      components/
        video-player/        # HTML5 video + canvas bbox overlay
        behavior-timeline/   # Canvas-based Gantt behavior segments
        analytics/           # Heatmap, stats, charts (recharts)
        tracks-sidebar/      # Track list, annotation tools, keyframes
        layout/              # App shell, nav, resizable panels
        ui/                  # shadcn components
      hooks/
        use-video-player.ts
        use-annotations.ts
      stores/
        video-store.ts       # Zustand
        annotation-store.ts
      api/
        client.ts            # Fetch wrappers
      types/
        index.ts
      App.tsx
    package.json
    vite.config.ts
```

## Data Model (SQLModel + SQLite)

```
Project
  id: int (PK)
  name: str
  description: str | None
  created_at: datetime

Video
  id: int (PK)
  project_id: int (FK)
  filename: str
  path: str
  duration_sec: float
  fps: float
  width: int
  height: int
  status: enum(uploaded, processing, ready, error)
  created_at: datetime

Track
  id: int (PK)
  video_id: int (FK)
  label: str          # "Mouse 1", "Mouse 2", etc.
  color: str          # hex color
  is_active: bool

Detection
  id: int (PK)
  track_id: int (FK)
  frame_number: int
  x1: float
  y1: float
  x2: float
  y2: float
  confidence: float
  centroid_x: float
  centroid_y: float

BehaviorSegment
  id: int (PK)
  track_id: int (FK)
  start_frame: int
  end_frame: int
  behavior: enum(grooming, scratching, rearing, idle)

Keyframe
  id: int (PK)
  track_id: int (FK)
  frame_number: int
  label: str
  thumbnail_path: str | None
```

## Behavior Categories

| Behavior   | Hotkey | Color     | Description                        |
|------------|--------|-----------|------------------------------------|
| Grooming   | 1      | #22c55e   | Self-grooming (face washing, licking) |
| Scratching | 2      | #f97316   | Hindlimb scratching                |
| Rearing    | 3      | #a855f7   | Standing on hind legs              |
| Idle       | 4      | #6b7280   | Stationary, no specific behavior   |

Movement is NOT a behavior category. Instead, movement metrics are computed
as analytics:
- Total distance traveled (cm, requires calibration)
- Time moving vs time idle (converted to minutes)
- Movement bout count and mean duration
- Erratic behavior index (variance in velocity/heading changes)

## Constraints

- Max 5 mice per video
- Videos are pre-recorded (not real-time streaming)
- Local-first (SQLite, no cloud dependency)
- Prototype uses mock CV data; real pipeline plugs in later

## Re-Identification Algorithm

When mice are lost (occlusion, detection gaps), the tracker:
1. Maintains a buffer of last 10 frames per track
2. Predicts position using linear velocity extrapolation
3. Uses Hungarian algorithm for optimal detection-to-track assignment
4. Cost function: weighted sum of euclidean distance, IoU, area similarity
5. Ghost tracks persist for up to 10 frames with predicted positions
6. New track creation requires high confidence + no matching ghost

## API Endpoints

| Method | Path                           | Purpose                    |
|--------|--------------------------------|----------------------------|
| GET    | /api/projects                  | List projects              |
| POST   | /api/projects                  | Create project             |
| GET    | /api/projects/{id}             | Get project                |
| POST   | /api/videos                    | Upload video (multipart)   |
| GET    | /api/videos/{id}               | Video metadata + status    |
| POST   | /api/videos/{id}/process       | Trigger CV pipeline        |
| GET    | /api/videos/{id}/frames/{n}    | Serve frame as JPEG        |
| GET    | /api/videos/{id}/tracks        | All tracks for video       |
| GET    | /api/tracks/{id}/detections    | Detections per frame       |
| GET    | /api/tracks/{id}/behaviors     | Behavior segments          |
| POST   | /api/tracks/{id}/behaviors     | Create behavior segment    |
| PUT    | /api/tracks/{id}/behaviors/{id}| Update behavior segment    |
| DELETE | /api/tracks/{id}/behaviors/{id}| Delete behavior segment    |
| GET    | /api/tracks/{id}/keyframes     | Keyframes                  |
| POST   | /api/tracks/{id}/keyframes     | Create keyframe            |
| GET    | /api/videos/{id}/analytics     | Aggregated analytics       |
| GET    | /api/videos/{id}/export        | CSV/JSON export            |

## Frontend Layout

```
+------------------------------------------------------------------+
| MouserCV   Project Name           [Annotate][Process][Export]     |
+----------------------------+-------------------------------------+
|                            | Tracks & Annotations                |
|   +--------------------+   | o Track 1 (M1)                     |
|   |     VIDEO          |   | o Track 2 (M2)                     |
|   |  [M1:95%] [M2:92%] |   +-------------------------------------+
|   |  canvas overlay     |   | Analytics                           |
|   +--------------------+   | [Overview][Tracking][Heatmap][Stats] |
|   > || << >>  04:15/12:00  | +-------------+ +----------------+   |
|   [====o===============]   | | Heatmap     | | Behavior Counts|   |
+----------------------------+ +-------------+ +----------------+   |
| Activity Timeline                                                 |
| Grooming  ####....####....####.......####                        |
| Scratch   ....####........####..........                          |
| Rearing   ........####................##                          |
| Idle      ####............####..........                          |
|            |<- playhead    100  200  300  400  500                |
+------------------------------------------------------------------+
```

## Frontend Libraries

| Need           | Choice                        |
|----------------|-------------------------------|
| Video player   | Native <video> + custom hooks |
| Box overlay    | Canvas 2D API                 |
| UI framework   | shadcn/ui                     |
| Charts         | Recharts (via shadcn Chart)   |
| Heatmap        | Custom canvas radial gradient |
| Timeline       | Custom canvas component       |
| State          | Zustand                       |
| Hotkeys        | react-hotkeys-hook            |
| HTTP           | Native fetch                  |

## Prototype Scope

For the initial prototype:
- Backend returns mock detection/tracking data (realistic but pre-computed)
- Real video upload + frame extraction works (OpenCV)
- Full UI is functional and interactive
- All analytics computed from mock data
- Re-identification module is real (not mocked)
- Behavior annotation is manual (user-driven)
