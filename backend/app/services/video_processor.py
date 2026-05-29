"""Video processing utilities using OpenCV.

Handles metadata extraction, on-demand frame extraction, and thumbnail creation.
"""

from pathlib import Path

import cv2
import numpy as np


def extract_metadata(video_path: str) -> dict:
    """Extract video metadata (fps, duration, resolution) using OpenCV.

    Args:
        video_path: Absolute path to the video file.

    Returns:
        Dictionary with keys: fps, duration_sec, width, height, frame_count.

    Raises:
        FileNotFoundError: If the video file does not exist.
        RuntimeError: If OpenCV cannot open the video.
    """
    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV cannot open video: {video_path}")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = frame_count / fps if fps > 0 else 0.0

        return {
            "fps": fps,
            "duration_sec": duration_sec,
            "width": width,
            "height": height,
            "frame_count": frame_count,
        }
    finally:
        cap.release()


def extract_frame(video_path: str, frame_number: int) -> bytes:
    """Extract a single frame from a video and return it as JPEG bytes.

    Args:
        video_path: Absolute path to the video file.
        frame_number: Zero-indexed frame number to extract.

    Returns:
        JPEG-encoded bytes of the frame.

    Raises:
        FileNotFoundError: If the video file does not exist.
        RuntimeError: If the frame cannot be read.
        ValueError: If frame_number is negative.
    """
    if frame_number < 0:
        raise ValueError(f"Frame number must be non-negative, got {frame_number}")

    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV cannot open video: {video_path}")

    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        if not ret:
            raise RuntimeError(
                f"Cannot read frame {frame_number} from {video_path}"
            )

        success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not success:
            raise RuntimeError(f"Failed to encode frame {frame_number} as JPEG")

        return buffer.tobytes()
    finally:
        cap.release()


def create_thumbnail(
    video_path: str,
    frame_number: int,
    output_path: str,
    size: tuple[int, int] = (160, 120),
) -> str:
    """Create a thumbnail image from a video frame.

    Args:
        video_path: Absolute path to the video file.
        frame_number: Frame to capture.
        output_path: Where to save the thumbnail.
        size: Thumbnail dimensions (width, height).

    Returns:
        The output_path on success.
    """
    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV cannot open video: {video_path}")

    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        if not ret:
            raise RuntimeError(
                f"Cannot read frame {frame_number} from {video_path}"
            )

        thumbnail = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
        cv2.imwrite(output_path, thumbnail, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return output_path
    finally:
        cap.release()


def generate_placeholder_frame(
    width: int = 640,
    height: int = 480,
    frame_number: int = 0,
) -> bytes:
    """Generate a placeholder frame when video is unavailable.

    Creates a dark gray frame with the frame number displayed.

    Args:
        width: Frame width.
        height: Frame height.
        frame_number: Frame number to display as text.

    Returns:
        JPEG-encoded bytes.
    """
    frame = np.zeros((height, width, 3), dtype=np.uint8) + 40
    text = f"Frame {frame_number}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.0
    thickness = 2
    text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
    text_x = (width - text_size[0]) // 2
    text_y = (height + text_size[1]) // 2
    cv2.putText(frame, text, (text_x, text_y), font, font_scale, (200, 200, 200), thickness)

    success, buffer = cv2.imencode(".jpg", frame)
    if not success:
        raise RuntimeError("Failed to encode placeholder frame")
    return buffer.tobytes()
