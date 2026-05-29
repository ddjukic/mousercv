"""GCS synchronization endpoint for MouserCV."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas import SyncResponse
from app.services.sync import sync_from_gcs

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/gcs", response_model=SyncResponse)
def trigger_gcs_sync(
    session: Session = Depends(get_session),
) -> SyncResponse:
    """Trigger a manual synchronization of video metadata from GCS.

    Fetches all metadata JSON files from the configured GCS bucket,
    validates them, and upserts corresponding Project and Video records
    in the database.

    Returns:
        A ``SyncResponse`` with counts of videos added/updated and any errors.
    """
    result = sync_from_gcs(session)
    return SyncResponse(**result)
