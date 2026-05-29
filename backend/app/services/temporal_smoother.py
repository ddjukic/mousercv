"""Temporal smoothing and segment merging for behavior classification output.

Applies post-processing to raw per-frame state machine output to produce
clean, exportable behavior segments. Processing steps:
    1. Temporal median filter to remove single-frame noise
    2. Minimum bout duration enforcement
    3. Gap bridging for same-behavior segments separated by brief interruptions
    4. Merge adjacent same-label frames into contiguous segments

All internal steps are separate functions for testability.
"""

from collections import Counter


# Default minimum bout durations in frames (at 30 fps)
DEFAULT_MIN_BOUT_FRAMES: dict[str, int] = {
    "grooming": 60,    # 2.0s
    "scratching": 15,  # 0.5s
    "rearing": 30,     # 1.0s
    "idle": 15,        # 0.5s
    "uncertain": 1,    # no minimum
    "locomotion": 15,  # 0.5s
}

# Default gap bridge thresholds in frames
DEFAULT_BRIDGE_FRAMES: dict[str, int] = {
    "grooming": 60,
    "scratching": 15,
    "rearing": 30,
}


def smooth_behaviors(
    raw_sequence: list[tuple[int, str, float]],
    fps: float = 30.0,
    min_bout_frames: dict[str, int] | None = None,
    bridge_frames: dict[str, int] | None = None,
    median_window: int = 7,
) -> list[dict]:
    """Apply temporal smoothing and merge raw frame labels into behavior segments.

    Processes the raw per-frame output from BehaviorStateMachine through
    four sequential smoothing stages, then merges into exportable segments.

    Args:
        raw_sequence: List of (frame_number, behavior_label, confidence) tuples,
            sorted by frame_number.
        fps: Video frames per second for time conversion.
        min_bout_frames: Minimum segment duration per behavior in frames.
            Defaults to DEFAULT_MIN_BOUT_FRAMES.
        bridge_frames: Maximum gap to bridge between same-behavior segments,
            per behavior in frames. Defaults to DEFAULT_BRIDGE_FRAMES.
        median_window: Window size for temporal median filter (must be odd).

    Returns:
        List of segment dicts matching the BehaviorExport schema:
            {start_frame, end_frame, start_sec, end_sec, behavior,
             source, confidence}
    """
    if not raw_sequence:
        return []

    # Ensure sorted by frame number
    sorted_seq = sorted(raw_sequence, key=lambda x: x[0])

    # Extract parallel arrays for processing
    frames = [s[0] for s in sorted_seq]
    labels = [s[1] for s in sorted_seq]
    confidences = [s[2] for s in sorted_seq]

    # Ensure median window is odd
    if median_window % 2 == 0:
        median_window += 1

    # Step 1: Temporal median filter
    labels = _apply_median_filter(labels, median_window)

    # Step 2: Minimum bout duration enforcement
    effective_min_bout = {**DEFAULT_MIN_BOUT_FRAMES}
    if min_bout_frames:
        effective_min_bout.update(min_bout_frames)
    labels = _enforce_min_bout_duration(labels, effective_min_bout)

    # Step 3: Gap bridging
    effective_bridge = {**DEFAULT_BRIDGE_FRAMES}
    if bridge_frames:
        effective_bridge.update(bridge_frames)
    labels = _bridge_gaps(labels, effective_bridge)

    # Step 4: Merge into contiguous segments
    segments = _merge_segments(frames, labels, confidences, fps)

    return segments


def _apply_median_filter(labels: list[str], window: int) -> list[str]:
    """Apply a temporal median (mode) filter to the label sequence.

    For each frame, takes the most common label within a centered window.
    This removes isolated single-frame noise.

    Args:
        labels: Per-frame behavior labels.
        window: Window size (must be odd).

    Returns:
        Filtered label sequence of the same length.
    """
    if len(labels) <= 1:
        return labels[:]

    half = window // 2
    result: list[str] = []

    for i in range(len(labels)):
        start = max(0, i - half)
        end = min(len(labels), i + half + 1)
        window_labels = labels[start:end]

        # Mode: most common label in the window
        counter = Counter(window_labels)
        most_common = counter.most_common(1)[0][0]
        result.append(most_common)

    return result


def _enforce_min_bout_duration(
    labels: list[str],
    min_bout_frames: dict[str, int],
) -> list[str]:
    """Remove behavior bouts shorter than minimum duration.

    Short bouts are replaced with the label of the surrounding context
    (the label of the preceding segment, or the following if at the start).

    Args:
        labels: Per-frame behavior labels.
        min_bout_frames: Minimum duration per behavior in frames.

    Returns:
        Label sequence with short bouts eliminated.
    """
    if len(labels) <= 1:
        return labels[:]

    result = labels[:]

    # Identify contiguous runs
    runs = _find_runs(result)

    # Process runs that are too short
    changed = True
    max_iterations = 10  # prevent infinite loops
    iteration = 0

    while changed and iteration < max_iterations:
        changed = False
        iteration += 1
        runs = _find_runs(result)

        for start_idx, end_idx, label in runs:
            bout_length = end_idx - start_idx
            min_frames = min_bout_frames.get(label, 1)

            if bout_length < min_frames:
                # Replace with surrounding context
                replacement = _get_surrounding_label(
                    result, start_idx, end_idx, label
                )
                for j in range(start_idx, end_idx):
                    result[j] = replacement
                changed = True
                break  # Re-scan after modification

    return result


