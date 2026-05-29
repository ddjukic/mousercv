"""Google Cloud Storage client for MouserCV.

Provides functions to interact with a GCS bucket containing video metadata,
analysis results, and video files. All functions gracefully handle the case
where GCS is not configured (no credentials or bucket), returning None or
empty collections instead of raising exceptions.
"""

import json
import logging
import os
from datetime import timedelta

from google.cloud import storage

logger = logging.getLogger(__name__)

BUCKET_NAME = os.environ.get("GCS_BUCKET", "mousercv-data")


def get_client() -> storage.Client | None:
    """Return a GCS storage client, or None if not configured.

    The client is created using Application Default Credentials. If no
    credentials are available (e.g., running locally without GCS setup),
    returns None.

    Returns:
        A ``storage.Client`` instance, or ``None`` if GCS is not configured.
    """
    try:
        client = storage.Client()
        # Verify the bucket is accessible
        client.get_bucket(BUCKET_NAME)
        return client
    except Exception as exc:
        logger.info("GCS client not available: %s", exc)
        return None


def list_metadata_jsons() -> list[dict]:
    """List and parse all metadata JSON files from the bucket.

    Scans the ``metadata/`` prefix in the configured GCS bucket and returns
    the parsed contents of every ``.json`` file found.

    Returns:
        A list of parsed JSON dictionaries. Returns an empty list if GCS
        is not configured or if an error occurs.
    """
    client = get_client()
    if client is None:
        return []

    try:
        bucket = client.bucket(BUCKET_NAME)
        blobs = bucket.list_blobs(prefix="metadata/")
        results: list[dict] = []
        for blob in blobs:
            if not blob.name.endswith(".json"):
                continue
            try:
                content = blob.download_as_text()
                parsed = json.loads(content)
                results.append(parsed)
            except (json.JSONDecodeError, Exception) as exc:
                logger.warning(
                    "Failed to parse metadata blob %s: %s", blob.name, exc
                )
        return results
    except Exception as exc:
        logger.warning("Failed to list metadata JSONs: %s", exc)
        return []


def download_results(video_id: str) -> dict | None:
    """Download analysis results for a specific video.

    Fetches ``results/{video_id}/behaviors.json`` from the configured
    GCS bucket and returns its parsed contents.

    Args:
        video_id: The identifier of the video whose results to download.

    Returns:
        A parsed JSON dictionary of the results, or ``None`` if GCS is
        not configured, the file does not exist, or an error occurs.
    """
    client = get_client()
    if client is None:
        return None

    try:
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(f"results/{video_id}/behaviors.json")
        if not blob.exists():
            logger.info(
                "Results not found for video %s in GCS", video_id
            )
            return None
        content = blob.download_as_text()
        return json.loads(content)
    except Exception as exc:
        logger.warning(
            "Failed to download results for video %s: %s", video_id, exc
        )
        return None


def upload_metadata(video_id: str, metadata: dict) -> str | None:
    """Upload a metadata JSON file to GCS.

    Writes the provided metadata dictionary as JSON to
    ``metadata/{video_id}.json`` in the configured GCS bucket.

    Args:
        video_id: The identifier of the video.
        metadata: The metadata dictionary to serialize and upload.

    Returns:
        The GCS URI (``gs://bucket/path``) of the uploaded file,
        or ``None`` if GCS is not configured or an error occurs.
    """
    client = get_client()
    if client is None:
        return None

    try:
        bucket = client.bucket(BUCKET_NAME)
        blob_path = f"metadata/{video_id}.json"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(
            json.dumps(metadata, indent=2, default=str),
            content_type="application/json",
        )
        gcs_uri = f"gs://{BUCKET_NAME}/{blob_path}"
        logger.info("Uploaded metadata to %s", gcs_uri)
        return gcs_uri
    except Exception as exc:
        logger.warning(
            "Failed to upload metadata for video %s: %s", video_id, exc
        )
        return None


def get_signed_video_url(
    gcs_uri: str, expiration_minutes: int = 60
) -> str | None:
    """Generate a signed URL for a video file in GCS.

    Creates a time-limited signed URL that allows unauthenticated access
    to the video file for the specified duration.

    Args:
        gcs_uri: The full GCS URI (``gs://bucket/path/to/video.mp4``).
        expiration_minutes: How many minutes the URL should remain valid.
            Defaults to 60.

    Returns:
        A signed HTTPS URL string, or ``None`` if GCS is not configured,
        the URI is invalid, or an error occurs.
    """
    client = get_client()
    if client is None:
        return None

    try:
        # Parse gs://bucket/path format
        if not gcs_uri.startswith("gs://"):
            logger.warning("Invalid GCS URI format: %s", gcs_uri)
            return None

        uri_without_scheme = gcs_uri[5:]  # Remove "gs://"
        parts = uri_without_scheme.split("/", 1)
        if len(parts) < 2:
            logger.warning("Invalid GCS URI (no path): %s", gcs_uri)
            return None

        bucket_name = parts[0]
        blob_path = parts[1]

        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)

        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=expiration_minutes),
            method="GET",
        )
        return url
    except Exception as exc:
        logger.warning(
            "Failed to generate signed URL for %s: %s", gcs_uri, exc
        )
        return None
