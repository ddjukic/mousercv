import { beforeEach, describe, expect, it } from "vitest"
import { useAnnotationStore } from "./annotation-store"
import type { BehaviorSegment, Keyframe, Track } from "@/types"

const baseTracks: Track[] = [
  { id: 1, video_id: 12, label: "Mouse 1", color: "#3b82f6", is_active: true },
  { id: 2, video_id: 12, label: "Mouse 2", color: "#ef4444", is_active: true },
]

const baseBehaviors: BehaviorSegment[] = [
  { id: 4, track_id: 1, start_frame: 10, end_frame: 20, behavior: "idle" },
  { id: 7, track_id: 2, start_frame: 30, end_frame: 45, behavior: "grooming" },
]

const baseKeyframes: Keyframe[] = [
  { id: 1, track_id: 1, frame_number: 0, label: "Start" },
  { id: 2, track_id: 2, frame_number: 50, label: "Scratching onset" },
]

function resetStore() {
  useAnnotationStore.setState({
    tracks: baseTracks,
    behaviors: baseBehaviors,
    keyframes: baseKeyframes,
    selectedTrackId: 1,
    pendingInPoint: null,
    pendingSelection: null,
    history: [],
    future: [],
  })
}

describe("annotation store track mutations", () => {
  beforeEach(() => {
    resetStore()
  })

  it("addTrack allocates the next id", () => {
    useAnnotationStore.getState().addTrack()

    const track = useAnnotationStore.getState().tracks.at(-1)
    expect(track?.id).toBe(3)
  })

  it("addTrack allocates the next mouse label", () => {
    useAnnotationStore.getState().addTrack()

    const track = useAnnotationStore.getState().tracks.at(-1)
    expect(track?.label).toBe("Mouse 3")
  })

  it("addTrack allocates a palette color and copies the video id", () => {
    useAnnotationStore.getState().addTrack()

    const track = useAnnotationStore.getState().tracks.at(-1)
    expect(track?.color).toBe("#22c55e")
    expect(track?.video_id).toBe(12)
    expect(track?.is_active).toBe(true)
  })

  it("addTrack starts at id 1 and Mouse 1 when there are no tracks", () => {
    useAnnotationStore.setState({ tracks: [], selectedTrackId: null })

    useAnnotationStore.getState().addTrack()

    expect(useAnnotationStore.getState().tracks).toEqual([
      { id: 1, video_id: 0, label: "Mouse 1", color: "#3b82f6", is_active: true },
    ])
  })

  it("removeTrack cascade-deletes that track's behaviors", () => {
    useAnnotationStore.getState().removeTrack(2)

    expect(useAnnotationStore.getState().tracks.map((track) => track.id)).toEqual([1])
    expect(useAnnotationStore.getState().behaviors).toEqual([baseBehaviors[0]])
  })

  it("removeTrack selects the first remaining track when the selected track is removed", () => {
    useAnnotationStore.setState({ selectedTrackId: 2 })

    useAnnotationStore.getState().removeTrack(2)

    expect(useAnnotationStore.getState().selectedTrackId).toBe(1)
  })

  it("removeTrack cascade-deletes that track's keyframes", () => {
    useAnnotationStore.getState().removeTrack(2)

    expect(useAnnotationStore.getState().keyframes).toEqual([baseKeyframes[0]])
  })

  it("removeTrack keeps a valid selection even when a dangling track was selected", () => {
    // selectedTrackId points at a track that no longer exists (e.g. left over
    // from a prior delete). Removing any track must resolve it to a real track.
    useAnnotationStore.setState({ selectedTrackId: 99 })

    useAnnotationStore.getState().removeTrack(2)

    expect(useAnnotationStore.getState().selectedTrackId).toBe(1)
  })

  it("removeTrack clears selectedTrackId when the last track is removed", () => {
    useAnnotationStore.setState({
      tracks: [baseTracks[0]],
      behaviors: [baseBehaviors[0]],
      selectedTrackId: 1,
    })

    useAnnotationStore.getState().removeTrack(1)

    expect(useAnnotationStore.getState().tracks).toEqual([])
    expect(useAnnotationStore.getState().behaviors).toEqual([])
    expect(useAnnotationStore.getState().selectedTrackId).toBeNull()
  })

  it("updateTrack patches only the targeted track", () => {
    useAnnotationStore.getState().updateTrack(2, {
      label: "Resident",
      is_active: false,
    })

    expect(useAnnotationStore.getState().tracks).toEqual([
      baseTracks[0],
      { ...baseTracks[1], label: "Resident", is_active: false },
    ])
  })
})

describe("annotation store selection annotations", () => {
  beforeEach(() => {
    resetStore()
  })

  it("commitSelectionBehavior creates a normalized segment for the selected range", () => {
    useAnnotationStore
      .getState()
      .setPendingSelection({ trackId: 2, startFrame: 120, endFrame: 90 })

    useAnnotationStore.getState().commitSelectionBehavior("rearing")

    expect(useAnnotationStore.getState().behaviors.at(-1)).toEqual({
      id: 8,
      track_id: 2,
      start_frame: 90,
      end_frame: 120,
      behavior: "rearing",
    })
  })

  it("commitSelectionBehavior clears pendingSelection", () => {
    useAnnotationStore
      .getState()
      .setPendingSelection({ trackId: 1, startFrame: 12, endFrame: 18 })

    useAnnotationStore.getState().commitSelectionBehavior("scratching")

    expect(useAnnotationStore.getState().pendingSelection).toBeNull()
  })

  it("commitSelectionBehavior leaves behaviors untouched without a pending selection", () => {
    useAnnotationStore.getState().commitSelectionBehavior("grooming")

    expect(useAnnotationStore.getState().behaviors).toEqual(baseBehaviors)
  })

  it("clearPendingSelection clears the pending range", () => {
    useAnnotationStore
      .getState()
      .setPendingSelection({ trackId: 1, startFrame: 5, endFrame: 9 })

    useAnnotationStore.getState().clearPendingSelection()

    expect(useAnnotationStore.getState().pendingSelection).toBeNull()
  })
})

describe("annotation store behavior resizing", () => {
  beforeEach(() => {
    resetStore()
  })

  it("updateBehavior clamps a negative resized start frame to zero", () => {
    useAnnotationStore.getState().updateBehavior(4, { start_frame: -15 })

    expect(useAnnotationStore.getState().behaviors[0]).toMatchObject({
      start_frame: 0,
      end_frame: 20,
    })
  })

  it("updateBehavior prevents the resized start from crossing the end", () => {
    useAnnotationStore.getState().updateBehavior(4, { start_frame: 30 })

    expect(useAnnotationStore.getState().behaviors[0]).toMatchObject({
      start_frame: 19,
      end_frame: 20,
    })
  })

  it("updateBehavior prevents the resized end from crossing the start", () => {
    useAnnotationStore.getState().updateBehavior(4, { end_frame: 5 })

    expect(useAnnotationStore.getState().behaviors[0]).toMatchObject({
      start_frame: 10,
      end_frame: 11,
    })
  })
})
