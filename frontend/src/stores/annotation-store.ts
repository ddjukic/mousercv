import { create } from "zustand"
import type {
  Track,
  Detection,
  BehaviorSegment,
  Keyframe,
  AnalyticsData,
  BehaviorType,
} from "@/types"
import {
  MOCK_TRACKS,
  MOCK_DETECTIONS,
  MOCK_BEHAVIORS,
  MOCK_KEYFRAMES,
  MOCK_ANALYTICS,
} from "@/data/mock"

const STORAGE_KEY = "mousercv:behaviors:v1"
const HISTORY_LIMIT = 50
const TRACK_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
]

type PendingInPoint = { trackId: number; frame: number }
type PendingSelection = { trackId: number; startFrame: number; endFrame: number }
type HistoryEntry = {
  tracks: Track[]
  behaviors: BehaviorSegment[]
  keyframes: Keyframe[]
  selectedTrackId: number | null
  selectedBehaviorId: number | null
}

interface AnnotationState {
  tracks: Track[]
  detections: Record<number, Detection[]>
  behaviors: BehaviorSegment[]
  keyframes: Keyframe[]
  analytics: AnalyticsData | null
  selectedTrackId: number | null
  selectedBehaviorId: number | null
  pendingInPoint: PendingInPoint | null
  pendingSelection: PendingSelection | null
  history: HistoryEntry[]
  future: HistoryEntry[]

  setTracks: (tracks: Track[]) => void
  addTrack: () => void
  removeTrack: (id: number) => void
  updateTrack: (id: number, patch: Partial<Track>) => void
  setDetections: (detections: Record<number, Detection[]>) => void
  setBehaviors: (behaviors: BehaviorSegment[]) => void
  setKeyframes: (keyframes: Keyframe[]) => void
  setAnalytics: (analytics: AnalyticsData) => void
  selectTrack: (trackId: number | null) => void
  selectBehavior: (behaviorId: number | null) => void
  addBehavior: (segment: BehaviorSegment) => void
  setInPoint: (frame: number) => void
  clearInPoint: () => void
  setPendingSelection: (selection: PendingSelection) => void
  clearPendingSelection: () => void
  commitSelectionBehavior: (behavior: BehaviorType) => void
  commitOutPoint: (frame: number, behavior: BehaviorType) => void
  removeBehavior: (id: number) => void
  updateBehavior: (id: number, patch: Partial<BehaviorSegment>) => void
  undo: () => void
  redo: () => void
  resetHistory: () => void
  getDetectionsAtFrame: (frame: number) => Detection[]
  getTrackById: (trackId: number) => Track | undefined
}

function hydrateBehaviors(): BehaviorSegment[] {
  if (typeof window === "undefined") return MOCK_BEHAVIORS

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return MOCK_BEHAVIORS
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : MOCK_BEHAVIORS
  } catch {
    return MOCK_BEHAVIORS
  }
}

function nextBehaviorId(behaviors: BehaviorSegment[]): number {
  return behaviors.length > 0 ? Math.max(...behaviors.map((b) => b.id)) + 1 : 1
}

function snapshot(state: AnnotationState): HistoryEntry {
  return {
    tracks: state.tracks,
    behaviors: state.behaviors,
    keyframes: state.keyframes,
    selectedTrackId: state.selectedTrackId,
    selectedBehaviorId: state.selectedBehaviorId,
  }
}

