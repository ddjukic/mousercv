---
title: MouserCV Behavior Detection Architecture
date: 2026-03-24
status: draft
---

# MouserCV Behavior Detection Architecture

## Overview

Classification of grooming, scratching, rearing, and idle behaviors from
cage video using SAM3 segmentation masks + DeepLabCut SuperAnimal keypoints,
processed through a hierarchical state machine with auto-calibrating
thresholds. An "uncertain" class flags low-confidence frames for human review.

## Camera Setup

Angled front camera watching into the cage. Not overhead. This gives:
- Good visibility of body posture, head position, limb movements
- Higher occlusion risk when mice overlap front-to-back
- DLC SuperAnimal-Quadruped model is appropriate (designed for side/angled views)

## Tracking: SAM3 Video Propagation

SAM3 replaces YOLO + reidentifier as primary tracking:
- Prompt on first frame (click/box per mouse)
- Propagates identity-consistent masks across all frames
- Outputs per-frame binary masks with stable object IDs
- Re-prompt every ~1000 frames or on confidence drop
- Max 5 mice per video

The existing reidentifier.py remains as fallback for non-SAM3 workflows.

## Behavior Categories

| Behavior   | Hotkey | Color     | Duration Range  |
|------------|--------|-----------|-----------------|
| Grooming   | 1      | #22c55e   | 2-120+ seconds  |
| Scratching | 2      | #f97316   | 0.5-5 seconds   |
| Rearing    | 3      | #a855f7   | 1-15 seconds    |
| Idle       | 4      | #6b7280   | 0.5-minutes     |
| Uncertain  | 5      | #fbbf24   | any             |

Locomotion is NOT a behavior class. Movement metrics (distance, time
moving vs idle, bout count, erratic index) are analytics.

## Feature Extraction Pipeline

### Layer 1: Mask Geometry Features (from SAM3 masks)

Per-frame, per-mouse. Computed via OpenCV. ~1ms per frame.

| Feature | Computation | Discriminative For |
|---------|-------------|--------------------|
| area | cv2.countNonZero | Rearing (decreases) |
| centroid (cx, cy) | cv2.moments | Movement detection, rearing (cy shifts up) |
| aspect_ratio | bbox height/width | Rearing (>1.3), normal (~0.6-0.8) |
| ellipse_angle | cv2.fitEllipse | Body orientation |
| convexity | area/convex_hull_area | Scratching (low ~0.70), grooming (high ~0.85) |
| circularity | 4pi*area/perimeter^2 | Compact vs elongated posture |
| perimeter | cv2.arcLength | Active behaviors (rougher contour) |

### Layer 2: Temporal/Dynamic Features (sliding windows)

Computed over 15-frame (~0.5s) windows.

| Feature | Why |
|---------|-----|
| centroid_velocity | MOVING vs STATIONARY gate |
| area_change_rate | Rearing onset detection |
| contour_oscillation_index | Grooming vs scratching vs idle |
| aspect_ratio_oscillation | Rearing transitions |
| angle_oscillation | Scratching body torque |

### Layer 3: Keypoint Features (from DLC SuperAnimal-Quadruped)

39 keypoints including nose, ears, paws, spine, tail. Zero-shot inference.

| Feature | Why |
|---------|-----|
| nose_height | Rearing (high), grooming (low, tucked) |
| paw_to_face_distance | Grooming (small), idle (large) |
| hindpaw_velocity | Scratching (rapid oscillation) |
| body_elongation | Rearing (extended), grooming (compact) |
| head_body_angle | Grooming (head tucked), scratching (head turned) |
| spine_curvature | Posture discrimination |

### Feature Computation Performance

10-min video, 2 mice, 30fps (18K frames x 2):
- Mask geometry: ~36 seconds (CPU)
- Keypoint extraction: ~90 seconds (GPU) or ~15 minutes (CPU)
- Temporal features: ~5 seconds (CPU)

## Hierarchical State Machine (Tier 1)

### Level 1: Movement State

```
MOVING -> STATIONARY:
  centroid_velocity < 2.0 px/frame for 5 consecutive frames

STATIONARY -> MOVING:
  centroid_velocity > 4.0 px/frame for 3 consecutive frames
  (hysteresis prevents flickering)
```

### Level 2: Behavior State (only when STATIONARY)

Priority order: Rearing > Scratching > Grooming > Idle

```
IDLE -> REARING:
  aspect_ratio > 1.3 AND area_change_rate < -0.05 AND centroid_cy_up
  Activation window: 4 frames

IDLE -> SCRATCHING:
  contour_oscillation_index > high_threshold AND convexity < 0.82
  Activation window: 3 frames

IDLE -> GROOMING:
  contour_oscillation_index > moderate_threshold AND < high_threshold
  AND convexity > 0.83
  Activation window: 15 frames (must be sustained)

Any -> UNCERTAIN:
  Confidence below threshold for the current classification
  OR multiple competing states within margin
```

