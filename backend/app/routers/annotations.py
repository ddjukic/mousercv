"""Annotation-related endpoints (placeholder for future expansion).

Currently re-exports behavior and keyframe operations from the tracks router.
This module exists for organizational clarity and can hold cross-track
annotation operations (e.g., bulk behavior assignment, annotation export).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.get("/behaviors/categories")
def list_behavior_categories() -> list[dict]:
    """List all valid behavior categories with their display colors."""
    return [
        {"name": "grooming", "color": "#22c55e", "description": "Self-grooming behavior"},
        {"name": "scratching", "color": "#f97316", "description": "Scratching behavior"},
        {"name": "rearing", "color": "#a855f7", "description": "Rearing on hind legs"},
        {"name": "idle", "color": "#6b7280", "description": "Idle / resting"},
    ]
