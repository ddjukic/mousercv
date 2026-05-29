"""Behavior statistics computation for MouserCV analytics.

Computes per-track behavior counts, durations, movement statistics,
heatmap data, and timeline data from detections and behavior segments.
"""

import math

from app.models import BehaviorSegment, Detection

# Behavior color mapping
BEHAVIOR_COLORS = {
    "grooming": "#22c55e",
    "scratching": "#f97316",
    "rearing": "#a855f7",
    "idle": "#6b7280",
}


def compute_behavior_counts(
    segments: list[BehaviorSegment],
) -> dict[str, int]:
    """Count the number of segments per behavior type.

    Args:
        segments: List of behavior segments for a single track.

    Returns:
        Dictionary mapping behavior name to segment count.
    """
    counts: dict[str, int] = {}
    for seg in segments:
        counts[seg.behavior] = counts.get(seg.behavior, 0) + 1
    return counts


def compute_behavior_durations(
    segments: list[BehaviorSegment],
    fps: float,
) -> dict[str, float]:
    """Compute total duration in seconds for each behavior type.

    Args:
        segments: List of behavior segments for a single track.
        fps: Video frames per second.

    Returns:
        Dictionary mapping behavior name to total duration in seconds.
    """
    durations: dict[str, float] = {}
    for seg in segments:
        frame_span = seg.end_frame - seg.start_frame + 1
        duration = frame_span / fps if fps > 0 else 0.0
        durations[seg.behavior] = durations.get(seg.behavior, 0.0) + duration
    return {k: round(v, 2) for k, v in durations.items()}


def compute_movement_stats(
    detections: list[Detection],
    fps: float,
    movement_threshold: float = 2.0,
) -> dict:
    """Compute movement statistics from detection centroids.

    Movement metrics:
    - total_distance: Sum of Euclidean distances between consecutive frames.
    - time_moving_sec: Total time spent moving (above threshold).
    - time_idle_sec: Total time spent idle (below threshold).
    - movement_bouts: Number of contiguous movement periods.
    - mean_bout_duration: Average duration of a movement bout.
    - erratic_index: Ratio of path length to displacement (straighter = 1.0).

    Args:
        detections: Detections sorted by frame_number.
        fps: Video frames per second.
        movement_threshold: Minimum distance per frame to count as moving.

    Returns:
        Dictionary of movement statistics.
    """
    if len(detections) < 2:
        return {
            "total_distance": 0.0,
            "time_moving_sec": 0.0,
            "time_idle_sec": 0.0,
            "movement_bouts": 0,
            "mean_bout_duration": 0.0,
            "erratic_index": 0.0,
        }

    sorted_dets = sorted(detections, key=lambda d: d.frame_number)

    total_distance = 0.0
    moving_frames = 0
    idle_frames = 0
    in_bout = False
    bout_count = 0
    bout_frames_total = 0

    for i in range(1, len(sorted_dets)):
        prev = sorted_dets[i - 1]
        curr = sorted_dets[i]

        dx = curr.centroid_x - prev.centroid_x
        dy = curr.centroid_y - prev.centroid_y
        dist = math.sqrt(dx * dx + dy * dy)
        total_distance += dist

        if dist >= movement_threshold:
            moving_frames += 1
            bout_frames_total += 1
            if not in_bout:
                in_bout = True
                bout_count += 1
        else:
            idle_frames += 1
            in_bout = False

    # Displacement: straight-line distance from start to end
    start = sorted_dets[0]
    end = sorted_dets[-1]
    displacement = math.sqrt(
        (end.centroid_x - start.centroid_x) ** 2
        + (end.centroid_y - start.centroid_y) ** 2
    )

    erratic_index = (
        total_distance / displacement if displacement > 0 else 0.0
    )

    time_moving = moving_frames / fps if fps > 0 else 0.0
    time_idle = idle_frames / fps if fps > 0 else 0.0
    mean_bout_duration = (
        (bout_frames_total / fps) / bout_count
        if bout_count > 0 and fps > 0
        else 0.0
    )

    return {
        "total_distance": round(total_distance, 2),
        "time_moving_sec": round(time_moving, 2),
        "time_idle_sec": round(time_idle, 2),
        "movement_bouts": bout_count,
        "mean_bout_duration": round(mean_bout_duration, 2),
        "erratic_index": round(erratic_index, 2),
    }


def compute_heatmap(
    detections: list[Detection],
    grid_size: int = 20,
    arena_w: int = 640,
    arena_h: int = 480,
) -> list[list[int]]:
    """Compute a 2D position-density heatmap from detections.

    Args:
        detections: List of detections for a single track.
        grid_size: Number of cells in each dimension.
        arena_w: Arena width in pixels.
        arena_h: Arena height in pixels.

    Returns:
        2D list (grid_size x grid_size) of position counts.
    """
    grid = [[0] * grid_size for _ in range(grid_size)]

    cell_w = arena_w / grid_size
    cell_h = arena_h / grid_size

    for det in detections:
        col = int(det.centroid_x / cell_w)
        row = int(det.centroid_y / cell_h)
        col = max(0, min(grid_size - 1, col))
        row = max(0, min(grid_size - 1, row))
        grid[row][col] += 1

    return grid


def compute_timeline_data(
    segments: list[BehaviorSegment],
    fps: float,
) -> list[dict]:
    """Format behavior segments for timeline rendering.

    Args:
        segments: Behavior segments for a single track.
        fps: Frames per second.

    Returns:
        List of dictionaries with start_sec, end_sec, behavior, color.
    """
    timeline = []
    for seg in sorted(segments, key=lambda s: s.start_frame):
        start_sec = seg.start_frame / fps if fps > 0 else 0.0
        end_sec = (seg.end_frame + 1) / fps if fps > 0 else 0.0
        timeline.append(
            {
                "start_sec": round(start_sec, 3),
                "end_sec": round(end_sec, 3),
                "behavior": seg.behavior,
                "color": BEHAVIOR_COLORS.get(seg.behavior, "#6b7280"),
                "start_frame": seg.start_frame,
                "end_frame": seg.end_frame,
            }
        )
    return timeline
