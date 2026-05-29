#!/usr/bin/env python3
"""
MouserCV — SAM3 Silhouette Shape Analysis

Uses native Facebook SAM3 API for multi-object video tracking with text prompts.
Extracts per-frame shape metrics and detects centroid displacement spikes
(potential identity swaps or rapid movement).

Usage (Colab terminal):
    python scripts/sam3_silhouette.py \
        --video /content/drive/MyDrive/mousercv/Cage\ 17082\ video.MOV \
        --model /content/sam3.pt \
        --start 13:50 --end 14:05 \
        --text "mouse" \
        --out /tmp/mousercv_sam3_results

Setup (run once):
    git clone https://github.com/facebookresearch/sam3.git /tmp/sam3_repo
    cd /tmp/sam3_repo && pip install -e .
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np


# ── Time helpers ──────────────────────────────────────────────────────────────

def time_to_seconds(t: str) -> float:
    parts = t.strip().split(":")
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    elif len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    return float(t)


def seconds_to_time(s: float) -> str:
    m, sec = divmod(s, 60)
    return f"{int(m)}:{sec:05.2f}"


def frame_to_time(frame: int, fps: float) -> str:
    return seconds_to_time(frame / fps)


# ── Shape metrics ─────────────────────────────────────────────────────────────

def compute_shape_metrics(binary_mask: np.ndarray) -> dict | None:
    """Behavior-relevant shape descriptors from a binary mask."""
    m = binary_mask.astype(np.uint8)
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area < 50:
        return None

    perimeter = cv2.arcLength(c, True)
    hull_area = cv2.contourArea(cv2.convexHull(c))
    x, y, w, h = cv2.boundingRect(c)
    M = cv2.moments(c)
    cx = M["m10"] / M["m00"] if M["m00"] else x + w / 2
    cy = M["m01"] / M["m00"] if M["m00"] else y + h / 2

    solidity = area / hull_area if hull_area > 0 else 0.0
    compactness = 4 * np.pi * area / perimeter**2 if perimeter > 0 else 0.0
    aspect_ratio = w / h if h > 0 else 0.0
    extent = area / (w * h) if w * h > 0 else 0.0

    elongation, ellipse_angle = 0.0, 0.0
    if len(c) >= 5:
        (_, _), (ma, mi), angle = cv2.fitEllipse(c)
        elongation = float(mi / ma) if ma > 0 else 0.0
        ellipse_angle = float(angle)

    return dict(
        area=float(area),
        aspect_ratio=float(aspect_ratio),
        solidity=float(solidity),
        compactness=float(compactness),
        extent=float(extent),
        elongation=float(elongation),
        ellipse_angle=float(ellipse_angle),
        centroid_x=float(cx),
        centroid_y=float(cy),
        bbox_x=int(x), bbox_y=int(y), bbox_w=int(w), bbox_h=int(h),
    )


# ── Frame extraction ─────────────────────────────────────────────────────────

def extract_frames(
    video_path: str, start: str, end: str, frames_dir: str,
) -> tuple[list[str], float, int, int]:
    """Extract frames as JPEG folder (SAM3 native input format)."""
    os.makedirs(frames_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    start_frame = int(time_to_seconds(start) * fps)
    end_frame = int(time_to_seconds(end) * fps)

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    paths = []
    for i in range(end_frame - start_frame):
        ret, frame = cap.read()
        if not ret:
            break
        p = os.path.join(frames_dir, f"{i}.jpg")
        cv2.imwrite(p, frame)
        paths.append(p)
    cap.release()

    print(f"Extracted {len(paths)} frames ({len(paths)/fps:.1f}s) → {frames_dir}")
    print(f"Resolution: {width}×{height}, FPS: {fps:.1f}")
    return paths, fps, width, height


# ── Centroid displacement analysis ───────────────────────────────────────────

def analyze_displacement(records: list[dict], fps: float) -> list[dict]:
    """Detect centroid displacement spikes per object.

    A spike = centroid jumps > SPIKE_THRESHOLD px between consecutive frames.
    This signals either rapid movement or identity reassignment.
    """
    SPIKE_THRESHOLD_PX = 80  # ~2400 px/s at 30fps → very fast movement

    # Group records by obj_id
    by_obj: dict[int, list[dict]] = {}
    for r in records:
        by_obj.setdefault(r["obj_id"], []).append(r)

    spikes = []
    for obj_id, recs in sorted(by_obj.items()):
        recs.sort(key=lambda r: r["frame"])
        for i in range(1, len(recs)):
            prev, curr = recs[i - 1], recs[i]
            if curr["frame"] != prev["frame"] + 1:
                continue  # skip gaps
            dx = curr["centroid_x"] - prev["centroid_x"]
            dy = curr["centroid_y"] - prev["centroid_y"]
            disp = np.sqrt(dx**2 + dy**2)
            if disp > SPIKE_THRESHOLD_PX:
                spikes.append(dict(
                    obj_id=obj_id,
                    frame=curr["frame"],
                    displacement_px=round(disp, 1),
                    velocity_px_s=round(disp * fps, 1),
                    from_xy=(round(prev["centroid_x"]), round(prev["centroid_y"])),
                    to_xy=(round(curr["centroid_x"]), round(curr["centroid_y"])),
                ))

    return spikes


# ── Annotated video output ───────────────────────────────────────────────────

COLORS_BGR = [(80, 80, 255), (80, 255, 80), (255, 80, 80),
              (255, 255, 80), (80, 255, 255), (255, 80, 255)]


def write_annotated_video(
    frame_paths: list[str],
    outputs_per_frame: dict,
    records: list[dict],
    out_path: str,
    fps: float,
    start_frame_abs: int,
    scale: float = 0.5,
):
    """Overlay silhouettes + centroids + shape text on each frame."""
    frame0 = cv2.imread(frame_paths[0])
    h, w = frame0.shape[:2]
    out_w, out_h = int(w * scale), int(h * scale)

    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (out_w, out_h))

    # Build lookup: (frame, obj_id) → record
    rec_lookup: dict[tuple[int, int], dict] = {}
    for r in records:
        rec_lookup[(r["frame"], r["obj_id"])] = r

    for fi, fpath in enumerate(frame_paths):
        frame = cv2.imread(fpath)
        abs_f = start_frame_abs + fi

        if fi in outputs_per_frame:
            out = outputs_per_frame[fi]
            masks = out.get("masks")
            obj_ids = out.get("obj_ids", [])

            if masks is not None:
                for idx, oid in enumerate(obj_ids):
                    if idx >= len(masks):
                        break
                    mask = masks[idx]
                    color = COLORS_BGR[oid % len(COLORS_BGR)]

                    # Silhouette fill
                    for ch in range(3):
                        frame[:, :, ch] = np.where(
                            mask > 0,
                            (frame[:, :, ch] * 0.5 + color[ch] * 0.5).astype(np.uint8),
                            frame[:, :, ch],
                        )

                    # Contour outline
                    contours, _ = cv2.findContours(
                        mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cv2.drawContours(frame, contours, -1, color, 2)

                    # Text overlay
                    r = rec_lookup.get((fi, oid))
                    if r:
                        cx, cy = int(r["centroid_x"]), int(r["centroid_y"])
                        txt = f"ID{oid} sol={r['solidity']:.2f} cmp={r['compactness']:.2f}"
                        cv2.putText(frame, txt, (cx - 70, cy - 12),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2, cv2.LINE_AA)
                        cv2.putText(frame, txt, (cx - 70, cy - 12),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

                        # Centroid dot
                        cv2.circle(frame, (cx, cy), 5, color, -1)
                        cv2.circle(frame, (cx, cy), 5, (255, 255, 255), 1)

        # Timestamp
        cv2.putText(frame, frame_to_time(abs_f, fps),
                    (18, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3, cv2.LINE_AA)

        writer.write(cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA))

    writer.release()
    print(f"Annotated video → {out_path} ({out_w}×{out_h})")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SAM3 silhouette analysis for MouserCV")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--model", default="/content/sam3.pt", help="Path to sam3.pt weights")
    parser.add_argument("--start", default="13:50", help="Start time (mm:ss)")
    parser.add_argument("--end", default="14:05", help="End time (mm:ss)")
    parser.add_argument("--text", default="mouse", help="Text prompt for SAM3 detection")
    parser.add_argument("--out", default="/tmp/mousercv_sam3_results", help="Output directory")
    parser.add_argument("--scale", type=float, default=0.5, help="Video output scale")
    parser.add_argument("--hf-token", default="", help="HuggingFace token (if model needs downloading)")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    if args.hf_token:
        os.environ["HF_TOKEN"] = args.hf_token

    # ── 1. Extract frames ─────────────────────────────────────────────────────
    frames_dir = os.path.join(args.out, "frames")
    frame_paths, fps, width, height = extract_frames(args.video, args.start, args.end, frames_dir)
    start_frame_abs = int(time_to_seconds(args.start) * fps)

    # ── 2. Build SAM3 video predictor ─────────────────────────────────────────
    print(f"\nLoading SAM3 from {args.model} ...")
    # Set model path for SAM3 builder
    os.environ["SAM3_CHECKPOINT"] = args.model

    from sam3.model_builder import build_sam3_video_predictor

    predictor = build_sam3_video_predictor()
    print("SAM3 video predictor ready")

    # ── 3. Start session ──────────────────────────────────────────────────────
    response = predictor.handle_request(
        request=dict(type="start_session", resource_path=frames_dir)
    )
    session_id = response["session_id"]
    print(f"Session started: {session_id}")

    # ── 4. Add text prompt on frame 0 ─────────────────────────────────────────
    response = predictor.handle_request(
        request=dict(
            type="add_prompt",
            session_id=session_id,
            frame_index=0,
            text=args.text,
        )
    )
    init_out = response["outputs"]
    init_obj_ids = init_out.get("out_obj_ids", [])
    print(f"Text prompt \"{args.text}\" → detected {len(init_obj_ids)} objects: {init_obj_ids}")

    # ── 5. Propagate through all frames ───────────────────────────────────────
    print(f"\nPropagating masks across {len(frame_paths)} frames ...")
    outputs_per_frame = {}
    records = []

    for response in predictor.handle_stream_request(
        request=dict(type="propagate_in_video", session_id=session_id)
    ):
        fi = response["frame_index"]
        out = response["outputs"]
        masks_tensor = out.get("out_binary_masks")  # (N, H, W) bool tensor
        obj_ids = out.get("out_obj_ids", [])

        if masks_tensor is not None:
            masks_np = masks_tensor.cpu().numpy().astype(np.uint8)
        else:
            masks_np = np.array([])

        # Store for video rendering
        outputs_per_frame[fi] = dict(
            masks=masks_np if len(masks_np) > 0 else None,
            obj_ids=list(obj_ids) if obj_ids is not None else [],
        )

        # Compute shape metrics per object
        for idx, oid in enumerate(obj_ids):
            if idx >= len(masks_np):
                break
            m = compute_shape_metrics(masks_np[idx])
            if m is None:
                continue
            records.append(dict(frame=fi, obj_id=int(oid), **m))

        if (fi + 1) % 50 == 0:
            n_objs = len(obj_ids) if obj_ids is not None else 0
            print(f"  {fi+1}/{len(frame_paths)} frames  ({n_objs} objects tracked)")

    # Close session
    predictor.handle_request(
        request=dict(type="close_session", session_id=session_id)
    )
    print(f"\nPropagation complete. {len(records)} mask records collected.")

    # ── 6. Save metrics CSV ───────────────────────────────────────────────────
    csv_path = os.path.join(args.out, "shape_metrics.csv")
    if records:
        keys = records[0].keys()
        with open(csv_path, "w", newline="") as f:
            writer_csv = csv.DictWriter(f, fieldnames=keys)
            writer_csv.writeheader()
            writer_csv.writerows(records)
        print(f"Shape metrics → {csv_path}")

    # ── 7. Displacement analysis ──────────────────────────────────────────────
    spikes = analyze_displacement(records, fps)

    print(f"\n{'='*70}")
    print("TRACKING & RE-ID REPORT")
    print(f"{'='*70}")

    # Per-object summary
    obj_ids_seen = sorted(set(r["obj_id"] for r in records))
    print(f"\nObjects tracked: {len(obj_ids_seen)}  IDs: {obj_ids_seen}")

    for oid in obj_ids_seen:
        obj_recs = [r for r in records if r["obj_id"] == oid]
        frames_present = [r["frame"] for r in obj_recs]
        coverage = len(frames_present) / len(frame_paths) * 100

        # Centroid range
        cx_vals = [r["centroid_x"] for r in obj_recs]
        cy_vals = [r["centroid_y"] for r in obj_recs]
        areas = [r["area"] for r in obj_recs]
        solidities = [r["solidity"] for r in obj_recs]

        print(f"\n  Object ID {oid}:")
        print(f"    Frames present: {len(frames_present)}/{len(frame_paths)} ({coverage:.0f}%)")
        print(f"    Centroid range: x=[{min(cx_vals):.0f}..{max(cx_vals):.0f}] "
              f"y=[{min(cy_vals):.0f}..{max(cy_vals):.0f}]")
        print(f"    Area: mean={np.mean(areas):.0f} std={np.std(areas):.0f}")
        print(f"    Solidity: mean={np.mean(solidities):.3f} std={np.std(solidities):.3f}")

    # Displacement spikes
    print(f"\n  Displacement spikes (>{80}px/frame): {len(spikes)}")
    if spikes:
        for s in spikes[:20]:
            print(f"    frame={s['frame']} obj={s['obj_id']} "
                  f"disp={s['displacement_px']}px ({s['velocity_px_s']}px/s) "
                  f"{s['from_xy']}→{s['to_xy']}")
        if len(spikes) > 20:
            print(f"    ... and {len(spikes)-20} more")

        # Check for potential ID swaps: multiple objects spike on the same frame
        spike_frames = {}
        for s in spikes:
            spike_frames.setdefault(s["frame"], []).append(s["obj_id"])
        multi_spikes = {f: ids for f, ids in spike_frames.items() if len(ids) > 1}
        if multi_spikes:
            print(f"\n  POTENTIAL ID SWAPS ({len(multi_spikes)} frames with multi-object spikes):")
            for f, ids in sorted(multi_spikes.items())[:10]:
                print(f"    frame {f}: objects {ids} all spiked simultaneously")

    # Save spikes
    spikes_path = os.path.join(args.out, "displacement_spikes.json")
    with open(spikes_path, "w") as f:
        json.dump(spikes, f, indent=2)
    print(f"\n  Spikes → {spikes_path}")

    # ── 8. Write annotated video ──────────────────────────────────────────────
    video_path = os.path.join(args.out, "silhouettes.mp4")
    write_annotated_video(
        frame_paths, outputs_per_frame, records,
        video_path, fps, start_frame_abs, scale=args.scale,
    )

    print(f"\n{'='*70}")
    print("DONE")
    print(f"  Video:   {video_path}")
    print(f"  Metrics: {csv_path}")
    print(f"  Spikes:  {spikes_path}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
