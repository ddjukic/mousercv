#!/usr/bin/env python3
"""
Render annotated silhouette video locally from original video + CSV.
No GPU needed. Use on any video slice after SAM3 tracking data is in hand.

Usage:
    python3 scripts/render_annotations.py \
        --video "data/videos/CV analysis project/Cage 17082 video.MOV" \
        --csv data/sam3_results/cage17082/shape_metrics.csv \
        --start 13:50 --end 14:05 \
        --out /tmp/cage17082_scratch.mp4 \
        --scale 0.5
"""

import argparse
import csv
import json
import os

import cv2
import numpy as np


COLORS_BGR = [(80, 80, 255), (80, 255, 80), (255, 80, 80),
              (255, 255, 80), (80, 255, 255), (255, 80, 255)]


def time_to_seconds(t: str) -> float:
    parts = t.strip().split(":")
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    return float(t)


def frame_to_time(frame: int, fps: float) -> str:
    s = frame / fps
    m, sec = divmod(s, 60)
    return f"{int(m)}:{sec:05.2f}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--csv", required=True)
    p.add_argument("--masks", default=None,
                   help="Path to masks.jsonl (polygon contours) — auto-detected if sibling of --csv")
    p.add_argument("--start", default="0:00")
    p.add_argument("--end", default=None)
    p.add_argument("--out", default="/tmp/annotated.mp4")
    p.add_argument("--scale", type=float, default=0.5)
    args = p.parse_args()

    if args.masks is None:
        guess = os.path.join(os.path.dirname(args.csv), "masks.jsonl")
        if os.path.exists(guess):
            args.masks = guess

    # Probe video
    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    start_sec = time_to_seconds(args.start)
    end_sec = time_to_seconds(args.end) if args.end else total / fps
    f0 = int(start_sec * fps)
    f1 = int(end_sec * fps)
    print(f"Video: {w}×{h} @ {fps:.0f}fps  range {args.start}→{args.end}  frames {f0}..{f1}")

    # Load CSV metrics + optional polygon masks
    per_frame = {}
    with open(args.csv) as f:
        for row in csv.DictReader(f):
            fi = int(row["frame"])
            per_frame.setdefault(fi, []).append({
                "obj_id": int(row["obj_id"]),
                "cx": float(row["centroid_x"]),
                "cy": float(row["centroid_y"]),
                "bx": int(row["bbox_x"]), "by": int(row["bbox_y"]),
                "bw": int(row["bbox_w"]), "bh": int(row["bbox_h"]),
                "solidity": float(row["solidity"]),
                "compactness": float(row["compactness"]),
                "aspect_ratio": float(row["aspect_ratio"]),
                "polygon": None,
            })

    if args.masks and os.path.exists(args.masks):
        n_loaded = 0
        with open(args.masks) as f:
            for line in f:
                m = json.loads(line)
                entries = per_frame.get(m["frame"], [])
                for e in entries:
                    if e["obj_id"] == m["obj_id"]:
                        e["polygon"] = np.array(m["polygon"], dtype=np.int32)
                        n_loaded += 1
                        break
        print(f"Loaded {n_loaded} polygon contours from {args.masks}")
    else:
        print("No masks.jsonl — rendering with bbox only")

    out_w, out_h = int(w * args.scale), int(h * args.scale)
    writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (out_w, out_h))

    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    for fi in range(f0, f1):
        ret, frame = cap.read()
        if not ret:
            break

        for obj in per_frame.get(fi, []):
            oid = obj["obj_id"]
            color = COLORS_BGR[oid % len(COLORS_BGR)]

            # Silhouette fill + contour (if polygon available)
            if obj["polygon"] is not None:
                mask = np.zeros(frame.shape[:2], dtype=np.uint8)
                cv2.fillPoly(mask, [obj["polygon"]], 1)
                for ch in range(3):
                    frame[:, :, ch] = np.where(
                        mask > 0,
                        (frame[:, :, ch] * 0.5 + color[ch] * 0.5).astype(np.uint8),
                        frame[:, :, ch],
                    )
                cv2.polylines(frame, [obj["polygon"]], isClosed=True,
                              color=color, thickness=2)
            else:
                # Fallback: bbox outline
                cv2.rectangle(frame, (obj["bx"], obj["by"]),
                              (obj["bx"] + obj["bw"], obj["by"] + obj["bh"]),
                              color, 2)
            # centroid dot
            cx, cy = int(obj["cx"]), int(obj["cy"])
            cv2.circle(frame, (cx, cy), 6, color, -1)
            cv2.circle(frame, (cx, cy), 6, (255, 255, 255), 1)
            # label
            txt = f"ID{oid} sol={obj['solidity']:.2f} cmp={obj['compactness']:.2f} ar={obj['aspect_ratio']:.2f}"
            cv2.putText(frame, txt, (cx - 100, cy - 14),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(frame, txt, (cx - 100, cy - 14),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        cv2.putText(frame, frame_to_time(fi, fps),
                    (18, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 5, cv2.LINE_AA)
        cv2.putText(frame, frame_to_time(fi, fps),
                    (18, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 2, cv2.LINE_AA)

        writer.write(cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA))

    writer.release()
    cap.release()
    print(f"Wrote {args.out} ({os.path.getsize(args.out)//1024//1024}MB, {out_w}×{out_h})")


if __name__ == "__main__":
    main()
