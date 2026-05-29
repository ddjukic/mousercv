"""Hierarchical behavior state machine for mouse behavior classification.

Implements a 3-level decision hierarchy:
    Level 1: MOVING vs STATIONARY (velocity threshold with hysteresis)
    Level 2: When STATIONARY -> IDLE, GROOMING, SCRATCHING, REARING
    Level 3: UNCERTAIN when confidence below threshold

The state machine processes per-frame geometric and temporal features,
maintaining internal counters for activation delays and hysteresis
to produce stable, noise-resistant behavior labels.
"""

import math
from typing import Any


# Default configuration for all thresholds
DEFAULT_CONFIG: dict[str, Any] = {
    # Level 1: Movement detection with hysteresis
    "velocity_stationary_threshold": 2.0,  # px/frame: below this -> stationary candidate
    "velocity_moving_threshold": 4.0,  # px/frame: above this -> moving candidate
    "stationary_confirm_frames": 5,  # consecutive frames to confirm stationary
    "moving_confirm_frames": 3,  # consecutive frames to confirm moving

    # Level 2: Behavior predicates
    "rearing_aspect_ratio": 1.3,  # min aspect ratio (tall posture)
    "rearing_area_change_rate": -0.05,  # max area change rate (area decreases when rearing)
    "rearing_activation_frames": 4,  # consecutive frames to confirm rearing

    "scratching_oscillation_high": 0.03,  # min contour_oscillation_index
    "scratching_convexity_max": 0.82,  # max convexity (jagged contour)
    "scratching_activation_frames": 3,  # consecutive frames to confirm scratching

    "grooming_oscillation_low": 0.01,  # min contour_oscillation_index
    "grooming_oscillation_high": 0.03,  # max contour_oscillation_index
    "grooming_convexity_min": 0.83,  # min convexity (smooth contour)
    "grooming_activation_frames": 15,  # consecutive frames to confirm grooming

    # Level 3: Confidence
    "uncertain_confidence_threshold": 0.6,

    # Auto-calibration
    "calibration_frames": 300,
}


