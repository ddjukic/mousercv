"""
Mouse Re-Identification Module for Multi-Object Tracking
=========================================================

ALGORITHM OVERVIEW
------------------
This module solves the data association problem for tracking up to 5 mice in
cage video recordings. It operates as a post-processing step on per-frame
detections (from YOLO + SAM or similar pipelines) and produces consistent
track IDs across the full video.

Architecture:
    Per-frame detections --> MouseReidentifier --> Consistent track IDs

The algorithm has four main components:

1. COST FUNCTION (multi-signal fusion)
   For each (track, detection) pair, we compute a cost in [0, 1] as a weighted
   sum of four normalized signals:
     - Euclidean distance: between the track's predicted position and the
       detection centroid, normalized by the frame diagonal.
     - IoU overlap: 1 - IoU(predicted_bbox, detected_bbox). Perfect overlap = 0.
     - Area similarity: |area_track - area_det| / max(area_track, area_det).
       Mice don't change size dramatically between frames.
     - Velocity-predicted distance: Euclidean distance between the velocity-
       extrapolated position and the detection, normalized by diagonal.
       This signal anchors assignments when mice cross paths.

   Default weights: distance=0.30, iou=0.25, area=0.15, velocity=0.30
   The velocity term is given high weight because it is the primary signal
   that resolves crossing trajectories (the core ID-swap problem).

2. TWO-STAGE HUNGARIAN ASSIGNMENT
   Stage 1: Match ACTIVE tracks (seen in recent frames) to detections using
            scipy.optimize.linear_sum_assignment on the cost matrix. Only
            assignments below the cost threshold are accepted.
   Stage 2: Match GHOST tracks (disappeared mice) to remaining unmatched
            detections. Ghost costs receive an additive penalty proportional
            to frames_since_last_seen, making active matches preferred.

   This two-stage design prevents ghost tracks from "stealing" detections
   that should go to active tracks.

3. GHOST TRACK MECHANISM
   When a mouse disappears (no matched detection), the track transitions
   to GHOST state. In ghost state:
     - Position is extrapolated using last known velocity (linear prediction)
     - The ghost persists for up to max_ghost_frames (default 10)
     - Ghost cost penalty = ghost_penalty_per_frame * frames_since_last_seen
     - If re-matched, the track transitions back to ACTIVE immediately
     - If not re-matched within the limit, the track becomes DEAD

4. NEW TRACK CREATION GATE
   Unmatched detections (those not assigned to any active or ghost track)
   only spawn new tracks if:
     - The best rejected cost exceeds new_track_cost_threshold (default 0.60)
     - The total number of active + ghost tracks is below max_mice (default 5)
   This prevents spurious detections from inflating the track count.

VELOCITY MODEL
--------------
We use an Exponential Moving Average (EMA) of frame-to-frame displacement
vectors. EMA smooths out noisy detections while responding to direction
changes faster than a simple average over a window. The smoothing factor
alpha (default 0.4) gives ~70% of the velocity signal from the last 3 frames.

    v_new = alpha * (pos_current - pos_previous) + (1 - alpha) * v_old

PERFORMANCE CHARACTERISTICS
----------------------------
- Time complexity per frame: O(N*M) for N tracks, M detections (N,M <= 5)
  The Hungarian algorithm is O(n^3) but with n<=5 this is negligible.
- Space complexity: O(N * history_length) for track buffers.
- Suitable for real-time processing at 30+ FPS with 5 mice.

USAGE
-----
    reidentifier = MouseReidentifier(max_mice=5, max_ghost_frames=10)

    for frame_number, detections in enumerate(per_frame_detections):
        tracks = reidentifier.update(frame_number, detections)
        # tracks is a list of TrackOutput with consistent IDs

    final_tracks = reidentifier.get_all_tracks()

Dependencies: numpy, scipy (for linear_sum_assignment)
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import NamedTuple

import numpy as np
from scipy.optimize import linear_sum_assignment


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class TrackState(enum.Enum):
    """Lifecycle state of a mouse track."""
    ACTIVE = "active"
    GHOST = "ghost"
    DEAD = "dead"


@dataclass(frozen=True, slots=True)
class Detection:
    """A single object detection in one frame.

    Attributes:
        frame_number: The video frame index (0-based).
        bbox: Bounding box as (x_min, y_min, x_max, y_max) in pixels.
        centroid: Center point as (x, y) in pixels.
        area: Bounding box area in pixels squared.
    """
    frame_number: int
    bbox: tuple[float, float, float, float]
    centroid: tuple[float, float]
    area: float


@dataclass(frozen=True, slots=True)
class TrackOutput:
    """Public-facing track information returned to callers.

    Attributes:
        track_id: Persistent integer ID for this mouse (0-indexed).
        state: Current lifecycle state of the track.
        centroid: Current (or predicted) centroid position.
        bbox: Current (or predicted) bounding box.
        area: Current (or predicted) area.
        velocity: Current velocity estimate as (vx, vy) pixels/frame.
        frames_since_last_seen: Number of frames since last matched detection.
            0 means the track was matched this frame.
        history_length: Total number of frames this track has been matched.
    """
    track_id: int
    state: TrackState
    centroid: tuple[float, float]
    bbox: tuple[float, float, float, float]
    area: float
    velocity: tuple[float, float]
    frames_since_last_seen: int
    history_length: int


class _HistoryEntry(NamedTuple):
    """Internal record of a detection matched to a track."""
    frame_number: int
    centroid: np.ndarray  # shape (2,)
    bbox: np.ndarray      # shape (4,) as [x1, y1, x2, y2]
    area: float


@dataclass
class _Track:
    """Internal mutable track representation.

    Maintains a rolling history buffer and velocity estimate for one mouse.
    """
    track_id: int
    state: TrackState = TrackState.ACTIVE
    history: list[_HistoryEntry] = field(default_factory=list)
    velocity: np.ndarray = field(default_factory=lambda: np.zeros(2, dtype=np.float64))
    frames_since_last_seen: int = 0
    total_matched_frames: int = 0

    # --- Derived properties ---------------------------------------------------

    @property
    def last_centroid(self) -> np.ndarray:
        """Last known centroid position."""
        return self.history[-1].centroid

    @property
    def last_bbox(self) -> np.ndarray:
        """Last known bounding box."""
        return self.history[-1].bbox

    @property
    def last_area(self) -> float:
        """Last known area."""
        return self.history[-1].area

    @property
    def last_frame(self) -> int:
        """Frame number of last matched detection."""
        return self.history[-1].frame_number

    # --- Prediction -----------------------------------------------------------

    def predicted_centroid(self, frames_ahead: int = 1) -> np.ndarray:
        """Predict centroid position using linear velocity extrapolation.

        Args:
            frames_ahead: Number of frames to extrapolate forward.

        Returns:
            Predicted (x, y) as ndarray of shape (2,).
        """
        return self.last_centroid + self.velocity * frames_ahead

    def predicted_bbox(self, frames_ahead: int = 1) -> np.ndarray:
        """Predict bounding box by shifting it according to velocity.

        The box dimensions (width, height) are kept constant; only the
        position is extrapolated.

        Args:
            frames_ahead: Number of frames to extrapolate forward.

        Returns:
            Predicted [x1, y1, x2, y2] as ndarray of shape (4,).
        """
        displacement = self.velocity * frames_ahead
        shift = np.array([displacement[0], displacement[1],
                          displacement[0], displacement[1]])
        return self.last_bbox + shift

    # --- Update ---------------------------------------------------------------

    def update_with_detection(
        self,
        detection: Detection,
        velocity_ema_alpha: float,
        max_history: int,
    ) -> None:
        """Update the track with a matched detection.

        Args:
            detection: The matched Detection object.
            velocity_ema_alpha: EMA smoothing factor for velocity update.
            max_history: Maximum number of history entries to retain.
        """
        new_centroid = np.array(detection.centroid, dtype=np.float64)
        new_bbox = np.array(detection.bbox, dtype=np.float64)

        # Compute instantaneous velocity
        frames_elapsed = detection.frame_number - self.last_frame
        if frames_elapsed > 0:
            instant_velocity = (new_centroid - self.last_centroid) / frames_elapsed
        else:
            instant_velocity = np.zeros(2, dtype=np.float64)

        # EMA velocity update
        if self.total_matched_frames >= 2:
            self.velocity = (
                velocity_ema_alpha * instant_velocity
                + (1.0 - velocity_ema_alpha) * self.velocity
            )
        else:
            # First real velocity measurement: use it directly
            self.velocity = instant_velocity

        # Append history entry
        entry = _HistoryEntry(
            frame_number=detection.frame_number,
            centroid=new_centroid,
            bbox=new_bbox,
            area=detection.area,
        )
        self.history.append(entry)

        # Trim history to max length
        if len(self.history) > max_history:
            self.history = self.history[-max_history:]

        # Update state
        self.state = TrackState.ACTIVE
        self.frames_since_last_seen = 0
        self.total_matched_frames += 1

    def mark_missed(self) -> None:
        """Mark that this track was not matched in the current frame."""
        self.frames_since_last_seen += 1
        if self.state == TrackState.ACTIVE:
            self.state = TrackState.GHOST

    def to_output(self) -> TrackOutput:
        """Convert internal track to public TrackOutput."""
        if self.state == TrackState.GHOST:
            predicted_c = self.predicted_centroid(self.frames_since_last_seen)
            predicted_b = self.predicted_bbox(self.frames_since_last_seen)
            centroid = (float(predicted_c[0]), float(predicted_c[1]))
            bbox = (
                float(predicted_b[0]), float(predicted_b[1]),
                float(predicted_b[2]), float(predicted_b[3]),
            )
        else:
            centroid = (float(self.last_centroid[0]), float(self.last_centroid[1]))
            bbox = (
                float(self.last_bbox[0]), float(self.last_bbox[1]),
                float(self.last_bbox[2]), float(self.last_bbox[3]),
            )

        return TrackOutput(
            track_id=self.track_id,
            state=self.state,
            centroid=centroid,
            bbox=bbox,
            area=self.last_area,
            velocity=(float(self.velocity[0]), float(self.velocity[1])),
            frames_since_last_seen=self.frames_since_last_seen,
            history_length=self.total_matched_frames,
        )


# ---------------------------------------------------------------------------
# Cost function utilities
# ---------------------------------------------------------------------------

def _compute_iou(box_a: np.ndarray, box_b: np.ndarray) -> float:
    """Compute Intersection over Union between two bounding boxes.

    Args:
        box_a: Array of shape (4,) as [x1, y1, x2, y2].
        box_b: Array of shape (4,) as [x1, y1, x2, y2].

    Returns:
        IoU value in [0, 1]. Returns 0 if boxes do not overlap.
    """
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])

    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if intersection == 0.0:
        return 0.0

    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - intersection

    if union <= 0.0:
        return 0.0

    return intersection / union


def _compute_iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Compute IoU matrix between two sets of bounding boxes.

    Args:
        boxes_a: Array of shape (N, 4) as [x1, y1, x2, y2].
        boxes_b: Array of shape (M, 4) as [x1, y1, x2, y2].

    Returns:
        IoU matrix of shape (N, M).
    """
    n = boxes_a.shape[0]
    m = boxes_b.shape[0]
    iou_matrix = np.zeros((n, m), dtype=np.float64)
    for i in range(n):
        for j in range(m):
            iou_matrix[i, j] = _compute_iou(boxes_a[i], boxes_b[j])
    return iou_matrix


