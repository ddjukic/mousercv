# MouserCV Behavior Detection v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate DLC keypoints + SAM3 tracking on real collaborator video, then build keypoint-based behavior classification that distinguishes scratching (hind limbs) from grooming (front limbs) — the critical discriminator identified by the domain expert.

**Architecture:** SAM3 masks for tracking + DLC SuperAnimal-Quadruped for keypoint detection → keypoint-derived features (paw velocities, elevations, symmetry) → hierarchical state machine → temporal smoothing → behavior segments.

**Tech Stack:** DeepLabCut (SuperAnimal-Quadruped), ultralytics (SAM3), OpenCV, numpy, scipy, scikit-learn, Google Colab (GPU), FastAPI backend, React frontend.

**Prerequisite:** Obtain at least one 17-20 minute recording from the collaborator (Marina Gladkova, Bauer lab). Upload to `gs://mousercv-data/videos/bauer_lab/`.

---

## Phase 1: Validate Core CV Components (Notebooks)

Priority: DLC keypoints FIRST (gates everything), then SAM3.

### Task 1: Update DLC Evaluation Notebook for Collaborator Video

**Files:**
- Modify: `notebooks/02_evaluate_superanimal.ipynb`

The existing notebook needs updating based on what we now know:

- [ ] **Step 1: Add minimum viable keypoint evaluation**

Focus on the 6 essential keypoints: `nose`, `front_left_paw`, `front_right_paw`,
`back_left_paw`, `back_right_paw`, `tail_base`. Map these from DLC's 39
SuperAnimal-Quadruped keypoints (the names may differ slightly — `front_left_knee`
or `front_left_paw` etc.).

- [ ] **Step 2: Add paw velocity computation**

After running DLC inference, compute per-frame velocity for each paw keypoint:
```python
velocity = np.sqrt(np.diff(x)**2 + np.diff(y)**2)
```

Plot hind_paw_velocity vs front_paw_velocity as a 2D scatter — this should
show clear separation if the keypoints are reliable.

- [ ] **Step 3: Add paw elevation analysis**

For front-angle camera: hind paw y-coordinate when lifted for scratching should
be notably different from resting position. Plot hind_paw_y over time — scratch
bouts should show distinct dips (paw lifts up = lower y in image coords).

- [ ] **Step 4: Add confidence filtering analysis**

For each of the 6 keypoints: what % of frames have confidence > 0.3? > 0.5?
If hind paw keypoints drop below 50% reliability → we have a problem. Plot
confidence timeseries per keypoint.

- [ ] **Step 5: Visualize with behavior context**

If the collaborator provides manually annotated timestamps (scratch bouts,
grooming bouts), overlay these on the paw velocity plots. Do we see hind paw
spikes during annotated scratching? Front paw activity during grooming?

- [ ] **Step 6: Commit**

```bash
git add notebooks/02_evaluate_superanimal.ipynb
git commit -m "feat: update DLC notebook for paw-based behavior discrimination"
```

---

### Task 2: Update SAM3 Evaluation Notebook for Long Recordings

**Files:**
- Modify: `notebooks/01_evaluate_sam3.ipynb`

17-20 minute recordings are ~30,000-36,000 frames. SAM3 propagation needs
stress testing at this scale.

- [ ] **Step 1: Add re-prompting logic**

SAM3 propagation can lose masks over long sequences. Add checkpoint at every
1000 frames: if mask confidence drops below 0.3, log a "re-prompt needed" event.
Count total re-prompt events per video.

- [ ] **Step 2: Add multi-mouse tracking evaluation**

Test with 2-5 mice in frame. Do SAM3 identities remain consistent?
Compute identity-switch count by checking if mask centroids swap between objects.

- [ ] **Step 3: Add occlusion handling analysis**

For front-angle camera: when mice overlap (front-to-back), does SAM3 maintain
separate masks? Log frames where mask count drops below expected subject_count.

- [ ] **Step 4: Commit**

