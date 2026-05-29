"""Mock detector that generates realistic mouse tracking data.

Produces smooth random-walk trajectories, bounding boxes, and behavior segments
for testing and demonstration purposes.
"""

import math
import random
from dataclasses import dataclass

from app.models import BehaviorSegment, Detection, Track

# Behavior categories with their relative probabilities
BEHAVIORS = ["grooming", "scratching", "rearing", "idle"]
BEHAVIOR_WEIGHTS = [0.25, 0.15, 0.15, 0.45]  # idle is most common

# Default mouse colors
MOUSE_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6"]

# Arena dimensions
ARENA_WIDTH = 640
ARENA_HEIGHT = 480

# Mouse bounding box approximate size
MOUSE_BOX_W = 60
MOUSE_BOX_H = 40


@dataclass
class TrajectoryState:
    """State for a single mouse trajectory with velocity persistence."""

    x: float
    y: float
    vx: float
    vy: float
    speed: float = 3.0


def _clamp(value: float, low: float, high: float) -> float:
    """Clamp a value to [low, high]."""
    return max(low, min(high, value))


def _generate_trajectory(
    total_frames: int,
    arena_w: int = ARENA_WIDTH,
    arena_h: int = ARENA_HEIGHT,
    seed: int | None = None,
) -> list[tuple[float, float]]:
    """Generate a smooth random-walk trajectory within the arena.

    Uses velocity persistence with small random perturbations to create
    realistic mouse-like movement patterns.

    Args:
        total_frames: Number of frames to generate positions for.
        arena_w: Arena width in pixels.
        arena_h: Arena height in pixels.
        seed: Optional random seed for reproducibility.

    Returns:
        List of (centroid_x, centroid_y) positions, one per frame.
    """
    rng = random.Random(seed)

    margin_x = MOUSE_BOX_W / 2 + 10
    margin_y = MOUSE_BOX_H / 2 + 10

    state = TrajectoryState(
        x=rng.uniform(margin_x, arena_w - margin_x),
        y=rng.uniform(margin_y, arena_h - margin_y),
        vx=rng.gauss(0, 1.5),
        vy=rng.gauss(0, 1.5),
        speed=rng.uniform(1.5, 4.0),
    )

    positions: list[tuple[float, float]] = []

    for _ in range(total_frames):
        # Velocity persistence with random perturbation
        state.vx = 0.85 * state.vx + rng.gauss(0, 0.8)
        state.vy = 0.85 * state.vy + rng.gauss(0, 0.8)

        # Clamp velocity magnitude
        vel_mag = math.sqrt(state.vx**2 + state.vy**2)
        max_speed = state.speed * 2.0
        if vel_mag > max_speed:
            scale = max_speed / vel_mag
            state.vx *= scale
            state.vy *= scale

        # Update position
        state.x += state.vx
        state.y += state.vy

        # Bounce off walls
        if state.x < margin_x:
            state.x = margin_x
            state.vx = abs(state.vx) * 0.8
        elif state.x > arena_w - margin_x:
            state.x = arena_w - margin_x
            state.vx = -abs(state.vx) * 0.8

        if state.y < margin_y:
            state.y = margin_y
            state.vy = abs(state.vy) * 0.8
        elif state.y > arena_h - margin_y:
            state.y = arena_h - margin_y
            state.vy = -abs(state.vy) * 0.8

        positions.append((state.x, state.y))

    return positions


def _generate_behavior_segments(
    total_frames: int,
    seed: int | None = None,
) -> list[tuple[int, int, str]]:
    """Generate behavior segments covering all frames.

    Creates blocks of 30-120 frames each, cycling through behaviors
    with realistic distributions.

    Args:
        total_frames: Total number of frames to cover.
        seed: Optional random seed.

    Returns:
        List of (start_frame, end_frame, behavior) tuples.
    """
    rng = random.Random(seed)
    segments: list[tuple[int, int, str]] = []
    current_frame = 0

    while current_frame < total_frames:
        # Random segment length between 30 and 120 frames
        segment_length = rng.randint(30, 120)
        end_frame = min(current_frame + segment_length - 1, total_frames - 1)

        # Pick behavior using weighted random choice
        behavior = rng.choices(BEHAVIORS, weights=BEHAVIOR_WEIGHTS, k=1)[0]

        segments.append((current_frame, end_frame, behavior))
        current_frame = end_frame + 1

    return segments


