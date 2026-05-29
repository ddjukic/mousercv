import { useEffect, useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import { BEHAVIOR_HOTKEYS } from "@/types"
import type { BehaviorType } from "@/types"

export const HOTKEY_LEGEND_OPEN_EVENT = "mousercv:hotkey-legend-open"
export const HOTKEY_LEGEND_CLOSE_EVENT = "mousercv:hotkey-legend-close"

const HOTKEY_OPTIONS = { enableOnFormTags: false }
const OUT_POINT_CHORD_MS = 1500

export function useKeyboardShortcuts() {
  const outPointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outPointArmedRef = useRef(false)

  const togglePlaying = useVideoStore((s) => s.togglePlaying)
  const setPlaying = useVideoStore((s) => s.setPlaying)
  const stepFrame = useVideoStore((s) => s.stepFrame)
  const seekToFrame = useVideoStore((s) => s.seekToFrame)
  const setPlaybackRate = useVideoStore((s) => s.setPlaybackRate)
  const currentFrame = useVideoStore((s) => s.currentFrame)
  const totalFrames = useVideoStore((s) => s.totalFrames)

  const tracks = useAnnotationStore((s) => s.tracks)
  const behaviors = useAnnotationStore((s) => s.behaviors)
  const selectedTrackId = useAnnotationStore((s) => s.selectedTrackId)
  const selectedBehaviorId = useAnnotationStore((s) => s.selectedBehaviorId)
  const pendingInPoint = useAnnotationStore((s) => s.pendingInPoint)
  const pendingSelection = useAnnotationStore((s) => s.pendingSelection)
  const selectTrack = useAnnotationStore((s) => s.selectTrack)
  const addBehavior = useAnnotationStore((s) => s.addBehavior)
  const setInPoint = useAnnotationStore((s) => s.setInPoint)
  const clearInPoint = useAnnotationStore((s) => s.clearInPoint)
  const clearPendingSelection = useAnnotationStore((s) => s.clearPendingSelection)
  const commitSelectionBehavior = useAnnotationStore(
    (s) => s.commitSelectionBehavior
  )
  const commitOutPoint = useAnnotationStore((s) => s.commitOutPoint)
  const removeBehavior = useAnnotationStore((s) => s.removeBehavior)
  const undo = useAnnotationStore((s) => s.undo)
  const redo = useAnnotationStore((s) => s.redo)

  useEffect(() => {
    return () => {
      if (outPointTimerRef.current) clearTimeout(outPointTimerRef.current)
    }
  }, [])

  const armOutPointChord = () => {
    outPointArmedRef.current = true
    if (outPointTimerRef.current) clearTimeout(outPointTimerRef.current)
    outPointTimerRef.current = setTimeout(() => {
      outPointArmedRef.current = false
      outPointTimerRef.current = null
    }, OUT_POINT_CHORD_MS)
  }

  const clearOutPointChord = () => {
    outPointArmedRef.current = false
    if (outPointTimerRef.current) {
      clearTimeout(outPointTimerRef.current)
      outPointTimerRef.current = null
    }
  }

  const stampBehavior = (behavior: BehaviorType) => {
    if (pendingSelection) {
      commitSelectionBehavior(behavior)
      return
    }

    if (selectedTrackId == null) return

    if (outPointArmedRef.current) {
      clearOutPointChord()
      commitOutPoint(currentFrame, behavior)
      return
    }

    if (pendingInPoint?.trackId === selectedTrackId) {
      commitOutPoint(currentFrame, behavior)
      return
    }

    const endFrame = Math.min(currentFrame + 30, Math.max(0, totalFrames - 1))
    const newId =
      behaviors.length > 0 ? Math.max(...behaviors.map((b) => b.id)) + 1 : 1

    addBehavior({
      id: newId,
      track_id: selectedTrackId,
      start_frame: currentFrame,
      end_frame: endFrame,
      behavior,
    })
  }

  useHotkeys(
    "space",
    (event) => {
      event.preventDefault()
      togglePlaying()
    },
    HOTKEY_OPTIONS
  )

  useHotkeys(
    "j",
    () => {
      setPlaybackRate(0.5)
      setPlaying(true)
    },
    HOTKEY_OPTIONS
  )

  useHotkeys("k", () => togglePlaying(), HOTKEY_OPTIONS)

  useHotkeys(
    "l",
    () => {
      setPlaybackRate(2)
      setPlaying(true)
    },
    HOTKEY_OPTIONS
  )

  // Bypass react-hotkeys-hook for comma and period: the library uses ',' as
  // its OR-separator between alternative hotkeys and its parser doesn't reach
  // a stable binding for these literals even with delimiter overrides. A raw
  // keydown listener is the reliable path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select") return
      if (e.key === ",") {
        e.preventDefault()
        stepFrame(e.shiftKey ? -10 : -1)
      } else if (e.key === ".") {
        e.preventDefault()
        stepFrame(e.shiftKey ? 10 : 1)
      } else if (e.key === "<") {
        // some keyboards report shift+, as '<'
        e.preventDefault()
        stepFrame(-10)
      } else if (e.key === ">") {
        e.preventDefault()
        stepFrame(10)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [stepFrame])
  useHotkeys("left", () => stepFrame(-1), HOTKEY_OPTIONS)
  useHotkeys("right", () => stepFrame(1), HOTKEY_OPTIONS)

  useHotkeys("i", () => setInPoint(currentFrame), HOTKEY_OPTIONS)
  useHotkeys("o", armOutPointChord, HOTKEY_OPTIONS)

  useHotkeys(
    "1,2,3,4,5,6,7",
    (event) => {
      if (event.shiftKey) return
      const behavior = BEHAVIOR_HOTKEYS[event.key as keyof typeof BEHAVIOR_HOTKEYS]
      if (behavior) stampBehavior(behavior)
    },
    HOTKEY_OPTIONS
  )

  useHotkeys(
    "z",
    (event) => {
      if (!event.shiftKey) undo()
    },
    HOTKEY_OPTIONS
  )
  useHotkeys("shift+z", () => redo(), HOTKEY_OPTIONS)
  useHotkeys("y", () => redo(), HOTKEY_OPTIONS)

  useHotkeys(
    "backspace,delete",
    () => {
      if (selectedBehaviorId != null) {
        removeBehavior(selectedBehaviorId)
        return
      }

      if (selectedTrackId == null) return

      const target = [...behaviors]
        .reverse()
        .find(
          (behavior) =>
            behavior.track_id === selectedTrackId &&
            currentFrame >= behavior.start_frame &&
            currentFrame <= behavior.end_frame
        )

      if (target) removeBehavior(target.id)
    },
    HOTKEY_OPTIONS
  )

  // N / P jump to next / previous annotation on the active track. If no track
  // is active, falls back to all behaviors. Wraps around the ends.
  useHotkeys(
    "n",
    () => {
      const pool = (
        selectedTrackId == null
          ? behaviors
          : behaviors.filter((b) => b.track_id === selectedTrackId)
      )
        .slice()
        .sort((a, b) => a.start_frame - b.start_frame)
      if (pool.length === 0) return
      const next =
        pool.find((b) => b.start_frame > currentFrame) ?? pool[0]
      seekToFrame(next.start_frame)
    },
    HOTKEY_OPTIONS
  )
  useHotkeys(
    "p",
    () => {
      const pool = (
        selectedTrackId == null
          ? behaviors
          : behaviors.filter((b) => b.track_id === selectedTrackId)
      )
        .slice()
        .sort((a, b) => a.start_frame - b.start_frame)
      if (pool.length === 0) return
      const prev =
        [...pool].reverse().find((b) => b.start_frame < currentFrame) ??
        pool[pool.length - 1]
      seekToFrame(prev.start_frame)
    },
    HOTKEY_OPTIONS
  )

  useHotkeys(
    "shift+1,shift+2,shift+3,shift+4,shift+5,shift+6,shift+7,shift+8,shift+9",
    (event) => {
      const digit = event.code.startsWith("Digit")
        ? event.code.replace("Digit", "")
        : event.key
      const index = Number(digit) - 1
      const track = tracks[index]
      if (track) selectTrack(track.id)
    },
    HOTKEY_OPTIONS
  )

  // Bind several variants — different OSes/keyboards report Shift+/ differently
  // (key: "?" vs key: "/" with shiftKey, code: "Slash"). Register all of them
  // so the legend opens reliably.
  useHotkeys("shift+/", () => window.dispatchEvent(new Event(HOTKEY_LEGEND_OPEN_EVENT)), HOTKEY_OPTIONS)
  useHotkeys("shift+slash", () => window.dispatchEvent(new Event(HOTKEY_LEGEND_OPEN_EVENT)), HOTKEY_OPTIONS)
  useHotkeys("?", () => window.dispatchEvent(new Event(HOTKEY_LEGEND_OPEN_EVENT)), HOTKEY_OPTIONS)

  useHotkeys(
    "escape",
    () => {
      clearOutPointChord()
      clearInPoint()
      clearPendingSelection()
      window.dispatchEvent(new Event(HOTKEY_LEGEND_CLOSE_EVENT))
    },
    HOTKEY_OPTIONS
  )
}