```bash
git add notebooks/01_evaluate_sam3.ipynb
git commit -m "feat: update SAM3 notebook for long recording stress test"
```

---

### Task 3: Create Combined Validation Notebook

**Files:**
- Create: `notebooks/05_validate_pipeline.ipynb`

End-to-end validation: SAM3 masks + DLC keypoints on the same video.

- [ ] **Step 1: Combine SAM3 + DLC pipeline**

Run SAM3 → crop per-mouse regions from masks → run DLC on crops.
Question to validate: does running DLC on SAM3-cropped regions improve
keypoint accuracy vs running DLC on the full frame?

- [ ] **Step 2: Compute combined features**

Per frame, per mouse:
- Mask features: area, aspect_ratio, convexity (from SAM3)
- Keypoint features: paw velocities, elevations, symmetry (from DLC)

Output as a pandas DataFrame for analysis.

- [ ] **Step 3: Manual annotation comparison**

If collaborator provides annotated timestamps:
- Extract feature vectors for annotated scratch bouts vs grooming bouts
- Compute t-SNE/UMAP embedding colored by behavior
- Report: are scratch and groom clusters separable in feature space?

- [ ] **Step 4: Commit**

```bash
git add notebooks/05_validate_pipeline.ipynb
git commit -m "feat: add combined SAM3+DLC validation notebook"
```

---

## Phase 2: Keypoint Feature Extraction

### Task 4: Build Keypoint Feature Extractor

**Files:**
- Create: `backend/app/services/keypoint_features.py`

- [ ] **Step 1: Define keypoint feature extraction functions**

```python
def extract_paw_features(
    keypoints: dict[str, tuple[float, float, float]],  # name -> (x, y, confidence)
    prev_keypoints: dict | None = None,
    fps: float = 30.0,
) -> dict[str, float]:
    """Extract paw-based features for behavior discrimination."""
```

Features to compute:
- `front_left_paw_velocity`, `front_right_paw_velocity`
- `back_left_paw_velocity`, `back_right_paw_velocity`
- `front_paw_mean_velocity` (average of both front paws)
- `back_paw_mean_velocity` (average of both hind paws)
- `paw_velocity_ratio` (back/front — high = scratching, low = grooming)
- `front_paw_symmetry` (correlation of L/R front paw movement — high during grooming)
- `back_paw_elevation` (y-coordinate relative to body center — elevated during scratching)
- `front_paw_to_nose_dist` (mean distance of front paws to nose — small during grooming)

- [ ] **Step 2: Add windowed temporal features**

```python
def extract_temporal_paw_features(
    feature_history: list[dict[str, float]],
    window_size: int = 15,
) -> dict[str, float]:
```

- `back_paw_oscillation_index` (std dev of back paw velocity — high during scratching)
- `front_paw_oscillation_index` (std dev of front paw velocity — high during grooming)
- `paw_velocity_ratio_stability` (std dev of ratio — stable during sustained behaviors)

- [ ] **Step 3: Verify with synthetic data**

Create unit tests with known paw positions that mimic:
- Scratching: hind paw moving rapidly, front paw stationary
- Grooming: front paw moving near face, hind paw stationary
- Idle: all paws stationary

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/keypoint_features.py
git commit -m "feat: add keypoint-based paw feature extraction"
```

---

### Task 5: Update State Machine with Paw-Based Discriminators

**Files:**
- Modify: `backend/app/services/state_machine.py`

- [ ] **Step 1: Add paw-based predicates**

Replace the oscillation-only approach with keypoint-informed predicates:

```python
# Scratching: hind paw active, front paw inactive
IDLE → SCRATCHING:
  back_paw_mean_velocity > threshold AND
  front_paw_mean_velocity < threshold AND
  back_paw_elevation > floor_threshold

# Grooming: front paw active, hind paw inactive
IDLE → GROOMING:
  front_paw_mean_velocity > threshold AND
  front_paw_to_nose_dist < face_threshold AND
  back_paw_mean_velocity < threshold

