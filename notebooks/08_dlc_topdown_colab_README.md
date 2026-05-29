# 08_dlc_topdown_colab — Intern Quick-Start

This notebook runs DeepLabCut SuperAnimal on a single top-down mouse cage video and produces a quality-check report. It does **not** train a model and it does **not** run the SAM3 mask pipeline. Its only job is: "is the off-the-shelf pose model good enough on these new top-down videos?"

## 1. Open in Colab

1. Upload `08_dlc_topdown_colab.ipynb` to Google Drive (or open it via GitHub once the repo is pushed).
2. Right-click → **Open with → Google Colaboratory**. If Colab is not in the menu, install it from the Drive marketplace once.
3. **Runtime → Change runtime type → Hardware accelerator: GPU**. T4 is fine; A100 is faster. CPU will not work in any reasonable time.

## 2. Upload one video to Drive

Make a folder structure on your Drive:

```
MyDrive/
└── mousercv/
    ├── videos/
    │   └── Cage 17082 video.MOV         <- put one .MOV / .mp4 here
    └── dlc_topdown_results/             <- the notebook writes here
        └── Cage_17082_video/
            ├── Cage_17082_video_keypoints.csv
            ├── Cage_17082_video_features_individual1.csv
            ├── Cage_17082_video_preview_10s_30s.mp4
            ├── Cage_17082_video_intern_checklist.json
            └── Cage_17082_video_reliability_summary.json
```

Do **not** upload all the videos at once — they total ~10 GB. One per session.

## 3. Required runtime

| Item | Minimum | Recommended |
|---|---|---|
| Colab runtime | T4 GPU | A100 GPU |
| RAM | 12 GB (default) | 25 GB (Colab Pro) |
| Disk | 30 GB scratch | 50 GB |
| Drive space | 5 GB free | 20 GB free |

## 4. Expected runtime per video

- 17-minute video at 30 fps ≈ 30 000 frames.
- T4 GPU: ≈ 5–20 fps inference → **25–90 minutes**.
- A100: ≈ 30–60 fps → **8–17 minutes**.
- First-ever run downloads ≈ 1.5 GB of weights into the Colab runtime; cached for the rest of the session.
- Default `MAX_SECONDS = 60` so the first sanity pass completes in 1–3 minutes. Set to `None` for the full video.

## 5. What to look at, section by section

| Section | What to check |
|---|---|
| 3 — Perspective check | All 4 thumbnails are top-down? If side/front view, stop. |
| 8 — Per-keypoint reliability | Which of the 6 priority keypoints stay above 0.5 most of the time? |
| 9 — Multi-mouse diagnostic | Does detected count stay near `EXPECTED_MICE`? Trajectories continuous? |
| 10 — Annotated MP4 | Open it. Do the dots stick to the right body parts? Any obvious identity swaps? |
| 11 — Body-shape features | Body length roughly constant? Speed spikes when the mouse moves? |
| 12 — Checklist | Fill in JSON, paste into the shared sheet. |

## 6. Where to record findings

Shared Google Sheet template (replace once created):
`https://docs.google.com/spreadsheets/d/REPLACE_ME/edit`

One row per video. Paste the JSON block from section 12.

## 7. Known gotchas

- **First-load weights download** ≈ 1.5 GB. If it stalls, restart runtime and try again.
- **`CUDA out of memory`** during inference → drop `batch_size=8` to `4` in section 5.
- **`No DLC h5 next to ...`** in section 6 → the inference cell silently failed. Scroll up and check its log.
- **Drive timeouts on big files** → the notebook copies the video into local Colab disk (`/content/dlc_work/`) before inference so Drive isn't on the hot path.
- **`superanimal_topviewmouse` does not have explicit paw keypoints.** It uses shoulders/hips. The notebook's priority-keypoint table calls these "proxies" and labels them `OK (proxy)`. This is *the* finding the intern needs to confirm: are shoulders/hips good enough for our scratch/groom classifier, or do we need to switch to `superanimal_quadruped` despite its side-view bias?
- **`.MOV` from iPhones sometimes has rotated metadata.** If thumbnails show the cage on its side, run `ffmpeg -i input.MOV -metadata:s:v rotate=0 -c copy fixed.mp4` before uploading.

## 8. Comparing the two SuperAnimal models

The notebook supports both. Run it twice on the same video, once per model, and compare reliability tables:

| Model | Keypoints | Trained on | Best for |
|---|---|---|---|
| `superanimal_topviewmouse` | 27 (no explicit paws) | ~5 000 lab mice from above | Default for top-down cage video |
| `superanimal_quadruped` | 39 (incl. front_*_paw, back_*_paw) | ~40 000 quadrupeds, mostly side-view | Use when paw position matters and top-view fails |

Decision tree: if paws are unreliable on `superanimal_topviewmouse`, retry with `superanimal_quadruped` and see whether the explicit paw keypoints fare better even on top-down footage.