function clampBehaviorSegment(
  behavior: BehaviorSegment,
  patch: Partial<BehaviorSegment>
): BehaviorSegment {
  const merged = { ...behavior, ...patch }
  const startPatched = patch.start_frame != null
  const endPatched = patch.end_frame != null

  let startFrame = Math.max(0, merged.start_frame)
  let endFrame = Math.max(0, merged.end_frame)

  if (startPatched && startFrame >= endFrame) {
    startFrame = Math.max(0, endFrame - 1)
  }

  if (endPatched && endFrame <= startFrame) {
    endFrame = startFrame + 1
  }

  return {
    ...merged,
    start_frame: startFrame,
    end_frame: endFrame,
  }
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  tracks: MOCK_TRACKS,
  detections: MOCK_DETECTIONS,
  behaviors: hydrateBehaviors(),
  keyframes: MOCK_KEYFRAMES,
  analytics: MOCK_ANALYTICS,
  selectedTrackId: MOCK_TRACKS[0]?.id ?? null,
  selectedBehaviorId: null,
  pendingInPoint: null,
  pendingSelection: null,
  history: [],
  future: [],

  setTracks: (tracks: Track[]) => set({ tracks }),

  addTrack: () =>
    set((state) => {
      const id =
        state.tracks.length > 0 ? Math.max(...state.tracks.map((t) => t.id)) + 1 : 1
      const track: Track = {
        id,
        video_id: state.tracks[0]?.video_id ?? 0,
        label: `Mouse ${id}`,
        color: TRACK_COLORS[(id - 1) % TRACK_COLORS.length],
        is_active: true,
      }

      return {
        tracks: [...state.tracks, track],
        selectedTrackId: id,
      }
    }),

  removeTrack: (id: number) =>
    set((state) => {
      const tracks = state.tracks.filter((track) => track.id !== id)
      if (tracks.length === state.tracks.length) return state

      const behaviors = state.behaviors.filter(
        (behavior) => behavior.track_id !== id
      )
      const keyframes = state.keyframes.filter(
        (keyframe) => keyframe.track_id !== id
      )
      // Always resolve to a track that still exists, so the UI never points at
      // a deleted track (which would blank the Active Track selector and show a
      // ghost track's keyframes).
      const selectedTrackId = tracks.some((t) => t.id === state.selectedTrackId)
        ? state.selectedTrackId
        : tracks[0]?.id ?? null

      return {
        tracks,
        behaviors,
        keyframes,
        selectedTrackId,
        selectedBehaviorId:
          state.selectedBehaviorId != null &&
          state.behaviors.some(
            (behavior) =>
              behavior.id === state.selectedBehaviorId && behavior.track_id === id
          )
            ? null
            : state.selectedBehaviorId,
        pendingInPoint:
          state.pendingInPoint?.trackId === id ? null : state.pendingInPoint,
        pendingSelection:
          state.pendingSelection?.trackId === id ? null : state.pendingSelection,
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  updateTrack: (id: number, patch: Partial<Track>) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, ...patch, id: track.id } : track
      ),
    })),

  setDetections: (detections: Record<number, Detection[]>) =>
    set({ detections }),

  setBehaviors: (behaviors: BehaviorSegment[]) =>
    set((state) => ({
      behaviors,
      history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setKeyframes: (keyframes: Keyframe[]) => set({ keyframes }),

  setAnalytics: (analytics: AnalyticsData) => set({ analytics }),

  selectTrack: (trackId: number | null) => set({ selectedTrackId: trackId }),

  selectBehavior: (behaviorId: number | null) =>
    set({ selectedBehaviorId: behaviorId }),

  addBehavior: (segment: BehaviorSegment) =>
    set((state) => ({
      behaviors: [...state.behaviors, segment],
      history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setInPoint: (frame: number) => {
    const { selectedTrackId } = get()
    if (!selectedTrackId) return
    set({ pendingInPoint: { trackId: selectedTrackId, frame } })
  },

  clearInPoint: () => set({ pendingInPoint: null }),

  setPendingSelection: (selection: PendingSelection) =>
    set({ pendingSelection: selection }),

  clearPendingSelection: () => set({ pendingSelection: null }),

  commitSelectionBehavior: (behavior: BehaviorType) =>
    set((state) => {
      const pending = state.pendingSelection
      if (!pending) return state

      const segment: BehaviorSegment = {
        id: nextBehaviorId(state.behaviors),
        track_id: pending.trackId,
        start_frame: Math.min(pending.startFrame, pending.endFrame),
        end_frame: Math.max(pending.startFrame, pending.endFrame),
        behavior,
      }

      return {
        behaviors: [...state.behaviors, segment],
        pendingSelection: null,
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  commitOutPoint: (frame: number, behavior: BehaviorType) =>
    set((state) => {
      const pending = state.pendingInPoint
      if (!pending || pending.trackId !== state.selectedTrackId) return state

      const segment: BehaviorSegment = {
        id: nextBehaviorId(state.behaviors),
        track_id: pending.trackId,
        start_frame: Math.min(pending.frame, frame),
        end_frame: Math.max(pending.frame, frame),
        behavior,
      }

      return {
        behaviors: [...state.behaviors, segment],
        pendingInPoint: null,
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  removeBehavior: (id: number) =>
    set((state) => {
      const behaviors = state.behaviors.filter((b) => b.id !== id)
      if (behaviors.length === state.behaviors.length) return state
      return {
        behaviors,
        selectedBehaviorId:
          state.selectedBehaviorId === id ? null : state.selectedBehaviorId,
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  updateBehavior: (id: number, patch: Partial<BehaviorSegment>) =>
    set((state) => {
      const index = state.behaviors.findIndex((b) => b.id === id)
      if (index === -1) return state

      return {
        behaviors: state.behaviors.map((behavior) =>
          behavior.id === id ? clampBehaviorSegment(behavior, patch) : behavior
        ),
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  undo: () =>
    set((state) => {
      const previous = state.history.at(-1)
      if (!previous) return state

      return {
        tracks: previous.tracks,
        behaviors: previous.behaviors,
        keyframes: previous.keyframes,
        selectedTrackId: previous.selectedTrackId,
        selectedBehaviorId: previous.selectedBehaviorId,
        history: state.history.slice(0, -1),
        future: [...state.future, snapshot(state)],
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future.at(-1)
      if (!next) return state

      return {
        tracks: next.tracks,
        behaviors: next.behaviors,
        keyframes: next.keyframes,
        selectedTrackId: next.selectedTrackId,
        selectedBehaviorId: next.selectedBehaviorId,
        history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(0, -1),
      }
    }),

  resetHistory: () => set({ history: [], future: [] }),

  getDetectionsAtFrame: (frame: number) => {
    const { detections } = get()
    return detections[frame] ?? []
  },

  getTrackById: (trackId: number) => {
    const { tracks } = get()
    return tracks.find((t) => t.id === trackId)
  },
}))

let autosaveTimer: ReturnType<typeof setTimeout> | undefined
let lastSavedBehaviors = useAnnotationStore.getState().behaviors

useAnnotationStore.subscribe((state) => {
  if (typeof window === "undefined") return
  if (state.behaviors === lastSavedBehaviors) return

  if (autosaveTimer) window.clearTimeout(autosaveTimer)
  lastSavedBehaviors = state.behaviors
  autosaveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.behaviors))
    } catch {
      // Ignore storage quota/privacy failures; annotations remain in memory.
    }
  }, 500)
})