# Hypergrooming: grooming that exceeds duration threshold
GROOMING → HYPERGROOMING:
  time_in_grooming_state > 50 seconds

# Grooming-to-scratch transition (hypergrooming marker)
GROOMING → SCRATCHING:
  back_paw_mean_velocity spikes above threshold
```

- [ ] **Step 2: Add head shake detection (experimental)**

```python
def detect_head_shake(
    keypoints_history: list[dict],
    window: int = 10,
) -> bool:
    """Detect rapid lateral nose oscillation."""
    nose_x = [kp['nose'][0] for kp in keypoints_history[-window:]]
    lateral_std = np.std(nose_x)
    return lateral_std > HEAD_SHAKE_THRESHOLD
```

Track as metadata, not classification. Log for SME analysis.

- [ ] **Step 3: Support dual feature sources**

The state machine should work with:
- Keypoint features only (DLC available)
- Mask features only (DLC unavailable/unreliable)
- Combined (best accuracy)

Add a `feature_mode: Literal["keypoints", "mask", "combined"]` config option.

- [ ] **Step 4: Verify updated state machine**

Test with synthetic feature sequences for all behavior transitions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/state_machine.py
git commit -m "feat: add paw-based behavior discrimination to state machine"
```

---

## Phase 3: Annotation UI for Collaborator

### Task 6: Add Hypergrooming to Behavior Categories

**Files:**
- Modify: `backend/app/routers/annotations.py`
- Modify: `frontend/src/data/mock.ts` (or wherever behavior categories are defined)

- [ ] **Step 1: Add hypergrooming to the behavior enum/list**

```python
BEHAVIOR_CATEGORIES = [
    {"name": "grooming", "color": "#22c55e", "hotkey": "1"},
    {"name": "scratching", "color": "#f97316", "hotkey": "2"},
    {"name": "rearing", "color": "#a855f7", "hotkey": "3"},
    {"name": "idle", "color": "#6b7280", "hotkey": "4"},
    {"name": "uncertain", "color": "#fbbf24", "hotkey": "5"},
    {"name": "hypergrooming", "color": "#14b8a6", "hotkey": "6"},
    {"name": "head_shake", "color": "#ec4899", "hotkey": "7"},
]
```

- [ ] **Step 2: Update frontend behavior timeline lane**

Add hypergrooming and head_shake lanes to the behavior timeline visualization.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/annotations.py frontend/src/
git commit -m "feat: add hypergrooming and head_shake behavior categories"
```

---

### Task 7: Add Video Upload from GCS to Frontend

**Files:**
- Modify: `frontend/src/components/` (video player component)

- [ ] **Step 1: Load video from GCS signed URL**

When a video has `gcs_uri` set, generate a signed URL via the backend and
load it into the video player. The current player shows "No video loaded"
because there's no real video yet.

Add endpoint: `GET /api/videos/{id}/stream-url` → returns signed GCS URL.

- [ ] **Step 2: Test with a real collaborator video**

Upload a test video to GCS, verify it plays in the deployed app at
mousercv.dejandukic.dev.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: load video from GCS signed URL in player"
```

---

## Phase 4: Hypothesis Pipeline

### Task 8: Build Feature Analysis Dashboard Notebook

**Files:**
- Create: `notebooks/06_hypothesis_pipeline.ipynb`

This is run AFTER the SME annotates 3-5 videos.

- [ ] **Step 1: Load annotated behavior segments + extracted features**

- [ ] **Step 2: Per-behavior feature distributions**

For each of the 6 behaviors, compute distributions of:
- back_paw_mean_velocity, front_paw_mean_velocity
- paw_velocity_ratio
- front_paw_symmetry
- mask area, aspect_ratio, convexity
- bout duration

Violin plots + box plots per behavior.

- [ ] **Step 3: Discriminative feature ranking**

ANOVA F-statistic, mutual information, RF importance for all features.
Report top-10 most discriminative features.

- [ ] **Step 4: Head shake → scratching correlation**

For all detected head_shake events, measure time to next scratching bout.
Plot distribution. Report: is head shaking predictive?

