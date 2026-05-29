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

type PendingInPoint = { trackId: number; frame: number }

interface AnnotationState {
  tracks: Track[]
  detections: Record<number, Detection[]>
  behaviors: BehaviorSegment[]
  keyframes: Keyframe[]
  analytics: AnalyticsData | null
  selectedTrackId: number | null
  pendingInPoint: PendingInPoint | null
  history: BehaviorSegment[][]
  future: BehaviorSegment[][]

  setTracks: (tracks: Track[]) => void
  setDetections: (detections: Record<number, Detection[]>) => void
  setBehaviors: (behaviors: BehaviorSegment[]) => void
  setKeyframes: (keyframes: Keyframe[]) => void
  setAnalytics: (analytics: AnalyticsData) => void
  selectTrack: (trackId: number | null) => void
  addBehavior: (segment: BehaviorSegment) => void
  setInPoint: (frame: number) => void
  clearInPoint: () => void
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

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  tracks: MOCK_TRACKS,
  detections: MOCK_DETECTIONS,
  behaviors: hydrateBehaviors(),
  keyframes: MOCK_KEYFRAMES,
  analytics: MOCK_ANALYTICS,
  selectedTrackId: MOCK_TRACKS[0]?.id ?? null,
  pendingInPoint: null,
  history: [],
  future: [],

  setTracks: (tracks: Track[]) => set({ tracks }),

  setDetections: (detections: Record<number, Detection[]>) =>
    set({ detections }),

  setBehaviors: (behaviors: BehaviorSegment[]) =>
    set((state) => ({
      behaviors,
      history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setKeyframes: (keyframes: Keyframe[]) => set({ keyframes }),

  setAnalytics: (analytics: AnalyticsData) => set({ analytics }),

  selectTrack: (trackId: number | null) => set({ selectedTrackId: trackId }),

  addBehavior: (segment: BehaviorSegment) =>
    set((state) => ({
      behaviors: [...state.behaviors, segment],
      history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setInPoint: (frame: number) => {
    const { selectedTrackId } = get()
    if (!selectedTrackId) return
    set({ pendingInPoint: { trackId: selectedTrackId, frame } })
  },

  clearInPoint: () => set({ pendingInPoint: null }),

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
        history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  removeBehavior: (id: number) =>
    set((state) => {
      const behaviors = state.behaviors.filter((b) => b.id !== id)
      if (behaviors.length === state.behaviors.length) return state
      return {
        behaviors,
        history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  updateBehavior: (id: number, patch: Partial<BehaviorSegment>) =>
    set((state) => {
      const index = state.behaviors.findIndex((b) => b.id === id)
      if (index === -1) return state

      return {
        behaviors: state.behaviors.map((behavior) =>
          behavior.id === id ? { ...behavior, ...patch } : behavior
        ),
        history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  undo: () =>
    set((state) => {
      const previous = state.history.at(-1)
      if (!previous) return state

      return {
        behaviors: previous,
        history: state.history.slice(0, -1),
        future: [...state.future, state.behaviors],
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future.at(-1)
      if (!next) return state

      return {
        behaviors: next,
        history: [...state.history, state.behaviors].slice(-HISTORY_LIMIT),
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