def _bridge_gaps(
    labels: list[str],
    bridge_frames: dict[str, int],
) -> list[str]:
    """Bridge gaps between segments of the same behavior.

    If two segments of behavior X are separated by a gap shorter than
    bridge_frames[X], fill the gap with X.

    Args:
        labels: Per-frame behavior labels.
        bridge_frames: Maximum gap to bridge per behavior in frames.

    Returns:
        Label sequence with bridged gaps.
    """
    if len(labels) <= 1:
        return labels[:]

    result = labels[:]
    runs = _find_runs(result)

    if len(runs) < 3:
        return result

    # Check triplets: run_before, gap, run_after
    i = 0
    while i < len(runs) - 2:
        before_start, before_end, before_label = runs[i]
        gap_start, gap_end, gap_label = runs[i + 1]
        after_start, after_end, after_label = runs[i + 2]

        gap_length = gap_end - gap_start

        if before_label == after_label and before_label in bridge_frames:
            max_gap = bridge_frames[before_label]
            if gap_length <= max_gap:
                # Bridge the gap
                for j in range(gap_start, gap_end):
                    result[j] = before_label
                # Re-compute runs and restart scanning
                runs = _find_runs(result)
                i = 0
                continue

        i += 1

    return result


def _merge_segments(
    frames: list[int],
    labels: list[str],
    confidences: list[float],
    fps: float,
) -> list[dict]:
    """Merge adjacent same-label frames into contiguous segments.

    Args:
        frames: Frame numbers for each entry.
        labels: Smoothed behavior labels.
        confidences: Per-frame confidence scores.
        fps: Frames per second for time conversion.

    Returns:
        List of segment dicts with keys: start_frame, end_frame,
        start_sec, end_sec, behavior, source, confidence.
    """
    if not frames:
        return []

    segments: list[dict] = []
    seg_start_idx = 0

    for i in range(1, len(labels)):
        if labels[i] != labels[seg_start_idx]:
            # Close current segment
            segments.append(
                _build_segment(
                    frames, labels, confidences, seg_start_idx, i, fps
                )
            )
            seg_start_idx = i

    # Close final segment
    segments.append(
        _build_segment(
            frames, labels, confidences, seg_start_idx, len(labels), fps
        )
    )

    return segments


def _build_segment(
    frames: list[int],
    labels: list[str],
    confidences: list[float],
    start_idx: int,
    end_idx: int,
    fps: float,
) -> dict:
    """Build a single segment dict from index range.

    Args:
        frames: Frame numbers.
        labels: Behavior labels.
        confidences: Confidence scores.
        start_idx: Start index (inclusive).
        end_idx: End index (exclusive).
        fps: Frames per second.

    Returns:
        Segment dictionary matching BehaviorExport schema.
    """
    start_frame = frames[start_idx]
    end_frame = frames[end_idx - 1]

    # Average confidence across the segment
    seg_confidences = confidences[start_idx:end_idx]
    avg_confidence = (
        sum(seg_confidences) / len(seg_confidences) if seg_confidences else 0.0
    )

    start_sec = start_frame / fps if fps > 0 else 0.0
    end_sec = (end_frame + 1) / fps if fps > 0 else 0.0

    return {
        "start_frame": start_frame,
        "end_frame": end_frame,
        "start_sec": round(start_sec, 3),
        "end_sec": round(end_sec, 3),
        "behavior": labels[start_idx],
        "source": "state_machine",
        "confidence": round(avg_confidence, 3),
    }


def _find_runs(labels: list[str]) -> list[tuple[int, int, str]]:
    """Identify contiguous runs of the same label.

    Args:
        labels: Sequence of behavior labels.

    Returns:
        List of (start_index, end_index_exclusive, label) tuples.
    """
    if not labels:
        return []

    runs: list[tuple[int, int, str]] = []
    run_start = 0

    for i in range(1, len(labels)):
        if labels[i] != labels[run_start]:
            runs.append((run_start, i, labels[run_start]))
            run_start = i

    runs.append((run_start, len(labels), labels[run_start]))
    return runs


def _get_surrounding_label(
    labels: list[str],
    start_idx: int,
    end_idx: int,
    current_label: str,
) -> str:
    """Determine replacement label from surrounding context.

    Looks at the labels immediately before and after the given range.
    Prefers the preceding label. Falls back to the following label,
    then to "idle" if no valid context exists.

    Args:
        labels: Full label sequence.
        start_idx: Start of the bout to replace (inclusive).
        end_idx: End of the bout to replace (exclusive).
        current_label: The label being replaced (to avoid self-reference).

    Returns:
        Replacement label string.
    """
    # Check preceding label
    if start_idx > 0:
        prev_label = labels[start_idx - 1]
        if prev_label != current_label:
            return prev_label

    # Check following label
    if end_idx < len(labels):
        next_label = labels[end_idx]
        if next_label != current_label:
            return next_label

    # Fallback
    return "idle"