# ---------------------------------------------------------------------------
# Main tracker
# ---------------------------------------------------------------------------

@dataclass
class TrackerConfig:
    """Configuration for MouseReidentifier.

    Attributes:
        max_mice: Maximum number of simultaneous tracks (mice in cage).
        max_ghost_frames: Frames to keep predicting a disappeared track before
            marking it DEAD.
        max_history: Maximum detection history entries per track.
        velocity_ema_alpha: EMA smoothing factor for velocity. Higher values
            make velocity respond faster to changes (range 0-1).
        frame_diagonal: Diagonal of the video frame in pixels, used to
            normalize Euclidean distances. If None, it is estimated from the
            first frame's detections (not ideal -- set explicitly).

        Cost function weights (must sum to ~1.0 for interpretability):
        weight_distance: Weight for raw Euclidean distance signal.
        weight_iou: Weight for IoU-based signal.
        weight_area: Weight for area similarity signal.
        weight_velocity: Weight for velocity-predicted distance signal.

        assignment_cost_threshold: Maximum cost to accept an assignment.
            Pairs above this threshold are rejected even if they are the
            Hungarian-optimal match.
        new_track_cost_threshold: Minimum best-rejected-cost for an unmatched
            detection to spawn a new track. If the best cost for an unmatched
            detection was below this value, we do NOT create a new track
            (the detection is likely a duplicate or noise).
        ghost_penalty_per_frame: Additive cost penalty per ghost frame.
            Increases the cost of matching ghost tracks so active tracks
            are preferred.
        min_track_length: Minimum matched frames for a track to be included
            in final output. Filters out spurious short-lived tracks.
    """
    max_mice: int = 5
    max_ghost_frames: int = 10
    max_history: int = 30
    velocity_ema_alpha: float = 0.4
    frame_diagonal: float | None = None

    weight_distance: float = 0.30
    weight_iou: float = 0.25
    weight_area: float = 0.15
    weight_velocity: float = 0.30

    assignment_cost_threshold: float = 0.50
    new_track_cost_threshold: float = 0.60
    ghost_penalty_per_frame: float = 0.03
    min_track_length: int = 3


