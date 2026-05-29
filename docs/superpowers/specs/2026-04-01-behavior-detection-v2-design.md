---
title: MouserCV Behavior Detection v2 — Informed by Collaborator Domain Knowledge
date: 2026-04-01
status: draft
supersedes: 2026-03-24-behavior-detection-design.md
---

# MouserCV Behavior Detection v2

## What Changed

The collaborator's presentation (Marina Gladkova, Bauer lab CCR, IAI-SHIELD PhD)
provided critical domain knowledge that refines our detection architecture:

1. **Scratching = hind limbs. Grooming = front limbs.** This is the definitive
   discriminator. Not oscillation frequency, not mask geometry — which limb.

2. **Hypergrooming is a 5th behavior class.** Prolonged (50s-5min), often
   interrupted by scratching bouts. Pathological, not normal self-care.

3. **Head shaking precedes scratching bouts.** Undocumented in literature but
   observed by SME. Potential precursor signal for prediction.

4. **At 30fps, individual scratch strokes (~20Hz) are invisible.** We detect
   bout-level structure: hind leg lift → oscillation blur → hindpaw lick → return.

5. **No published EGFR model scratching quantification exists.** This behavioral
   work would be novel and publishable — motivation for high accuracy.

6. **The ">10 consecutive seconds" exclusion rule.** Acute scratch bouts are
   typically 2-9s. Movements >10s are likely grooming. But some bouts (e.g.
   chloroquine model) average ~7.5s with tails exceeding 10s.

## Updated Behavior Categories

| Behavior     | Limb        | Duration      | Key Signal |
|-------------|-------------|---------------|------------|
| Scratching  | Hind limbs  | 0.5-10s       | Hind paw lift + rapid oscillation + paw lick |
| Grooming    | Front limbs | <10s          | Bilateral front paw face/body washing |
| Hypergrooming| Front limbs | 50s-5min     | Prolonged cephalocaudal grooming, often interrupted by scratching |
| Rearing     | N/A         | 1-15s         | Vertical body elongation |
| Idle        | N/A         | variable      | Minimal movement |
| Uncertain   | N/A         | any           | Low-confidence classification |

Additional tracked (not classified) behaviors:
- **Locomotion** — analytics metric (distance, speed, bouts)
- **Head shaking** — potential scratching precursor, track for analysis

## Updated Architecture

The critical change: **DLC SuperAnimal keypoints are not optional Tier 3 — they
are essential Tier 1.** Without front/hind paw discrimination, we cannot
distinguish the primary behaviors.

```
Pipeline:
  SAM3 masks (tracking + segmentation)
      +
  DLC SuperAnimal-Quadruped (6 minimum keypoints)
      ↓
  Feature extraction:
    Mask geometry (area, aspect ratio, convexity — for rearing/idle)
    Keypoint dynamics (paw positions, velocities — for scratch/groom)
      ↓
  Hierarchical State Machine
      ↓
  Temporal smoothing → Behavior segments
```

### Minimum Viable Keypoints (from DLC SuperAnimal)

| Keypoint | Why |
|----------|-----|
| nose | Head orientation, grooming phase detection |
| front_left_paw | Grooming detection (bilateral front paw movement) |
| front_right_paw | Grooming detection |
| back_left_paw | Scratching detection (hind limb oscillation) |
| back_right_paw | Scratching detection |
| tail_base | Body orientation, rearing detection |

Optional but valuable: ear tips (head shake detection), spine points (posture).

### Keypoint-Derived Features for Scratch vs Groom

| Feature | Scratching | Grooming |
|---------|-----------|----------|
| hind_paw_velocity | HIGH (rapid oscillation) | LOW (stationary) |
| front_paw_velocity | LOW (stationary) | HIGH (bilateral strokes) |
| hind_paw_elevation | ELEVATED (lifted to body) | FLOOR level |
| front_paw_to_face_dist | N/A | SMALL (paws near face) |
| front_paw_symmetry | N/A | HIGH (bilateral movement) |
| body_tilt | TILTED (leaning into scratch) | UPRIGHT or slightly hunched |

### Updated State Machine

