# annotations/

This folder collects **timestamped JSON annotation files** produced by the MouserCV
annotation tool. Interns push their work here directly from the browser
("Push to GitHub" button) — no local `git` required. Each push creates one new file;
files are never overwritten because the filename carries an ISO timestamp.

## Filename convention

```
<video-stem>-annotations-<ISO_timestamp>.json
```

Example: `Cage_17082_video-annotations-2026-05-29T11-42-07-318Z.json`

## File schema (`mousercv-annotations/v1`)

```jsonc
{
  "schema": "mousercv-annotations/v1",
  "video_filename": "Cage 17082 video.MOV",   // the video that was annotated
  "exported_at": "2026-05-29T11:42:07.318Z",   // ISO 8601, when exported/pushed
  "fps": 30,                                    // frames per second used for sec<->frame
  "frame_count": 30000,                         // null if duration was unknown
  "annotator": "marina",                        // free-text, "" if not set
  "behavior_legend": {                          // hotkey -> behavior label
    "1": "Grooming", "2": "Scratching", "3": "Rearing",
    "4": "Idle", "5": "Uncertain", "6": "Hypergrooming", "7": "Head shake"
  },
  "segments": [
    {
      "id": 1,
      "track_id": 0,
      "track_label": "Mouse 1",
      "behavior": "scratching",
      "behavior_label": "Scratching",
      "start_frame": 120,
      "end_frame": 156,
      "start_sec": 4.0,
      "end_sec": 5.2,
      "duration_frames": 36,
      "duration_sec": 1.2,
      "notes": "",
      "confidence": null
    }
  ]
}
```

## Behavior definitions (from the SME, Bauer lab)

| Behavior | Limb | Notes |
|---|---|---|
| **Scratching** | HIND limbs | Itch response. Rapid repetitive strokes, 0.5–10 s bouts (~20 Hz, invisible at 30 fps). |
| **Grooming** | FRONT paws | Self-care. Paw/body licking, < 10 s. |
| **Hypergrooming** | FRONT paws | Prolonged 50 s–5 min, cephalocaudal sequence, often interrupted by scratching. |
| **Head shake** | head | Often precedes a scratching bout (potential novel finding — flag these). |
| **Rearing** | — | Standing on hind limbs. |
| **Idle** | — | No notable activity. |
| **Uncertain** | — | Low confidence — flag for review. |

The HIND-vs-FRONT limb distinction is the gold-standard discriminator. When in doubt
between scratch and groom, watch which limb is active and add a `notes` value.

## How these get used

These JSON files are training/validation data for the behavior classifier and for
threshold validation. One file per annotation session per video is ideal. Re-annotating
the same video later just adds a new timestamped file — that's fine, we keep history.