class BehaviorStateMachine:
    """Hierarchical state machine for mouse behavior classification.

    Level 1: MOVING vs STATIONARY (velocity threshold with hysteresis)
    Level 2: When STATIONARY -> IDLE, GROOMING, SCRATCHING, REARING
    Level 3: UNCERTAIN when confidence below threshold

    Usage:
        sm = BehaviorStateMachine()
        for features, temporal in frame_data:
            behavior, confidence = sm.update(features, temporal)
    """

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        """Initialize with optional config overrides for thresholds.

        Args:
            config: Dictionary of threshold overrides. Keys not provided
                will use DEFAULT_CONFIG values. See module-level
                DEFAULT_CONFIG for all available keys.
        """
        self.config: dict[str, Any] = {**DEFAULT_CONFIG}
        if config:
            self.config.update(config)

        self.reset()

    def reset(self) -> None:
        """Reset all internal state to initial conditions."""
        # Level 1: movement detection
        self.movement_state: str = "unknown"  # "moving", "stationary", "unknown"
        self.consecutive_stationary: int = 0
        self.consecutive_moving: int = 0

        # Level 2: behavior activation counters
        self.behavior_state: str = "idle"
        self.activation_counters: dict[str, int] = {
            "rearing": 0,
            "scratching": 0,
            "grooming": 0,
        }

        # Auto-calibration
        self.calibrated: bool = False
        self.baseline_stats: dict[str, float] = {}
        self.calibration_buffer: list[dict[str, float]] = []
        self.frames_processed: int = 0

    def auto_calibrate(self, features: list[dict[str, float]]) -> None:
        """Auto-calibrate thresholds from a collection of baseline frames.

        Computes mean and standard deviation for key features, then adjusts
        detection thresholds relative to the observed baseline distribution.

        Args:
            features: List of per-frame feature dicts (from extract_mask_features).
                Should represent typical resting/baseline behavior for accurate
                calibration.
        """
        if not features:
            return

        # Compute statistics for key features
        keys = ["area", "convexity", "aspect_ratio", "ellipse_angle"]
        stats: dict[str, float] = {}

        for key in keys:
            values = [f.get(key, 0.0) for f in features]
            n = len(values)
            if n == 0:
                continue
            mean = sum(values) / n
            variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0.0
            std = math.sqrt(variance)
            stats[f"{key}_mean"] = mean
            stats[f"{key}_std"] = std

        self.baseline_stats = stats
        self.calibrated = True

        # Adjust thresholds relative to baseline
        if "aspect_ratio_mean" in stats and "aspect_ratio_std" in stats:
            baseline_ar = stats["aspect_ratio_mean"]
            baseline_ar_std = stats["aspect_ratio_std"]
            # Rearing requires aspect ratio significantly above baseline
            self.config["rearing_aspect_ratio"] = baseline_ar + max(
                2.0 * baseline_ar_std, 0.2
            )

        if "convexity_mean" in stats and "convexity_std" in stats:
            baseline_conv = stats["convexity_mean"]
            baseline_conv_std = stats["convexity_std"]
            # Scratching: convexity drops below baseline
            self.config["scratching_convexity_max"] = baseline_conv - max(
                1.5 * baseline_conv_std, 0.05
            )
            # Grooming: convexity stays near or above baseline
            self.config["grooming_convexity_min"] = baseline_conv - max(
                0.5 * baseline_conv_std, 0.02
            )

    def update(
        self,
        features: dict[str, float],
        temporal_features: dict[str, float],
    ) -> tuple[str, float]:
        """Process one frame of features through the state machine.

        Applies the 3-level hierarchy: movement detection, behavior
        classification (when stationary), and uncertainty filtering.

        Args:
            features: Per-frame geometric features from extract_mask_features().
            temporal_features: Temporal dynamics from extract_temporal_features().

        Returns:
            Tuple of (behavior_label, confidence) where behavior_label is one of:
                "locomotion", "idle", "grooming", "scratching", "rearing", "uncertain".
            Confidence is a float in [0.0, 1.0].
        """
        self.frames_processed += 1

        # Accumulate calibration buffer during warmup
        if not self.calibrated:
            self.calibration_buffer.append(features)
            if len(self.calibration_buffer) >= self.config["calibration_frames"]:
                self.auto_calibrate(self.calibration_buffer)
                self.calibration_buffer = []

        # Level 1: Movement state with hysteresis
        velocity = temporal_features.get("centroid_velocity", 0.0)
        self._update_movement_state(velocity)

        if self.movement_state == "moving":
            return ("locomotion", 0.9)

        # Level 2: Behavior classification (only when stationary)
        behavior, confidence = self._classify_behavior(features, temporal_features)

        # Level 3: Uncertainty check
        if confidence < self.config["uncertain_confidence_threshold"]:
            return ("uncertain", confidence)

        return (behavior, confidence)

    def _update_movement_state(self, velocity: float) -> None:
        """Update the Level 1 movement state using hysteresis.

        Uses two thresholds to avoid flickering between states:
        - velocity_stationary_threshold: transition to stationary candidate
        - velocity_moving_threshold: transition to moving candidate

        State transitions require consecutive frames above the confirmation
        threshold to commit.

        Args:
            velocity: Current centroid velocity in px/frame.
        """
        stationary_thresh = self.config["velocity_stationary_threshold"]
        moving_thresh = self.config["velocity_moving_threshold"]
        stationary_confirm = self.config["stationary_confirm_frames"]
        moving_confirm = self.config["moving_confirm_frames"]

        if velocity <= stationary_thresh:
            self.consecutive_stationary += 1
            self.consecutive_moving = 0
        elif velocity >= moving_thresh:
            self.consecutive_moving += 1
            self.consecutive_stationary = 0
        else:
            # In hysteresis band: maintain current state, decay counters slowly
            self.consecutive_stationary = max(0, self.consecutive_stationary - 1)
            self.consecutive_moving = max(0, self.consecutive_moving - 1)

        # Commit state transitions only after sufficient consecutive frames
        if self.consecutive_stationary >= stationary_confirm:
            self.movement_state = "stationary"
        elif self.consecutive_moving >= moving_confirm:
            self.movement_state = "moving"
            # Reset behavior activation counters when starting to move
            for key in self.activation_counters:
                self.activation_counters[key] = 0
            self.behavior_state = "idle"
        # If neither threshold met, keep current state (hysteresis hold)

    def _classify_behavior(
        self,
        features: dict[str, float],
        temporal_features: dict[str, float],
    ) -> tuple[str, float]:
        """Classify stationary behavior using feature predicates.

        Checks predicates in priority order: rearing > scratching > grooming > idle.
        Each predicate uses activation counters requiring consecutive frames
        to confirm the behavior, reducing transient false positives.

        Args:
            features: Per-frame geometric features.
            temporal_features: Temporal dynamics features.

        Returns:
            Tuple of (behavior_label, confidence).
        """
        # Check each behavior predicate in priority order
        rearing_match, rearing_conf = self._check_rearing(features, temporal_features)
        scratching_match, scratching_conf = self._check_scratching(
            features, temporal_features
        )
        grooming_match, grooming_conf = self._check_grooming(
            features, temporal_features
        )

        # Update activation counters
        self.activation_counters["rearing"] = (
            self.activation_counters["rearing"] + 1 if rearing_match else 0
        )
        self.activation_counters["scratching"] = (
            self.activation_counters["scratching"] + 1 if scratching_match else 0
        )
        self.activation_counters["grooming"] = (
            self.activation_counters["grooming"] + 1 if grooming_match else 0
        )

        # Priority-ordered activation check
        if (
            self.activation_counters["rearing"]
            >= self.config["rearing_activation_frames"]
        ):
            self.behavior_state = "rearing"
            return ("rearing", rearing_conf)

        if (
            self.activation_counters["scratching"]
            >= self.config["scratching_activation_frames"]
        ):
            self.behavior_state = "scratching"
            return ("scratching", scratching_conf)

        if (
            self.activation_counters["grooming"]
            >= self.config["grooming_activation_frames"]
        ):
            self.behavior_state = "grooming"
            return ("grooming", grooming_conf)

        # No behavior activated: idle
        self.behavior_state = "idle"
        return ("idle", 0.7)

    def _check_rearing(
        self,
        features: dict[str, float],
        temporal_features: dict[str, float],
    ) -> tuple[bool, float]:
        """Check if the current frame matches the rearing predicate.

        Rearing is characterized by:
        - High aspect ratio (mouse stands upright, tall posture)
        - Negative area change rate (projected area decreases when vertical)

        Args:
            features: Per-frame geometric features.
            temporal_features: Temporal dynamics features.

        Returns:
            Tuple of (predicate_match, confidence).
        """
        aspect_ratio = features.get("aspect_ratio", 1.0)
        area_change_rate = temporal_features.get("area_change_rate", 0.0)

        ar_threshold = self.config["rearing_aspect_ratio"]
        acr_threshold = self.config["rearing_area_change_rate"]

        ar_match = aspect_ratio >= ar_threshold
        acr_match = area_change_rate <= acr_threshold

        if ar_match:
            # Confidence proportional to how far above threshold
            ar_confidence = _proportional_confidence(
                value=aspect_ratio,
                threshold=ar_threshold,
                baseline=1.0,
            )
            # Boost confidence if area also decreasing
            acr_bonus = 0.1 if acr_match else 0.0
            confidence = min(1.0, ar_confidence + acr_bonus)
            return (True, confidence)

        return (False, 0.0)

    def _check_scratching(
        self,
        features: dict[str, float],
        temporal_features: dict[str, float],
    ) -> tuple[bool, float]:
        """Check if the current frame matches the scratching predicate.

        Scratching is characterized by:
        - High contour oscillation (rapid shape changes from limb movement)
        - Low convexity (jagged contour from extended limbs)

        Args:
            features: Per-frame geometric features.
            temporal_features: Temporal dynamics features.

        Returns:
            Tuple of (predicate_match, confidence).
        """
        oscillation = temporal_features.get("contour_oscillation_index", 0.0)
        convexity = features.get("convexity", 1.0)

        osc_threshold = self.config["scratching_oscillation_high"]
        conv_threshold = self.config["scratching_convexity_max"]

        osc_match = oscillation >= osc_threshold
        conv_match = convexity <= conv_threshold

        if osc_match and conv_match:
            osc_confidence = _proportional_confidence(
                value=oscillation,
                threshold=osc_threshold,
                baseline=0.0,
            )
            conv_confidence = _proportional_confidence(
                value=conv_threshold - convexity + conv_threshold,
                threshold=conv_threshold,
                baseline=0.0,
            )
            confidence = min(1.0, (osc_confidence + conv_confidence) / 2.0)
            return (True, confidence)

        return (False, 0.0)

    def _check_grooming(
        self,
        features: dict[str, float],
        temporal_features: dict[str, float],
    ) -> tuple[bool, float]:
        """Check if the current frame matches the grooming predicate.

        Grooming is characterized by:
        - Moderate contour oscillation (between low and high thresholds)
        - High convexity (compact, rounded posture)

        Args:
            features: Per-frame geometric features.
            temporal_features: Temporal dynamics features.

        Returns:
            Tuple of (predicate_match, confidence).
        """
        oscillation = temporal_features.get("contour_oscillation_index", 0.0)
        convexity = features.get("convexity", 0.0)

        osc_low = self.config["grooming_oscillation_low"]
        osc_high = self.config["grooming_oscillation_high"]
        conv_min = self.config["grooming_convexity_min"]

        osc_match = osc_low <= oscillation <= osc_high
        conv_match = convexity >= conv_min

        if osc_match and conv_match:
            # Confidence: how centered the oscillation is in the band
            osc_center = (osc_low + osc_high) / 2.0
            osc_range = (osc_high - osc_low) / 2.0
            osc_deviation = abs(oscillation - osc_center)
            osc_confidence = max(0.0, 1.0 - osc_deviation / osc_range) if osc_range > 0 else 0.5

            conv_confidence = _proportional_confidence(
                value=convexity,
                threshold=conv_min,
                baseline=0.5,
            )
            confidence = min(1.0, (osc_confidence + conv_confidence) / 2.0)
            return (True, confidence)

        return (False, 0.0)


def _proportional_confidence(
    value: float,
    threshold: float,
    baseline: float,
) -> float:
    """Compute confidence proportional to how far a value exceeds a threshold.

    Maps value into [0.0, 1.0] based on its position between baseline and
    threshold (then beyond).

    Args:
        value: The observed feature value.
        threshold: The activation threshold.
        baseline: The neutral/expected baseline value.

    Returns:
        Confidence score in [0.0, 1.0].
    """
    range_val = abs(threshold - baseline)
    if range_val == 0:
        return 0.5 if value >= threshold else 0.0

    # How far past baseline toward and beyond the threshold
    progress = abs(value - baseline) / range_val
    return min(1.0, max(0.0, progress))