def generate_mock_data(
    video_id: int,
    total_frames: int,
    num_mice: int = 2,
    arena_w: int = ARENA_WIDTH,
    arena_h: int = ARENA_HEIGHT,
) -> tuple[list[Track], list[Detection], list[BehaviorSegment]]:
    """Generate complete mock tracking data for a video.

    Creates tracks, detections (one per frame per mouse), and behavior
    segments for the specified number of mice.

    Args:
        video_id: ID of the video these tracks belong to.
        total_frames: Total number of frames in the video.
        num_mice: Number of mice to simulate (max 5).
        arena_w: Arena width in pixels.
        arena_h: Arena height in pixels.

    Returns:
        Tuple of (tracks, detections, behavior_segments).
        Note: Track objects do not have IDs set -- they must be committed
        to the database first to receive auto-incremented IDs.
    """
    num_mice = min(num_mice, 5)

    tracks: list[Track] = []
    all_detections: list[Detection] = []
    all_behaviors: list[BehaviorSegment] = []

    for mouse_idx in range(num_mice):
        # Create track (ID will be assigned by DB)
        track = Track(
            video_id=video_id,
            label=f"Mouse {mouse_idx + 1}",
            color=MOUSE_COLORS[mouse_idx],
            is_active=True,
        )
        tracks.append(track)

        # Generate trajectory
        positions = _generate_trajectory(
            total_frames=total_frames,
            arena_w=arena_w,
            arena_h=arena_h,
            seed=video_id * 100 + mouse_idx,
        )

        # Generate behavior segments
        behavior_segments = _generate_behavior_segments(
            total_frames=total_frames,
            seed=video_id * 100 + mouse_idx + 50,
        )

        # Store positions and behaviors for later (track_id placeholder = -1)
        track._positions = positions  # type: ignore[attr-defined]
        track._behavior_segments = behavior_segments  # type: ignore[attr-defined]

    return tracks, all_detections, all_behaviors


def create_detections_for_track(
    track_id: int,
    positions: list[tuple[float, float]],
) -> list[Detection]:
    """Create Detection objects for a track given its trajectory positions.

    Args:
        track_id: Database ID of the track.
        positions: List of (centroid_x, centroid_y) per frame.

    Returns:
        List of Detection objects (without IDs).
    """
    detections: list[Detection] = []
    rng = random.Random(track_id)

    for frame_num, (cx, cy) in enumerate(positions):
        # Add slight jitter to box size for realism
        half_w = MOUSE_BOX_W / 2 + rng.gauss(0, 2)
        half_h = MOUSE_BOX_H / 2 + rng.gauss(0, 1.5)

        detection = Detection(
            track_id=track_id,
            frame_number=frame_num,
            x1=cx - half_w,
            y1=cy - half_h,
            x2=cx + half_w,
            y2=cy + half_h,
            confidence=_clamp(0.85 + rng.gauss(0, 0.05), 0.5, 1.0),
            centroid_x=cx,
            centroid_y=cy,
        )
        detections.append(detection)

    return detections


def create_behavior_segments_for_track(
    track_id: int,
    segments: list[tuple[int, int, str]],
) -> list[BehaviorSegment]:
    """Create BehaviorSegment objects for a track.

    Args:
        track_id: Database ID of the track.
        segments: List of (start_frame, end_frame, behavior) tuples.

    Returns:
        List of BehaviorSegment objects (without IDs).
    """
    return [
        BehaviorSegment(
            track_id=track_id,
            start_frame=start,
            end_frame=end,
            behavior=behavior,
        )
        for start, end, behavior in segments
    ]