- [ ] **Step 5: Grooming → hypergrooming escalation**

For all grooming bouts, plot duration distribution.
At what duration threshold does grooming become hypergrooming?
Is the collaborator's 50s threshold supported by the data?

- [ ] **Step 6: Auto-generate threshold proposals**

Based on feature distributions, compute optimal split points for each
state machine threshold. Output as YAML config.

- [ ] **Step 7: Commit**

```bash
git add notebooks/06_hypothesis_pipeline.ipynb
git commit -m "feat: add hypothesis pipeline notebook for feature analysis"
```

---

## Phase 5: Deploy Updated System

### Task 9: Rebuild and Redeploy

- [ ] **Step 1: Rebuild Docker image with updated backend**

```bash
docker buildx build --platform linux/amd64 -t europe-west1-docker.pkg.dev/mousercv/mousercv/api:latest --push .
```

- [ ] **Step 2: Deploy to Cloud Run**

```bash
gcloud run deploy mousercv-api \
  --image=europe-west1-docker.pkg.dev/mousercv/mousercv/api:latest \
  --region=europe-west1 --quiet
```

- [ ] **Step 3: Verify at mousercv.dejandukic.dev**

Open in Chrome, check console errors, verify new behavior categories visible.

- [ ] **Step 4: Commit everything**

---

## Dependency Graph

```
Task 1 (DLC notebook) ─┐
                        ├── Task 3 (combined validation)
Task 2 (SAM3 notebook) ─┘         │
                                   ├── Task 4 (keypoint features)
                                   │         │
                                   │         ├── Task 5 (state machine update)
                                   │         │
Task 6 (hypergrooming UI) ─────────┤         │
Task 7 (video from GCS) ──────────┤         │
                                   │         │
                                   └── Task 8 (hypothesis pipeline)
                                              │
                                              └── Task 9 (deploy)
```

**Parallelizable:** Tasks 1+2, Tasks 6+7, Tasks 4+6+7

## Discussion Points for Morning

1. **Do we have a collaborator video to test with?** Everything gates on this.
   The notebooks are ready but need real data to validate.

2. **DLC keypoint reliability is the critical unknown.** If SuperAnimal-Quadruped
   gives <50% confidence on mouse paws from the front angle → we fall back to
   mask-only features (lower accuracy on scratch vs groom).

3. **The >10s exclusion rule may need revisiting.** Literature shows some scratch
   bouts (chloroquine model) average ~7.5s with tails >10s. The collaborator's
   rule might exclude valid scratching. Worth discussing with the SME.

4. **Hypergrooming detection is duration-based for now.** The 50s threshold from
   the SME's notes is our starting point. The hypothesis pipeline (Task 8) will
   validate whether this is the right cutoff.

5. **Head shaking as a precursor is novel.** Not documented in literature. If we
   can validate this computationally, it's a finding worth including in their
   publication.

6. **Arcadia Science's open-source DLC scratching code** is directly relevant:
   https://github.com/Arcadia-Science/trove-deeplabcut/tree/v1.0
   We should review their peak-finding algorithm on hind limb displacement.

7. **The EGFR pruritus mechanism is multi-factorial** (TSLP, TH2 cytokines,
   mast cells, xerosis). If the collaborator is testing treatments (JAK
   inhibitors, FGF7), our tool needs to show treatment response — i.e.,
   reduced scratch bout count/duration post-treatment. Export formats should
   support before/after comparison per group.

8. **Kit W-sh x EGFR crossing appears to be unpublished ongoing work.** If
   they're crossing mast cell-depleted mice with EGFR models, we'll need to
   handle the fact that Kit W-sh homozygotes are albino-like — different fur
   color may affect DLC keypoint detection. Worth checking.

9. **The EGFRΔEgr2 model survives 5+ months.** This means longitudinal
   behavioral studies are feasible — same mice recorded weekly/monthly.
   Our system should support per-mouse longitudinal tracking and trend
   visualization (scratch bout count over time per animal).