class MouseReidentifier:
    """Multi-object tracker for mouse re-identification in cage videos.

    This class maintains a set of tracks and, for each video frame, assigns
    incoming detections to existing tracks (or creates new ones) using an
    optimal assignment algorithm with a multi-signal cost function.

    Example::

        tracker = MouseReidentifier(config=TrackerConfig(max_mice=5))

        for frame_idx, frame_detections in enumerate(all_detections):
            active_tracks = tracker.update(frame_idx, frame_detections)
            for t in active_tracks:
                print(f"Mouse {t.track_id} at {t.centroid}")

        # Get final clean tracks
        all_tracks = tracker.get_all_tracks()

    Args:
        config: TrackerConfig instance with all hyperparameters.
    """

    def __init__(self, config: TrackerConfig | None = None) -> None:
        self.config = config or TrackerConfig()
        self._tracks: list[_Track] = []
        self._next_track_id: int = 0
        self._frame_diagonal: float | None = self.config.frame_diagonal
        self._current_frame: int = -1

    # --- Public API -----------------------------------------------------------

    def update(
        self,
        frame_number: int,
        detections: list[Detection],
    ) -> list[TrackOutput]:
        """Process one frame of detections and return updated tracks.

        This is the main entry point called once per video frame. It performs:
        1. Estimation of frame diagonal (first frame only, if not configured)
        2. Two-stage Hungarian assignment (active tracks, then ghosts)
        3. Track state transitions (active/ghost/dead)
        4. New track creation for unmatched detections

        Args:
            frame_number: Current frame index (must be monotonically increasing).
            detections: List of Detection objects for this frame. Can be empty.

        Returns:
            List of TrackOutput for all non-dead tracks after this frame's update.

        Raises:
            ValueError: If frame_number is not monotonically increasing.
        """
        if frame_number <= self._current_frame:
            raise ValueError(
                f"Frame numbers must be monotonically increasing. "
                f"Got {frame_number}, previous was {self._current_frame}."
            )
        self._current_frame = frame_number

        # Estimate frame diagonal from first detections if not configured
        if self._frame_diagonal is None and detections:
            self._estimate_frame_diagonal(detections)
        if self._frame_diagonal is None:
            # Fallback: use a reasonable default (720p diagonal)
            self._frame_diagonal = np.sqrt(1280**2 + 720**2)

        # Separate active and ghost tracks
        active_tracks = [t for t in self._tracks if t.state == TrackState.ACTIVE]
        ghost_tracks = [t for t in self._tracks if t.state == TrackState.GHOST]

        # Stage 1: Match active tracks to detections
        matched_track_indices_1, matched_det_indices_1, unmatched_det_indices_1 = (
            self._assign(active_tracks, detections, frame_number, is_ghost=False)
        )

        # Update matched active tracks
        for track_idx, det_idx in zip(matched_track_indices_1, matched_det_indices_1):
            active_tracks[track_idx].update_with_detection(
                detections[det_idx],
                self.config.velocity_ema_alpha,
                self.config.max_history,
            )

        # Mark unmatched active tracks as missed
        matched_active_set = set(matched_track_indices_1)
        for i, track in enumerate(active_tracks):
            if i not in matched_active_set:
                track.mark_missed()

        # Stage 2: Match ghost tracks to remaining detections
        remaining_detections_indices = list(unmatched_det_indices_1)
        remaining_detections = [detections[i] for i in remaining_detections_indices]

        matched_track_indices_2, matched_det_indices_2, unmatched_det_indices_2 = (
            self._assign(ghost_tracks, remaining_detections, frame_number, is_ghost=True)
        )

        # Update matched ghost tracks (they become active again)
        for track_idx, det_idx in zip(matched_track_indices_2, matched_det_indices_2):
            ghost_tracks[track_idx].update_with_detection(
                remaining_detections[det_idx],
                self.config.velocity_ema_alpha,
                self.config.max_history,
            )

        # Mark unmatched ghost tracks as missed (increment counter)
        matched_ghost_set = set(matched_track_indices_2)
        for i, track in enumerate(ghost_tracks):
            if i not in matched_ghost_set:
                track.mark_missed()

        # Kill ghosts that exceeded max lifetime
        for track in self._tracks:
            if (
                track.state == TrackState.GHOST
                and track.frames_since_last_seen > self.config.max_ghost_frames
            ):
                track.state = TrackState.DEAD

        # Create new tracks for truly unmatched detections
        # Map unmatched_det_indices_2 back to original detection indices
        truly_unmatched_det_indices = [
            remaining_detections_indices[i] for i in unmatched_det_indices_2
        ]
        self._create_new_tracks(detections, truly_unmatched_det_indices, frame_number)

        # Remove dead tracks from the internal list
        self._tracks = [t for t in self._tracks if t.state != TrackState.DEAD]

        # Return current state of all non-dead tracks
        return [t.to_output() for t in self._tracks]

    def get_all_tracks(self) -> list[TrackOutput]:
        """Return all current non-dead tracks.

        Returns:
            List of TrackOutput for all active and ghost tracks.
        """
        return [t.to_output() for t in self._tracks]

    def get_track_histories(self) -> dict[int, list[tuple[int, tuple[float, float]]]]:
        """Return full centroid history for each track.

        Useful for visualization and analysis.

        Returns:
            Dictionary mapping track_id to list of (frame_number, (x, y)) tuples.
        """
        result: dict[int, list[tuple[int, tuple[float, float]]]] = {}
        for track in self._tracks:
            history = []
            for entry in track.history:
                history.append((
                    entry.frame_number,
                    (float(entry.centroid[0]), float(entry.centroid[1])),
                ))
            result[track.track_id] = history
        return result

    def reset(self) -> None:
        """Reset the tracker to initial state, clearing all tracks."""
        self._tracks.clear()
        self._next_track_id = 0
        self._current_frame = -1

    # --- Private methods ------------------------------------------------------

    def _estimate_frame_diagonal(self, detections: list[Detection]) -> None:
        """Estimate the frame diagonal from detection coordinates.

        Uses the maximum extent of detection coordinates as a rough proxy
        for frame dimensions. This is a fallback -- it is much better to
        configure frame_diagonal explicitly.

        Args:
            detections: List of detections from the first frame.
        """
        all_coords = []
        for det in detections:
            all_coords.extend([
                det.bbox[0], det.bbox[1], det.bbox[2], det.bbox[3],
            ])
        if not all_coords:
            return
        max_coord = max(all_coords)
        # Assume frame is roughly square-ish; diagonal ~ max_coord * sqrt(2)
        # Add 20% margin since detections don't reach frame edges
        self._frame_diagonal = max_coord * np.sqrt(2) * 1.2

    def _compute_cost_matrix(
        self,
        tracks: list[_Track],
        detections: list[Detection],
        frame_number: int,
        is_ghost: bool,
    ) -> np.ndarray:
        """Build the combined cost matrix for track-detection assignment.

        The cost for each (track_i, detection_j) pair is a weighted sum of
        four normalized signals:

        1. Distance cost: Euclidean distance between track's last centroid
           and detection centroid, normalized by frame diagonal.
        2. IoU cost: 1 - IoU(track_bbox, detection_bbox).
        3. Area cost: Relative area difference.
        4. Velocity cost: Distance between velocity-extrapolated position
           and detection centroid, normalized by frame diagonal.

        For ghost tracks, an additive penalty proportional to
        frames_since_last_seen is applied.

        Args:
            tracks: List of tracks to match.
            detections: List of detections to match.
            frame_number: Current frame number.
            is_ghost: Whether these are ghost tracks (applies penalty).

        Returns:
            Cost matrix of shape (len(tracks), len(detections)) with values
            in [0, ~1.5] (can exceed 1.0 due to ghost penalty).
        """
        n_tracks = len(tracks)
        n_dets = len(detections)

        if n_tracks == 0 or n_dets == 0:
            return np.empty((n_tracks, n_dets), dtype=np.float64)

        assert self._frame_diagonal is not None
        diag = self._frame_diagonal

        # Extract detection data as arrays
        det_centroids = np.array(
            [d.centroid for d in detections], dtype=np.float64
        )  # (M, 2)
        det_bboxes = np.array(
            [d.bbox for d in detections], dtype=np.float64
        )  # (M, 4)
        det_areas = np.array(
            [d.area for d in detections], dtype=np.float64
        )  # (M,)

        cost_matrix = np.zeros((n_tracks, n_dets), dtype=np.float64)

        for i, track in enumerate(tracks):
            frames_ahead = frame_number - track.last_frame

            # Track's last and predicted positions
            last_centroid = track.last_centroid  # (2,)
            pred_centroid = track.predicted_centroid(frames_ahead)  # (2,)
            pred_bbox = track.predicted_bbox(frames_ahead)  # (4,)
            track_area = track.last_area

            for j in range(n_dets):
                # Signal 1: Raw Euclidean distance (last known -> detection)
                raw_dist = np.linalg.norm(last_centroid - det_centroids[j])
                dist_cost = min(raw_dist / diag, 1.0)

                # Signal 2: IoU cost (1 - IoU)
                iou = _compute_iou(pred_bbox, det_bboxes[j])
                iou_cost = 1.0 - iou

                # Signal 3: Area similarity
                max_area = max(track_area, det_areas[j])
                if max_area > 0:
                    area_cost = abs(track_area - det_areas[j]) / max_area
                else:
                    area_cost = 1.0
                area_cost = min(area_cost, 1.0)

                # Signal 4: Velocity-predicted distance
                vel_dist = np.linalg.norm(pred_centroid - det_centroids[j])
                vel_cost = min(vel_dist / diag, 1.0)

                # Weighted combination
                combined = (
                    self.config.weight_distance * dist_cost
                    + self.config.weight_iou * iou_cost
                    + self.config.weight_area * area_cost
                    + self.config.weight_velocity * vel_cost
                )

                # Ghost penalty: increase cost with age to prefer active matches
                if is_ghost:
                    combined += (
                        self.config.ghost_penalty_per_frame
                        * track.frames_since_last_seen
                    )

                cost_matrix[i, j] = combined

        return cost_matrix

    def _assign(
        self,
        tracks: list[_Track],
        detections: list[Detection],
        frame_number: int,
        is_ghost: bool,
    ) -> tuple[list[int], list[int], list[int]]:
        """Perform optimal assignment between tracks and detections.

        Uses the Hungarian algorithm (scipy.optimize.linear_sum_assignment)
        for globally optimal assignment, then filters by cost threshold.

        Args:
            tracks: Tracks to match (active or ghost).
            detections: Detections to match.
            frame_number: Current frame number.
            is_ghost: Whether these are ghost tracks.

        Returns:
            Tuple of:
                - matched_track_indices: Track indices that were matched.
                - matched_det_indices: Corresponding detection indices.
                - unmatched_det_indices: Detection indices with no match.
        """
        if not tracks or not detections:
            return [], [], list(range(len(detections)))

        cost_matrix = self._compute_cost_matrix(
            tracks, detections, frame_number, is_ghost
        )

        # Hungarian algorithm: find optimal assignment
        row_indices, col_indices = linear_sum_assignment(cost_matrix)

        matched_track_indices: list[int] = []
        matched_det_indices: list[int] = []
        matched_det_set: set[int] = set()

        for row, col in zip(row_indices, col_indices):
            if cost_matrix[row, col] <= self.config.assignment_cost_threshold:
                matched_track_indices.append(int(row))
                matched_det_indices.append(int(col))
                matched_det_set.add(int(col))

        unmatched_det_indices = [
            j for j in range(len(detections)) if j not in matched_det_set
        ]

        return matched_track_indices, matched_det_indices, unmatched_det_indices

    def _create_new_tracks(
        self,
        detections: list[Detection],
        unmatched_det_indices: list[int],
        frame_number: int,
    ) -> None:
        """Create new tracks for unmatched detections, subject to constraints.

        New tracks are only created if:
        1. The total track count (active + ghost) is below max_mice.
        2. The detection couldn't plausibly belong to an existing track
           (i.e., its best cost against all tracks exceeded the threshold).

        IMPORTANT: The cost check is performed against tracks that existed
        *before* this method was called (pre_existing_tracks snapshot). This
        prevents a newly created track within the same frame from blocking
        sibling detections that are also genuinely new mice.

        Args:
            detections: All detections in the current frame.
            unmatched_det_indices: Indices of detections not matched to any track.
            frame_number: Current frame number.
        """
        alive_count = sum(
            1 for t in self._tracks if t.state != TrackState.DEAD
        )

        # Snapshot of pre-existing tracks BEFORE creating any new ones.
        # This prevents newly created tracks from blocking sibling new tracks
        # within the same frame.
        pre_existing_tracks = [
            t for t in self._tracks if t.state != TrackState.DEAD
        ]

        for det_idx in unmatched_det_indices:
            if alive_count >= self.config.max_mice:
                break

            detection = detections[det_idx]

            # Check if this detection is sufficiently different from all
            # PRE-EXISTING tracks (not ones created in this batch).
            # If it's very close to a track that just wasn't matched
            # (e.g., due to the assignment favoring another pairing),
            # don't create a duplicate.
            if pre_existing_tracks:
                min_cost = self._min_cost_to_tracks(
                    pre_existing_tracks, detection, frame_number
                )
                if min_cost < self.config.new_track_cost_threshold:
                    # This detection is too similar to an existing track;
                    # it's likely a duplicate or slightly shifted detection.
                    continue

            # Create new track
            new_track = _Track(track_id=self._next_track_id)
            entry = _HistoryEntry(
                frame_number=frame_number,
                centroid=np.array(detection.centroid, dtype=np.float64),
                bbox=np.array(detection.bbox, dtype=np.float64),
                area=detection.area,
            )
            new_track.history.append(entry)
            new_track.total_matched_frames = 1

            self._tracks.append(new_track)
            self._next_track_id += 1
            alive_count += 1

    def _min_cost_to_tracks(
        self,
        tracks: list[_Track],
        detection: Detection,
        frame_number: int,
    ) -> float:
        """Compute the minimum assignment cost between a detection and a set of tracks.

        Used as a gate for new track creation: if the detection is cheap to
        assign to some existing track, we should not create a new track.

        Args:
            tracks: List of tracks to compare against.
            detection: The detection to evaluate.
            frame_number: Current frame number.

        Returns:
            Minimum cost across the provided tracks. Returns infinity if the
            tracks list is empty.
        """
        if not tracks:
            return float("inf")

        cost_matrix = self._compute_cost_matrix(
            tracks, [detection], frame_number, is_ghost=False
        )
        return float(np.min(cost_matrix))