```
Level 1: MOVING vs STATIONARY (centroid velocity)

Level 2 (when STATIONARY):
  IDLE → SCRATCHING:
    hind_paw_velocity > threshold AND hind_paw_elevation > floor_level
    Activation: 3 frames (~100ms)

  IDLE → GROOMING:
    front_paw_velocity > threshold AND front_paw_to_face_dist < threshold
    Activation: 5 frames (~167ms)

  GROOMING → HYPERGROOMING:
    grooming_duration > 50 seconds
    (Auto-escalation, not a separate trigger)

  GROOMING → SCRATCHING:
    hind_paw_velocity spikes during grooming bout
    (Interrupted hypergrooming = transition marker)

  IDLE → REARING:
    aspect_ratio > 1.3 AND area_decrease AND centroid_up
    Activation: 4 frames

  Any → UNCERTAIN:
    confidence < threshold OR conflicting signals

Level 3: Temporal validation (same as before)
```

### Head Shake Detection (Experimental)

Track nose/ear keypoint jitter in a short window (~10 frames). If rapid
lateral oscillation detected while otherwise idle → flag as "head_shake"
event. Correlate with subsequent scratching onset in the hypothesis pipeline.

Not used for classification yet — tracked as metadata for the SME to validate.

## Recording Protocol Alignment

The SME's protocol matches literature standards:
- 30fps mobile phone video ✓ (Scratch-AID validated at 720x720/30fps)
- Cleared cage without enrichment ✓ (reduces occlusion)
- 17-20 minute recordings ✓ (captures acute response)
- Front-angled camera ✓ (good for limb visibility)

Recommendations to discuss with collaborator:
- Consider 30-minute recordings for chronic model baseline
- IR lighting for dark-cycle recordings if needed
- Fixed camera mount for consistency across sessions

## Notebook Priority Update

Given that keypoints are now Tier 1, the notebook evaluation order changes:

1. **02_evaluate_superanimal.ipynb** — FIRST PRIORITY. Run DLC on a collaborator
   video. Which of the 6 essential keypoints are reliable on mice at 30fps from
   front angle? This gates everything.

2. **01_evaluate_sam3.ipynb** — Run SAM3 on same video. Does prompt-propagation
   maintain identity through a full 17-min recording?

3. **03_process_video.ipynb** — Full pipeline only after both components validated.

## Hypothesis Pipeline Additions

When SME annotates 3-5 videos:
1. Extract hind_paw_velocity and front_paw_velocity time series
2. Overlay on annotated scratch/groom segments
3. Compute separability metrics — how cleanly does paw velocity discriminate?
4. Identify the optimal velocity thresholds
5. Check: does head shaking actually precede scratching bouts?
6. Quantify grooming → hypergrooming escalation patterns

## Expected Accuracy (Revised)

With keypoint-based paw discrimination available:

| Behavior | State Machine | After RF Training |
|----------|--------------|-------------------|
| Scratching | 85-92% | 90-96% |
| Grooming | 80-88% | 85-93% |
| Hypergrooming | 75-85% | 80-90% |
| Rearing | 90-97% | 95-99% |
| Idle | 80-88% | 85-93% |

The grooming accuracy improves dramatically vs the mask-only approach (was
55-70%) because we now have the definitive signal: front paw activity.

## Collaborator Context: EGFR Pruritus Model

**Lab**: Thomas Bauer lab, Center for Cancer Research, Medical University of Vienna.
Emerged from Maria Sibilia's lab. Part of IAI-SHIELD PhD programme.

**Model**: EGFRΔEgr2 — hair follicle-specific EGFR deletion via Egr2-Cre.
Survives 5+ months (unlike EGFRΔep which dies in weeks). Develops:
- Barrier defects → microbiota invasion → TH2 atopic-like inflammation
- Pruritus via TSLP, IL-4/IL-13, mast cell activation, xerosis
- JAK-STAT1 hyper-activation → hair follicle stem cell destruction

**Key papers**: Lichtenberger 2013 (Sci Transl Med), Klufa 2019 (Sci Transl Med),
Strobl 2024 (EMBO Mol Med). None include behavioral quantification.

**Clinical relevance**: EGFR inhibitors (cetuximab, erlotinib) cause pruritus in
17-58% of cancer patients (PRIDE complex). Automated behavioral quantification
in this mouse model would support therapeutic development (JAK inhibitors,
FGF7/palifermin).

**Publication opportunity**: No published EGFR model scratching quantification
exists. This behavioral work + automated tool would be novel.

## Implementation Priority

Phase 1: Validate DLC keypoints on collaborator video (notebook 02)
Phase 2: Validate SAM3 tracking on same video (notebook 01)
Phase 3: Build keypoint feature extraction pipeline
Phase 4: Update state machine with paw-based discriminators
Phase 5: SME annotation of 3-5 videos + hypothesis pipeline
Phase 6: RF classifier training + active learning loop
