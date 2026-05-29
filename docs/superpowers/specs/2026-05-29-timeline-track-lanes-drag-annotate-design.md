# Per-mouse timeline lanes + drag-select annotation — design

**Date:** 2026-05-29 · **Status:** approved, ready for implementation
**Area:** `frontend/` annotation tool

## Problem

1. **Track operations are dead UI.** `TracksSidebar.tsx` dropdown items (Rename / Hide / Delete)
   have no `onClick`; the store has no track-mutation actions. Deleting a track does nothing.
2. **No direct region annotation.** The timeline (`BehaviorTimeline.tsx`) only supports
   click-to-seek. The only way to create a bout is the I/O keyboard flow. There is no way to
   drag across the timeline and mark a region.

## Mental model (user's words)

> "Split the video track by how many mice (user-selected), then drag anywhere across a track
> and hit a key to add a behavior to those frames."

## Design

### 1. Timeline = one lane per track (mouse)
- Replace today's per-behavior lanes with **one lane per `track`**. Left header: mouse label + color dot.
- A track's `BehaviorSegment`s render as colored bars inside its lane; **bar color = `BEHAVIOR_COLORS[behavior]`**.
  Behavior→color legend stays in the timeline header. Hover a bar → tooltip (behavior label + `mm:ss–mm:ss`).
- Active track's lane is visually emphasized. Empty-state (0 tracks) shows a hint to add a mouse.

### 2. Drag-select → hotkey to label
- Lane interaction model (canvas, pointer events):
  - **pointerdown** in a lane records `{trackId, startFrame}`, sets that track active, and begins a drag.
  - **pointermove** (drag distance > 3px) draws a live translucent highlight `[startFrame…currentFrame]`.
  - **pointerup**:
    - if drag distance ≤ 3px → treat as **click-to-seek** (existing behavior) + clear pending selection.
    - else → store `pendingSelection = {trackId, startFrame, endFrame}` (normalized min/max), drawn as a dashed outline.
- **1–7** while a `pendingSelection` exists → create a bout of that behavior for `pendingSelection.trackId`
  over the range, then clear it. Integrated as the **top-priority branch** in `stampBehavior`
  (above out-point chord, in-point, and playhead-stamp fallback).
- **Esc** clears `pendingSelection` (in addition to its current clears).
- Inline hint under the timeline: "Drag a range, then press 1–7" → "Press 1–7 to label · Esc to cancel"
  when a selection is pending.

### 3. Edit existing bouts
- **Click** a bar → `selectedSegmentId` (local timeline state) set; bar gets a bright outline.
- **Delete/Backspace** → remove the selected bout. Extend the existing delete hotkey so a
  timeline-selected bout takes priority over the playhead-under-cursor bout.
- **Edge-resize:** when a bout is selected, its left/right edges (±4px hit zone) become drag handles;
  dragging updates `start_frame`/`end_frame` via `updateBehavior`, clamped to `[0, totalFrames-1]` and
  not crossing the opposite edge (min width 1 frame). Body-move is out of scope.

### 4. Track management
- Sidebar **+ Add mouse** button → `addTrack()`: new id = `max(track ids)+1`, label `Mouse N`,
  next color from a fixed palette (cycles), `is_active: true`, `video_id` copied from an existing track or 0.
- Wire dropdown:
  - **Delete** → `removeTrack(id)`: drop the track **and all its behaviors**; if it was selected,
    select the first remaining track (or `null`).
  - **Rename** → inline editable text input on the row (toggled by local state), commits via `updateTrack(id, {label})` on Enter/blur. No `window.prompt`.
  - **Hide/Show** → `updateTrack(id, {is_active})`; controls the bbox overlay only — the lane stays visible.

### 5. Store changes (`annotation-store.ts`)
New state: `pendingSelection: { trackId: number; startFrame: number; endFrame: number } | null`.
New actions:
- `addTrack(): void`
- `removeTrack(id: number): void`  // cascade-deletes behaviors, fixes selectedTrackId; history-tracked
- `updateTrack(id: number, patch: Partial<Track>): void`
- `setPendingSelection(sel): void` / `clearPendingSelection(): void`
- `commitSelectionBehavior(behavior: BehaviorType): void`  // creates segment from pendingSelection, clears it, history-tracked

Behavior-list mutations remain history-tracked (undo/redo) exactly as today.

## Testing
- Add **Vitest** (`pnpm add -D vitest`), `test` script, no jsdom needed for pure store logic.
- Unit tests for: `addTrack` id/label/color allocation; `removeTrack` cascade + selection fix;
  `commitSelectionBehavior` produces a segment with normalized min/max frames + correct track + next id,
  and clears the selection; resize clamping via `updateBehavior`.
- Then `pnpm build` green + manual browser verification (drag-create on a lane, 1–7 labels it,
  edge-resize, click+Delete, add/delete/rename track).

## Non-goals
- Body-move drag of bouts. Backend persistence. Multi-rater. Changing the I/O flow (kept as-is).
