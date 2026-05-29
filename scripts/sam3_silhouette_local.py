#!/usr/bin/env python3
"""
MouserCV — SAM3 Silhouette Analysis (streaming, memory-efficient)

Uses SAM3VideoSemanticPredictor for proper temporal mask propagation.
Streams results frame-by-frame — works on full-length videos without OOM.

Usage:
    cd mousercv/notebooks
    uv run python ../scripts/sam3_silhouette_local.py \
        --video "../data/videos/CV analysis project/Cage 17082 video.MOV" \
        --model ../models/sam3.pt \
        --start 0:00 --end 17:22 \
        --text "mouse" \
        --out /tmp/mousercv_sam3_full
"""

import argparse
import csv
import json
import os
import subprocess
import time

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
        area=float(area), aspect_ratio=float(aspect_ratio),
        solidity=float(solidity), compactness=float(compactness),
        extent=float(extent), elongation=float(elongation),
        ellipse_angle=float(ellipse_angle),
        centroid_x=float(cx), centroid_y=float(cy),
        bbox_x=int(x), bbox_y=int(y), bbox_w=int(w), bbox_h=int(h),
    )


# ── Displacement analysis ────────────────────────────────────────────────────

def analyze_displacement(records: list[dict], fps: float) -> list[dict]:
    SPIKE_THRESHOLD_PX = 80
    by_obj: dict[int, list[dict]] = {}
    for r in records:
        by_obj.setdefault(r["obj_id"], []).append(r)

    spikes = []
    for obj_id, recs in sorted(by_obj.items()):
        recs.sort(key=lambda r: r["frame"])
        for i in range(1, len(recs)):
            prev, curr = recs[i - 1], recs[i]
            if curr["frame"] != prev["frame"] + 1:
                continue
            dx = curr["centroid_x"] - prev["centroid_x"]
            dy = curr["centroid_y"] - prev["centroid_y"]
            disp = np.sqrt(dx**2 + dy**2)
            if disp > SPIKE_THRESHOLD_PX:
                spikes.append(dict(
                    obj_id=obj_id, frame=curr["frame"],
                    displacement_px=round(disp, 1),
                    velocity_px_s=round(disp * fps, 1),
                    from_xy=(round(prev["centroid_x"]), round(prev["centroid_y"])),
                    to_xy=(round(curr["centroid_x"]), round(curr["centroid_y"])),
                ))
    return spikes


