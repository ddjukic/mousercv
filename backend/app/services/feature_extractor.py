"""Mask geometry and temporal feature extraction for behavior classification.

Extracts shape descriptors from binary segmentation masks and computes
temporal dynamics over sliding windows. Pure computation with no DB dependency.
"""

import math

import cv2
import numpy as np


def extract_mask_features(mask: np.ndarray) -> dict[str, float]:
    """Extract geometric features from a binary segmentation mask.

    Computes shape descriptors including area, centroid, aspect ratio,
    orientation, convexity, and circularity from the largest contour
    found in the mask.

    Args:
        mask: Binary mask (H x W), dtype uint8 or bool.
              Non-zero pixels are foreground.

    Returns:
        Dictionary with keys:
            area: Foreground pixel count.
            centroid_x: Center of mass X coordinate.
            centroid_y: Center of mass Y coordinate.
            aspect_ratio: Bounding box height / width (>1 means tall).
            ellipse_angle: Orientation angle from fitted ellipse (degrees).
            convexity: area / convex_hull_area (0-1, 1 = perfectly convex).
            circularity: 4 * pi * area / perimeter^2 (1 = perfect circle).
            perimeter: Arc length of the largest contour.
    """
    # Ensure uint8 binary mask
    if mask.dtype == bool:
        mask = mask.astype(np.uint8) * 255
    elif mask.max() == 1:
        mask = (mask * 255).astype(np.uint8)
    else:
        mask = mask.astype(np.uint8)

    # Default result for empty or degenerate masks
    defaults: dict[str, float] = {
        "area": 0.0,
        "centroid_x": 0.0,
        "centroid_y": 0.0,
        "aspect_ratio": 1.0,
        "ellipse_angle": 0.0,
        "convexity": 0.0,
        "circularity": 0.0,
        "perimeter": 0.0,
    }

    area = float(cv2.countNonZero(mask))
    if area == 0.0:
        return defaults

    # Compute moments for centroid
    moments = cv2.moments(mask)
    m00 = moments["m00"]
    if m00 == 0.0:
        return defaults

    centroid_x = moments["m10"] / m00
    centroid_y = moments["m01"] / m00

    # Find contours and select the largest
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {**defaults, "area": area, "centroid_x": centroid_x, "centroid_y": centroid_y}

    largest_contour = max(contours, key=cv2.contourArea)
    contour_area = cv2.contourArea(largest_contour)

    # Perimeter
    perimeter = cv2.arcLength(largest_contour, closed=True)

    # Bounding rectangle for aspect ratio
    _, _, rect_w, rect_h = cv2.boundingRect(largest_contour)
    aspect_ratio = float(rect_h) / float(rect_w) if rect_w > 0 else 1.0

    # Ellipse fitting (requires at least 5 contour points)
    ellipse_angle = 0.0
    if len(largest_contour) >= 5:
        try:
            _, _, angle = cv2.fitEllipse(largest_contour)
            ellipse_angle = float(angle)
        except cv2.error:
            ellipse_angle = 0.0

    # Convexity: contour area / convex hull area
    convexity = 0.0
    hull = cv2.convexHull(largest_contour)
    hull_area = cv2.contourArea(hull)
    if hull_area > 0:
        convexity = contour_area / hull_area

    # Circularity: 4 * pi * area / perimeter^2
    circularity = 0.0
    if perimeter > 0:
        circularity = (4.0 * math.pi * contour_area) / (perimeter * perimeter)

    return {
        "area": area,
        "centroid_x": centroid_x,
        "centroid_y": centroid_y,
        "aspect_ratio": aspect_ratio,
        "ellipse_angle": ellipse_angle,
        "convexity": convexity,
        "circularity": circularity,
        "perimeter": perimeter,
    }


def extract_temporal_features(
    feature_history: list[dict[str, float]],
    window_size: int = 15,
) -> dict[str, float]:
    """Compute temporal dynamics from a sliding window of per-frame features.

    Analyzes how geometric features change over time, producing velocity
    and oscillation metrics used by the behavior state machine.

    Args:
        feature_history: List of feature dicts (most recent last), each
            produced by extract_mask_features(). Must contain at least
            2 entries for velocity computation.
        window_size: Number of recent frames to consider for oscillation
            statistics. The history is truncated to this window.

    Returns:
        Dictionary with keys:
            centroid_velocity: Euclidean distance between the two most
                recent centroids (px/frame).
            area_change_rate: Fractional area change between the two
                most recent frames: (area[t] - area[t-1]) / area[t-1].
            contour_oscillation_index: Standard deviation of convexity
                within the window.
            aspect_ratio_oscillation: Standard deviation of aspect_ratio
                within the window.
            angle_oscillation: Standard deviation of ellipse_angle
                within the window.
    """
    defaults: dict[str, float] = {
        "centroid_velocity": 0.0,
        "area_change_rate": 0.0,
        "contour_oscillation_index": 0.0,
        "aspect_ratio_oscillation": 0.0,
        "angle_oscillation": 0.0,
    }

    if len(feature_history) < 2:
        return defaults

    # Truncate to the window
    window = feature_history[-window_size:]

    # Velocity: distance between last two centroids
    prev = window[-2]
    curr = window[-1]
    dx = curr.get("centroid_x", 0.0) - prev.get("centroid_x", 0.0)
    dy = curr.get("centroid_y", 0.0) - prev.get("centroid_y", 0.0)
    centroid_velocity = math.sqrt(dx * dx + dy * dy)

    # Area change rate
    prev_area = prev.get("area", 0.0)
    curr_area = curr.get("area", 0.0)
    if prev_area > 0:
        area_change_rate = (curr_area - prev_area) / prev_area
    else:
        area_change_rate = 0.0

    # Oscillation metrics: std dev over the window
    convexities = [f.get("convexity", 0.0) for f in window]
    aspect_ratios = [f.get("aspect_ratio", 1.0) for f in window]
    angles = [f.get("ellipse_angle", 0.0) for f in window]

    contour_oscillation_index = _std_dev(convexities)
    aspect_ratio_oscillation = _std_dev(aspect_ratios)
    angle_oscillation = _std_dev(angles)

    return {
        "centroid_velocity": centroid_velocity,
        "area_change_rate": area_change_rate,
        "contour_oscillation_index": contour_oscillation_index,
        "aspect_ratio_oscillation": aspect_ratio_oscillation,
        "angle_oscillation": angle_oscillation,
    }


def _std_dev(values: list[float]) -> float:
    """Compute population standard deviation for a list of floats.

    Args:
        values: Non-empty list of numeric values.

    Returns:
        Population standard deviation (0.0 if fewer than 2 values).
    """
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    return math.sqrt(variance)