### Level 3: Temporal Validation

| Behavior   | Min Bout | Gap Bridge | Median Filter |
|------------|----------|------------|---------------|
| Grooming   | 60 frames (2s) | 60 frames (2s) | 7 frames |
| Scratching | 15 frames (0.5s) | 15 frames (0.5s) | 7 frames |
| Rearing    | 30 frames (1s) | 30 frames (1s) | 7 frames |
| Idle       | 15 frames (0.5s) | N/A | 7 frames |

### Auto-Calibration

First 300 frames of each video: compute baseline statistics (mean, std)
for area, aspect_ratio, convexity, centroid_velocity. Set thresholds
relative to these baselines. Per-video z-score normalization.

All thresholds stored in YAML config file, overridable by researcher.

## ML Classifier (Tier 2 — after 3-5 annotated videos)

### Training Data Generation

1. SME annotates behavior segments on 3-5 videos using the annotation UI
2. System extracts feature windows from annotated segments
3. Fixed 1-second sliding window (0.5s stride) with summary statistics:
   mean, std, min, max, median, 10th/90th percentile, FFT dominant frequency

### Classifier: Random Forest

```python
RandomForestClassifier(
    n_estimators=200,
    min_samples_leaf=3,
    class_weight='balanced',
    max_features='sqrt',
)
```

Validation: leave-one-video-out cross-validation.

### Hypothesis Pipeline

Before deploying the classifier:
1. Extract feature distributions per behavior class
2. Rank features by discriminative power (ANOVA, mutual info, RF importance)
3. Generate diagnostic visualizations (violin plots, t-SNE, feature trajectories)
4. Auto-propose threshold updates for state machine
5. Report per-class F1 scores from cross-validation

## Uncertain Class + Active Learning

When the state machine or RF classifier has low confidence:
- Label the segment as "uncertain"
- Automatically capture a keyframe at the midpoint
- Flag for human review in the annotation UI
- After human correction, the corrected label feeds back into training data

Confidence threshold: configurable, default 0.6 for state machine,
0.7 for RF classifier.

## Expected Accuracy

| Approach | Rearing | Scratching | Grooming | Idle |
|----------|---------|------------|----------|------|
| State machine (Tier 1) | 85-95% | 70-85% | 55-70% | 65-80% |
| RF + mask features (Tier 2) | 90-97% | 75-90% | 60-75% | 70-85% |
| RF + mask + keypoints (Tier 2+) | 92-98% | 80-92% | 65-80% | 75-88% |
| With 20+ annotated videos | 95-99% | 85-95% | 75-88% | 80-92% |

Grooming vs idle is the hardest boundary. Uncertain class handles this
gracefully by routing ambiguous frames to human review.

## Schema Changes

```sql
CREATE TABLE maskframe (
    id INTEGER PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES track(id),
    frame_number INTEGER NOT NULL,
    mask_rle TEXT NOT NULL,
    centroid_x REAL, centroid_y REAL,
    area REAL, confidence REAL,
    UNIQUE(track_id, frame_number)
);

CREATE TABLE featureframe (
    id INTEGER PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES track(id),
    frame_number INTEGER NOT NULL,
    features_json TEXT NOT NULL,
    UNIQUE(track_id, frame_number)
);

ALTER TABLE behaviorsegment ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE behaviorsegment ADD COLUMN confidence REAL DEFAULT 1.0;
```

## Full Inference Pipeline

```
Video Upload
    |
    v
SAM3 Prompt Propagation (GPU, ~10-15 min per 10-min video)
    |
    v
Mask Storage (RLE in SQLite, ~18MB per video)
    |
    v
Feature Extraction: mask geometry + DLC keypoints (CPU, ~2 min)
    |
    v
State Machine / RF Classifier (CPU, <1 sec)
    |
    v
Temporal Post-Processing (median filter, min bout, gap bridge)
    |
    v
BehaviorSegments written to DB
    |
    v
Low-confidence segments flagged as "uncertain" for human review
```

## Open Source Tools to Leverage

| Tool | Purpose | Integration |
|------|---------|-------------|
| SAM3 (ultralytics) | Video tracking + segmentation | Primary tracking |
| DLC SuperAnimal-Quadruped | Zero-shot keypoint detection | Feature extraction |
| scikit-learn RandomForest | Behavior classification | Tier 2 classifier |
| ruptures (PELT) | Change-point detection | Future: better boundaries |
| Scratch-AID (reference) | Scratching detection patterns | Algorithm reference |

## Implementation Phases

Phase 1: MaskFrame/FeatureFrame models + mask geometry extraction
Phase 2: State machine classifier + temporal post-processing
Phase 3: DLC SuperAnimal integration for keypoint features
Phase 4: Hypothesis pipeline from SME annotations
Phase 5: RF classifier training + active learning loop