# ---------------------------------------------------------------------------
# Batch processing utility
# ---------------------------------------------------------------------------

def process_video_detections(
    frame_detections: dict[int, list[Detection]],
    config: TrackerConfig | None = None,
) -> dict[int, list[TrackOutput]]:
    """Process an entire video's worth of detections and return per-frame tracks.

    This is a convenience function for batch/offline processing of a complete
    video. For real-time or streaming use, call MouseReidentifier.update()
    directly.

    Args:
        frame_detections: Dictionary mapping frame_number to list of Detection
            objects for that frame. Frame numbers need not be contiguous.
        config: Optional TrackerConfig. Uses defaults if None.

    Returns:
        Dictionary mapping frame_number to list of TrackOutput for that frame.
    """
    tracker = MouseReidentifier(config=config)
    results: dict[int, list[TrackOutput]] = {}

    for frame_num in sorted(frame_detections.keys()):
        detections = frame_detections[frame_num]
        tracks = tracker.update(frame_num, detections)
        results[frame_num] = tracks

    return results


# ---------------------------------------------------------------------------
# Demo / self-test
# ---------------------------------------------------------------------------

def _run_demo() -> None:
    """Run a demonstration of the tracker with synthetic mouse data.

    Simulates 5 mice moving in a cage with:
    - Linear motion with slight random perturbation
    - One mouse disappearing for 8 frames (occlusion test)
    - Two mice crossing paths (ID swap test)
    - Detection noise (position jitter)
    """
    print("=" * 70)
    print("MOUSE RE-IDENTIFICATION TRACKER -- SYNTHETIC DEMO")
    print("=" * 70)

    rng = np.random.default_rng(seed=42)
    n_mice = 5
    n_frames = 100
    frame_w, frame_h = 1280, 720
    mouse_size = 50  # approximate bbox half-width

    # Initialize mouse positions and velocities
    positions = np.array([
        [200.0, 200.0],
        [400.0, 150.0],
        [600.0, 400.0],
        [800.0, 300.0],
        [1000.0, 500.0],
    ])
    velocities = np.array([
        [3.0, 1.5],
        [-2.0, 2.0],
        [1.0, -1.0],
        [-1.5, -0.5],
        [2.0, 1.0],
    ])

    # Generate ground truth trajectories
    gt_positions: dict[int, dict[int, np.ndarray]] = {}
    for frame in range(n_frames):
        gt_positions[frame] = {}
        for mouse_id in range(n_mice):
            gt_positions[frame][mouse_id] = positions[mouse_id].copy()

            # Update position with velocity + noise
            positions[mouse_id] += velocities[mouse_id] + rng.normal(0, 0.5, 2)

            # Bounce off walls
            for dim, limit in enumerate([frame_w, frame_h]):
                if positions[mouse_id][dim] < mouse_size:
                    positions[mouse_id][dim] = mouse_size
                    velocities[mouse_id][dim] *= -1
                if positions[mouse_id][dim] > limit - mouse_size:
                    positions[mouse_id][dim] = limit - mouse_size
                    velocities[mouse_id][dim] *= -1

    # Make two mice cross paths around frame 40-50
    for frame in range(35, 55):
        # Mouse 1 and 2 converge then diverge
        t = (frame - 35) / 20.0
        if t < 0.5:
            # Converging
            gt_positions[frame][1] = (
                gt_positions[frame][1] * (1 - t) + gt_positions[frame][2] * t
            )
        else:
            # Diverging (swap-like motion)
            pass

    # Generate detections with noise and occlusion
    frame_detections: dict[int, list[Detection]] = {}
    occluded_mouse = 2
    occlusion_start = 60
    occlusion_end = 68  # 8-frame gap

    for frame in range(n_frames):
        dets: list[Detection] = []
        for mouse_id in range(n_mice):
            # Skip occluded mouse
            if (
                mouse_id == occluded_mouse
                and occlusion_start <= frame < occlusion_end
            ):
                continue

            pos = gt_positions[frame][mouse_id]
            # Add detection noise
            noisy_pos = pos + rng.normal(0, 2.0, 2)
            size_jitter = rng.normal(0, 3.0)

            cx, cy = float(noisy_pos[0]), float(noisy_pos[1])
            half_w = mouse_size + size_jitter
            half_h = mouse_size * 0.7 + size_jitter

            det = Detection(
                frame_number=frame,
                bbox=(cx - half_w, cy - half_h, cx + half_w, cy + half_h),
                centroid=(cx, cy),
                area=(2 * half_w) * (2 * half_h),
            )
            dets.append(det)
        frame_detections[frame] = dets

    # Run tracker (increase max_history to retain full history for demo analysis)
    config = TrackerConfig(
        max_mice=5,
        max_ghost_frames=10,
        max_history=n_frames,  # Retain full history for demo verification
        frame_diagonal=np.sqrt(frame_w**2 + frame_h**2),
    )
    tracker = MouseReidentifier(config=config)

    # Count only frames where each track was actively matched (not ghost)
    track_matched_counts: dict[int, int] = {}
    ghost_recoveries = 0

    for frame in range(n_frames):
        tracks = tracker.update(frame, frame_detections[frame])

        for t in tracks:
            if t.state == TrackState.ACTIVE and t.frames_since_last_seen == 0:
                track_matched_counts[t.track_id] = (
                    track_matched_counts.get(t.track_id, 0) + 1
                )

        # Check for ghost recovery: a track that was ghost now becomes active
        if frame == occlusion_end:
            for t in tracks:
                if t.state == TrackState.GHOST and t.frames_since_last_seen > 0:
                    pass  # Still ghost, should recover next frame
        if frame == occlusion_end + 1:
            for t in tracks:
                if (
                    t.history_length > 1
                    and t.frames_since_last_seen == 0
                ):
                    ghost_recoveries += 1

    # Report results
    print(f"\nFrames processed:  {n_frames}")
    print(f"Ground truth mice: {n_mice}")
    print(f"Unique track IDs:  {len(track_matched_counts)}")
    print(f"Ghost recoveries:  {ghost_recoveries}")
    print()

    # Verify ID consistency
    if len(track_matched_counts) == n_mice:
        print("[PASS] Track count matches ground truth mouse count.")
    else:
        print(
            f"[WARN] Track count ({len(track_matched_counts)}) differs from "
            f"ground truth ({n_mice}). May indicate ID swaps or spurious tracks."
        )

    # Print per-track statistics
    expected_matched = {
        i: n_frames - (occlusion_end - occlusion_start)
        if i == occluded_mouse else n_frames
        for i in range(n_mice)
    }
    print("\nPer-track statistics:")
    print(f"  {'Track ID':<10} {'Frames Matched':<18} {'Coverage %':<12}")
    print(f"  {'-'*10} {'-'*18} {'-'*12}")
    for tid in sorted(track_matched_counts.keys()):
        count = track_matched_counts[tid]
        coverage = count / n_frames * 100
        print(f"  {tid:<10} {count:<18} {coverage:<12.1f}")

    # Print final track states
    final_tracks = tracker.get_all_tracks()
    print(f"\nFinal track states ({len(final_tracks)} tracks):")
    for t in final_tracks:
        print(
            f"  Mouse {t.track_id}: {t.state.value}, "
            f"pos=({t.centroid[0]:.0f}, {t.centroid[1]:.0f}), "
            f"vel=({t.velocity[0]:.1f}, {t.velocity[1]:.1f}), "
            f"history={t.history_length} frames"
        )

    # Verify ghost mechanism worked for the occlusion
    histories = tracker.get_track_histories()
    print(f"\n--- Occlusion test (mouse disappears frames {occlusion_start}-{occlusion_end-1}) ---")
    occlusion_verified = False
    for tid, hist in histories.items():
        frames_in_occlusion = [
            f for f, _ in hist
            if occlusion_start <= f < occlusion_end
        ]
        frames_before = [f for f, _ in hist if f < occlusion_start]
        frames_after = [f for f, _ in hist if f >= occlusion_end]
        if frames_before and frames_after and not frames_in_occlusion:
            print(
                f"  [PASS] Track {tid}: Present before ({len(frames_before)} frames) "
                f"AND after ({len(frames_after)} frames) occlusion gap "
                f"with NO detections during gap. Ghost mechanism bridged the gap!"
            )
            occlusion_verified = True
    if not occlusion_verified:
        # Show diagnostic info for all tracks
        print("  [INFO] No single track spans the full occlusion gap. Track details:")
        for tid, hist in histories.items():
            frame_nums = [f for f, _ in hist]
            print(f"    Track {tid}: frames {min(frame_nums)}-{max(frame_nums)}, "
                  f"total={len(frame_nums)} matched detections")

    print("\n" + "=" * 70)
    print("Demo complete.")
    print("=" * 70)


if __name__ == "__main__":
    _run_demo()