COLORS_BGR = [(80, 80, 255), (80, 255, 80), (255, 80, 80),
              (255, 255, 80), (80, 255, 255), (255, 80, 255)]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SAM3 silhouette analysis — streaming")
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", default="../models/sam3.pt")
    parser.add_argument("--start", default="0:00")
    parser.add_argument("--end", default=None, help="End time (default: full video)")
    parser.add_argument("--text", default="mouse")
    parser.add_argument("--out", default="/tmp/mousercv_sam3_results")
    parser.add_argument("--scale", type=float, default=0.5)
    parser.add_argument("--conf", type=float, default=0.40)
    parser.add_argument("--max-objects", type=int, default=3)
    parser.add_argument("--min-area", type=int, default=5000)
    parser.add_argument("--no-video", action="store_true", help="Skip annotated video output")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    # ── 1. Probe video metadata ───────────────────────────────────────────────
    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    start_sec = time_to_seconds(args.start)
    end_sec = time_to_seconds(args.end) if args.end else total_frames / fps
    start_frame = int(start_sec * fps)
    n_frames = int((end_sec - start_sec) * fps)

    print(f"Video: {os.path.basename(args.video)}  {width}×{height} @ {fps:.0f}fps")
    print(f"Range: {args.start} → {seconds_to_time(end_sec)}  ({n_frames} frames, {n_frames/fps:.1f}s)")

    # ── 2. Cut clip (ffmpeg if available, else cv2 fallback) ────────────────
    temp_clip = os.path.join(args.out, "clip.mp4")
    try:
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-ss", str(start_sec),
            "-i", args.video,
            "-t", str(end_sec - start_sec),
            "-c", "copy",
            temp_clip,
        ]
        print(f"Cutting clip with ffmpeg ...")
        subprocess.run(ffmpeg_cmd, capture_output=True, check=True)
    except FileNotFoundError:
        print("ffmpeg not found — falling back to cv2 stream copy ...")
        cap2 = cv2.VideoCapture(args.video)
        cap2.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        w2 = cv2.VideoWriter(temp_clip, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
        for _ in range(n_frames):
            ret, f = cap2.read()
            if not ret:
                break
            w2.write(f)
        w2.release()
        cap2.release()
    clip_size = os.path.getsize(temp_clip) / 1024 / 1024
    print(f"Clip → {temp_clip} ({clip_size:.0f} MB)")

    # ── 3. Load SAM3 ─────────────────────────────────────────────────────────
    import torch
    from ultralytics.models.sam import SAM3VideoSemanticPredictor

    if torch.cuda.is_available():
        device, use_half = "cuda", True   # tensor cores → 2-3x speedup on L4/A100
    elif torch.backends.mps.is_available():
        device, use_half = "mps", False   # MPS doesn't support half
    else:
        device, use_half = "cpu", False
    print(f"\nDevice: {device}  half: {use_half}")
    print(f"Loading SAM3 from {args.model} ...")

    overrides = dict(
        conf=args.conf, task="segment", mode="predict",
        model=args.model, half=use_half, device=device,
    )
    predictor = SAM3VideoSemanticPredictor(overrides=overrides)
    print(f"SAM3VideoSemanticPredictor ready  text=['{args.text}']")

    # ── 4. Open source video for frame reading (annotation) ──────────────────
    src_cap = cv2.VideoCapture(temp_clip)
    out_w, out_h = int(width * args.scale), int(height * args.scale)

    vid_writer = None
    video_path = os.path.join(args.out, "silhouettes.mp4")
    if not args.no_video:
        vid_writer = cv2.VideoWriter(
            video_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (out_w, out_h))

    # ── 5. Stream SAM3 + annotate + metrics in one pass ──────────────────────
    records = []
    csv_path = os.path.join(args.out, "shape_metrics.csv")
    csv_file = open(csv_path, "w", newline="")
    csv_keys = [
        "frame", "time", "obj_id", "area", "aspect_ratio", "solidity",
        "compactness", "extent", "elongation", "ellipse_angle",
        "centroid_x", "centroid_y", "bbox_x", "bbox_y", "bbox_w", "bbox_h",
    ]
    csv_writer = csv.DictWriter(csv_file, fieldnames=csv_keys)
    csv_writer.writeheader()

    # Mask sidecar — compact polygon contours for local silhouette rendering
    masks_path = os.path.join(args.out, "masks.jsonl")
    masks_file = open(masks_path, "w")

    t0 = time.time()
    print(f"\nStreaming SAM3 inference on {n_frames} frames ...")

    for fi, r in enumerate(predictor(source=temp_clip, text=[args.text], stream=True)):
        # Read corresponding frame for annotation
        ret, frame = src_cap.read()
        if not ret:
            frame = np.zeros((height, width, 3), dtype=np.uint8)

        frame_records = []

        if r.masks is not None and len(r.masks) > 0:
            # Filter + rank by area
            candidates = []
            for obj_idx, mask_t in enumerate(r.masks.data):
                mask_np = mask_t.cpu().numpy().astype(np.uint8)
                m = compute_shape_metrics(mask_np)
                if m is None or m["area"] < args.min_area:
                    continue
                candidates.append((obj_idx, mask_np, m))

            candidates.sort(key=lambda x: x[2]["area"], reverse=True)
            candidates = candidates[:args.max_objects]

            for obj_idx, mask_np, m in candidates:
                rec = dict(
                    frame=fi,
                    time=round(fi / fps + start_sec, 3),
                    obj_id=obj_idx,
                    **m,
                )
                csv_writer.writerow({k: rec[k] for k in csv_keys})
                records.append(rec)
                frame_records.append((obj_idx, mask_np, m))

                # Save polygon contour (compact silhouette representation)
                contours, _ = cv2.findContours(
                    mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
                if contours:
                    c = max(contours, key=cv2.contourArea)
                    polygon = c.squeeze(1).tolist() if c.ndim == 3 else c.tolist()
                    masks_file.write(json.dumps({
                        "frame": fi, "obj_id": obj_idx, "polygon": polygon,
                    }) + "\n")

                # Draw annotation on frame
                if vid_writer is not None:
                    color = COLORS_BGR[obj_idx % len(COLORS_BGR)]
                    for ch in range(3):
                        frame[:, :, ch] = np.where(
                            mask_np > 0,
                            (frame[:, :, ch] * 0.5 + color[ch] * 0.5).astype(np.uint8),
                            frame[:, :, ch],
                        )
                    contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cv2.drawContours(frame, contours, -1, color, 2)
                    cx, cy = int(m["centroid_x"]), int(m["centroid_y"])
                    txt = f"ID{obj_idx} sol={m['solidity']:.2f} cmp={m['compactness']:.2f}"
                    cv2.putText(frame, txt, (cx - 70, cy - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2, cv2.LINE_AA)
                    cv2.putText(frame, txt, (cx - 70, cy - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
                    cv2.circle(frame, (cx, cy), 5, color, -1)

        # Timestamp
        if vid_writer is not None:
            abs_f = start_frame + fi
            cv2.putText(frame, frame_to_time(abs_f, fps),
                        (18, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3, cv2.LINE_AA)
            vid_writer.write(cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA))

        if (fi + 1) % 100 == 0:
            elapsed = time.time() - t0
            rate = (fi + 1) / elapsed
            eta = (n_frames - fi - 1) / rate if rate > 0 else 0
            print(f"  {fi+1}/{n_frames}  {elapsed:.0f}s  "
                  f"{rate:.2f} fps  ETA {eta:.0f}s  ({len(frame_records)} masks)",
                  flush=True)
            csv_file.flush()
            masks_file.flush()  # so partial silhouettes are available too

    csv_file.close()
    masks_file.close()
    src_cap.release()
    if vid_writer is not None:
        vid_writer.release()

    total_time = time.time() - t0
    actual_frames = fi + 1
    print(f"\nDone. {len(records)} records in {total_time:.0f}s "
          f"({actual_frames/total_time:.2f} fps, {actual_frames} frames)")
    print(f"Metrics → {csv_path}")

    # ── 6. Displacement analysis ──────────────────────────────────────────────
    spikes = analyze_displacement(records, fps)

    print(f"\n{'='*70}")
    print("TRACKING & RE-ID REPORT")
    print(f"{'='*70}")

    obj_ids_seen = sorted(set(r["obj_id"] for r in records))
    print(f"\nObjects tracked: {len(obj_ids_seen)}  IDs: {obj_ids_seen}")

    for oid in obj_ids_seen:
        obj_recs = [r for r in records if r["obj_id"] == oid]
        coverage = len(obj_recs) / actual_frames * 100
        cx_vals = [r["centroid_x"] for r in obj_recs]
        cy_vals = [r["centroid_y"] for r in obj_recs]
        areas = [r["area"] for r in obj_recs]
        sols = [r["solidity"] for r in obj_recs]

        print(f"\n  Object ID {oid}:")
        print(f"    Frames: {len(obj_recs)}/{actual_frames} ({coverage:.0f}%)")
        print(f"    Centroid: x=[{min(cx_vals):.0f}..{max(cx_vals):.0f}] "
              f"y=[{min(cy_vals):.0f}..{max(cy_vals):.0f}]")
        print(f"    Area: μ={np.mean(areas):.0f} σ={np.std(areas):.0f}")
        print(f"    Solidity: μ={np.mean(sols):.3f} σ={np.std(sols):.3f}")

    print(f"\n  Displacement spikes (>80px/frame): {len(spikes)}")
    for s in spikes[:15]:
        print(f"    frame={s['frame']} ID{s['obj_id']} "
              f"Δ={s['displacement_px']}px ({s['velocity_px_s']}px/s) "
              f"{s['from_xy']}→{s['to_xy']}")
    if len(spikes) > 15:
        print(f"    ... +{len(spikes)-15} more")

    spike_frames = {}
    for s in spikes:
        spike_frames.setdefault(s["frame"], []).append(s["obj_id"])
    multi = {f: ids for f, ids in spike_frames.items() if len(ids) > 1}
    if multi:
        print(f"\n  POTENTIAL ID SWAPS ({len(multi)} frames):")
        for f, ids in sorted(multi.items())[:10]:
            print(f"    frame {f}: IDs {ids} spiked simultaneously")

    spikes_path = os.path.join(args.out, "displacement_spikes.json")
    with open(spikes_path, "w") as f:
        json.dump(spikes, f, indent=2)

    print(f"\n{'='*70}")
    print("DONE")
    if vid_writer is not None:
        print(f"  Video:   {video_path}")
    print(f"  Metrics: {csv_path}")
    print(f"  Spikes:  {spikes_path}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
