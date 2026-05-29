import { useRef, useEffect, useCallback, useState } from "react"
import type { PointerEvent } from "react"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import { BEHAVIORS, BEHAVIOR_COLORS, BEHAVIOR_LABELS } from "@/types"
import type { BehaviorSegment, BehaviorType, Track } from "@/types"

const LANE_HEIGHT = 28
const LANE_GAP = 3
const HEADER_WIDTH = 96
const AXIS_HEIGHT = 20
const TOP_PADDING = 4
const EDGE_HIT_PX = 4
const DRAG_THRESHOLD_PX = 3

const BEHAVIOR_ORDER: BehaviorType[] = BEHAVIORS.map((behavior) => behavior.name)

type TimelineGeometry = {
  rect: DOMRect
  timelineWidth: number
  maxFrame: number
}

type DragMode = "select" | "resize-start" | "resize-end"

type DragState = {
  pointerId: number
  startX: number
  startY: number
  startFrame: number
  trackId: number
  mode: DragMode
  segmentId?: number
  didDrag: boolean
}

type TooltipState = {
  x: number
  y: number
  text: string
} | null

type PendingSelection = {
  trackId: number
  startFrame: number
  endFrame: number
}

export function BehaviorTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const currentFrame = useVideoStore((s) => s.currentFrame)
  const totalFrames = useVideoStore((s) => s.totalFrames)
  const fps = useVideoStore((s) => s.fps)
  const seekToFrame = useVideoStore((s) => s.seekToFrame)

  const behaviors = useAnnotationStore((s) => s.behaviors)
  const tracks = useAnnotationStore((s) => s.tracks)
  const selectedTrackId = useAnnotationStore((s) => s.selectedTrackId)
  const selectedBehaviorId = useAnnotationStore((s) => s.selectedBehaviorId)
  const pendingInPoint = useAnnotationStore((s) => s.pendingInPoint)
  const pendingSelection = useAnnotationStore((s) => s.pendingSelection)
  const selectTrack = useAnnotationStore((s) => s.selectTrack)
  const selectBehavior = useAnnotationStore((s) => s.selectBehavior)
  const setPendingSelection = useAnnotationStore((s) => s.setPendingSelection)
  const clearPendingSelection = useAnnotationStore((s) => s.clearPendingSelection)
  const updateBehavior = useAnnotationStore((s) => s.updateBehavior)
  const updateBehaviorSilent = useAnnotationStore((s) => s.updateBehaviorSilent)

  const [liveSelection, setLiveSelection] = useState<PendingSelection | null>(
    null
  )
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const getGeometry = useCallback((): TimelineGeometry | null => {
    const container = containerRef.current
    if (!container) return null

    const rect = container.getBoundingClientRect()
    return {
      rect,
      timelineWidth: Math.max(1, rect.width - HEADER_WIDTH),
      maxFrame: Math.max(1, totalFrames - 1),
    }
  }, [totalFrames])

  const frameToX = useCallback((frame: number, geometry: TimelineGeometry) => {
    return HEADER_WIDTH + (frame / geometry.maxFrame) * geometry.timelineWidth
  }, [])

  const xToFrame = useCallback((x: number, geometry: TimelineGeometry) => {
    const fraction = (x - HEADER_WIDTH) / geometry.timelineWidth
    return Math.max(
      0,
      Math.min(geometry.maxFrame, Math.round(fraction * geometry.maxFrame))
    )
  }, [])

  const yToTrack = useCallback(
    (y: number): Track | null => {
      const laneStep = LANE_HEIGHT + LANE_GAP
      const laneIndex = Math.floor((y - TOP_PADDING) / laneStep)
      const laneY = TOP_PADDING + laneIndex * laneStep

      if (laneIndex < 0 || laneIndex >= tracks.length) return null
      if (y < laneY || y > laneY + LANE_HEIGHT) return null
      return tracks[laneIndex]
    },
    [tracks]
  )

  const hitTestSegment = useCallback(
    (
      x: number,
      y: number,
      geometry: TimelineGeometry
    ): { segment: BehaviorSegment; edge: "start" | "end" | null } | null => {
      const track = yToTrack(y)
      if (!track) return null

      const laneIndex = tracks.findIndex((candidate) => candidate.id === track.id)
      const laneY = TOP_PADDING + laneIndex * (LANE_HEIGHT + LANE_GAP)
      if (y < laneY + 4 || y > laneY + LANE_HEIGHT - 4) return null

      const sorted = behaviors
        .filter((behavior) => behavior.track_id === track.id)
        .slice()
        .sort((a, b) => b.id - a.id)

      for (const segment of sorted) {
        const x1 = frameToX(segment.start_frame, geometry)
        const x2 = frameToX(segment.end_frame, geometry)
        const left = Math.min(x1, x2)
        const right = Math.max(x1, x2)
        if (x < left || x > right) continue

        const edge =
          segment.id === selectedBehaviorId && Math.abs(x - left) <= EDGE_HIT_PX
            ? "start"
            : segment.id === selectedBehaviorId &&
                Math.abs(x - right) <= EDGE_HIT_PX
              ? "end"
              : null

        return { segment, edge }
      }

      return null
    },
    [behaviors, frameToX, selectedBehaviorId, tracks, yToTrack]
  )

  const drawSelection = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      selection: PendingSelection,
      geometry: TimelineGeometry,
      dashed: boolean
    ) => {
      const laneIndex = tracks.findIndex((track) => track.id === selection.trackId)
      if (laneIndex === -1) return

      const startFrame = Math.min(selection.startFrame, selection.endFrame)
      const endFrame = Math.max(selection.startFrame, selection.endFrame)
      const x1 = frameToX(startFrame, geometry)
      const x2 = frameToX(endFrame, geometry)
      const y = TOP_PADDING + laneIndex * (LANE_HEIGHT + LANE_GAP)

      ctx.save()
      ctx.fillStyle = "rgba(56, 189, 248, 0.18)"
      ctx.strokeStyle = "#38bdf8"
      ctx.lineWidth = 1.5
      if (dashed) ctx.setLineDash([4, 3])
      ctx.fillRect(x1, y + 3, Math.max(1, x2 - x1), LANE_HEIGHT - 6)
      ctx.strokeRect(x1, y + 3, Math.max(1, x2 - x1), LANE_HEIGHT - 6)
      ctx.restore()
    },
    [frameToX, tracks]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const geometry = getGeometry()
    if (!canvas || !geometry) return

    const { rect, timelineWidth, maxFrame } = geometry
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    ctx.textBaseline = "middle"

    if (tracks.length === 0) {
      ctx.fillStyle = "#71717a"
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("Add a mouse to annotate behavior ranges", rect.width / 2, 24)
    }

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const y = TOP_PADDING + i * (LANE_HEIGHT + LANE_GAP)

      ctx.fillStyle =
        track.id === selectedTrackId
          ? "rgba(63, 63, 70, 0.9)"
          : "rgba(39, 39, 42, 0.55)"
      ctx.fillRect(HEADER_WIDTH, y, timelineWidth, LANE_HEIGHT)

      ctx.fillStyle = track.color
      ctx.beginPath()
      ctx.arc(12, y + LANE_HEIGHT / 2, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = track.id === selectedTrackId ? "#e4e4e7" : "#a1a1aa"
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(track.label, 22, y + LANE_HEIGHT / 2)

      if (!track.is_active) {
        ctx.fillStyle = "#71717a"
        ctx.font = "9px ui-monospace, monospace"
        ctx.textAlign = "right"
        ctx.fillText("HIDDEN", HEADER_WIDTH - 8, y + LANE_HEIGHT / 2)
      }
    }

    for (const segment of behaviors) {
      const laneIndex = tracks.findIndex((track) => track.id === segment.track_id)
      if (laneIndex === -1) continue

      const y = TOP_PADDING + laneIndex * (LANE_HEIGHT + LANE_GAP)
      const x1 = frameToX(segment.start_frame, geometry)
      const x2 = frameToX(segment.end_frame, geometry)
      const width = Math.max(1, x2 - x1)

      ctx.fillStyle = BEHAVIOR_COLORS[segment.behavior]
      ctx.globalAlpha = segment.id === selectedBehaviorId ? 0.95 : 0.78
      ctx.fillRect(x1, y + 5, width, LANE_HEIGHT - 10)
      ctx.globalAlpha = 1

      if (segment.id === selectedBehaviorId) {
        ctx.strokeStyle = "#f8fafc"
        ctx.lineWidth = 2
        ctx.strokeRect(x1 - 1, y + 4, width + 2, LANE_HEIGHT - 8)

        ctx.fillStyle = "#f8fafc"
        ctx.fillRect(x1 - 1, y + 3, 2, LANE_HEIGHT - 6)
        ctx.fillRect(x2 - 1, y + 3, 2, LANE_HEIGHT - 6)
      }
    }

    if (liveSelection) {
      drawSelection(ctx, liveSelection, geometry, false)
    } else if (pendingSelection) {
      drawSelection(ctx, pendingSelection, geometry, true)
    }

    const axisY = TOP_PADDING + tracks.length * (LANE_HEIGHT + LANE_GAP)
    ctx.fillStyle = "#3f3f46"
    ctx.fillRect(HEADER_WIDTH, axisY, timelineWidth, 1)

    ctx.fillStyle = "#71717a"
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"

    const tickInterval = getTickInterval(totalFrames, timelineWidth)
    for (let frame = 0; frame <= totalFrames; frame += tickInterval) {
      const x = HEADER_WIDTH + (frame / maxFrame) * timelineWidth
      ctx.fillRect(x, axisY, 1, 4)
      ctx.fillText(frame.toString(), x, axisY + 5)
    }

    if (pendingInPoint?.trackId === selectedTrackId) {
      const inPointX = frameToX(pendingInPoint.frame, geometry)
      ctx.strokeStyle = "#f97316"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(inPointX, 0)
      ctx.lineTo(inPointX, rect.height)
      ctx.stroke()

      ctx.fillStyle = "#f97316"
      ctx.fillRect(inPointX - 3, 0, 6, 8)
    }

    const playheadX = frameToX(currentFrame, geometry)
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, rect.height)
    ctx.stroke()

    ctx.fillStyle = "#ef4444"
    ctx.beginPath()
    ctx.moveTo(playheadX - 4, 0)
    ctx.lineTo(playheadX + 4, 0)
    ctx.lineTo(playheadX, 6)
    ctx.closePath()
    ctx.fill()
  }, [
    behaviors,
    currentFrame,
    drawSelection,
    frameToX,
    getGeometry,
    liveSelection,
    pendingInPoint,
    pendingSelection,
    selectedBehaviorId,
    selectedTrackId,
    totalFrames,
    tracks,
  ])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      draw()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const geometry = getGeometry()
      if (!canvas || !geometry) return

      const x = event.clientX - geometry.rect.left
      const y = event.clientY - geometry.rect.top
      if (x < HEADER_WIDTH) return

      const track = yToTrack(y)
      if (!track) return

      const frame = xToFrame(x, geometry)
      const hit = hitTestSegment(x, y, geometry)

      selectTrack(track.id)
      setTooltip(null)
      canvas.setPointerCapture(event.pointerId)

      if (hit?.edge) {
        dragRef.current = {
          pointerId: event.pointerId,
          startX: x,
          startY: y,
          startFrame: frame,
          trackId: track.id,
          mode: hit.edge === "start" ? "resize-start" : "resize-end",
          segmentId: hit.segment.id,
          didDrag: false,
        }
        return
      }

      dragRef.current = {
        pointerId: event.pointerId,
        startX: x,
        startY: y,
        startFrame: frame,
        trackId: track.id,
        mode: "select",
        didDrag: false,
      }
    },
    [getGeometry, hitTestSegment, selectTrack, xToFrame, yToTrack]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const geometry = getGeometry()
      if (!geometry) return

      const x = event.clientX - geometry.rect.left
      const y = event.clientY - geometry.rect.top
      const drag = dragRef.current

      if (!drag) {
        const hit = hitTestSegment(x, y, geometry)
        if (hit) {
          setTooltip({
            x: event.clientX - geometry.rect.left + 12,
            y: event.clientY - geometry.rect.top + 12,
            text: `${BEHAVIOR_LABELS[hit.segment.behavior]} ${formatFrameTime(
              hit.segment.start_frame,
              fps
            )}-${formatFrameTime(hit.segment.end_frame, fps)}`,
          })
        } else {
          setTooltip(null)
        }
        return
      }

      const distance = Math.hypot(x - drag.startX, y - drag.startY)
      const didDrag = drag.didDrag || distance > DRAG_THRESHOLD_PX
      const startedDrag = !drag.didDrag && didDrag
      dragRef.current = { ...drag, didDrag }
      if (!didDrag) return

      const frame = xToFrame(x, geometry)

      if (drag.mode === "select") {
        setLiveSelection({
          trackId: drag.trackId,
          startFrame: drag.startFrame,
          endFrame: frame,
        })
        return
      }

      const segment = behaviors.find((behavior) => behavior.id === drag.segmentId)
      if (!segment) return

      if (startedDrag) {
        updateBehavior(segment.id, {})
      }

      if (drag.mode === "resize-start") {
        updateBehaviorSilent(segment.id, {
          start_frame: Math.min(frame, segment.end_frame - 1),
        })
      } else {
        updateBehaviorSilent(segment.id, {
          end_frame: Math.max(frame, segment.start_frame + 1),
        })
      }
    },
    [
      behaviors,
      fps,
      getGeometry,
      hitTestSegment,
      updateBehavior,
      updateBehaviorSilent,
      xToFrame,
    ]
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const geometry = getGeometry()
      const drag = dragRef.current
      if (!canvas || !geometry || !drag) return

      const x = event.clientX - geometry.rect.left
      const y = event.clientY - geometry.rect.top
      const frame = xToFrame(x, geometry)
      const hit = hitTestSegment(x, y, geometry)

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }

      dragRef.current = null
      setLiveSelection(null)

      if (drag.didDrag) {
        if (drag.mode === "select") {
          setPendingSelection({
            trackId: drag.trackId,
            startFrame: Math.min(drag.startFrame, frame),
            endFrame: Math.max(drag.startFrame, frame),
          })
          selectBehavior(null)
        }
        return
      }

      if (hit) {
        selectBehavior(hit.segment.id)
        clearPendingSelection()
        return
      }

      seekToFrame(frame)
      selectBehavior(null)
      clearPendingSelection()
    },
    [
      clearPendingSelection,
      getGeometry,
      hitTestSegment,
      seekToFrame,
      selectBehavior,
      setPendingSelection,
      xToFrame,
    ]
  )

  const handlePointerLeave = useCallback(() => {
    if (!dragRef.current) setTooltip(null)
  }, [])

  const totalHeight =
    TOP_PADDING + Math.max(1, tracks.length) * (LANE_HEIGHT + LANE_GAP) + AXIS_HEIGHT

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-zinc-400">
          Behavior Timeline
        </span>
        <div className="flex items-center gap-3">
          {BEHAVIOR_ORDER.map((behavior) => (
            <div key={behavior} className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: BEHAVIOR_COLORS[behavior] }}
              />
              <span className="text-[10px] text-zinc-500">
                {BEHAVIOR_LABELS[behavior]}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative rounded-md border border-zinc-800 bg-zinc-950/80"
        style={{ height: totalHeight }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          style={{ width: "100%", height: "100%" }}
        />
        {tooltip && (
          <div
            className="pointer-events-none absolute rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 shadow"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
      <div className="px-1 text-[10px] text-zinc-500">
        {pendingSelection
          ? "Press 1-7 to label · Esc to cancel"
          : "Drag a range, then press 1-7"}
      </div>
    </div>
  )
}

function getTickInterval(totalFrames: number, width: number): number {
  const maxTicks = width / 60
  const raw = totalFrames / maxTicks
  const magnitudes = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  for (const magnitude of magnitudes) {
    if (magnitude >= raw) return magnitude
  }
  return Math.ceil(raw / 1000) * 1000
}

function formatFrameTime(frame: number, fps: number): string {
  const totalSeconds = Math.max(0, Math.floor(frame / Math.max(1, fps)))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
