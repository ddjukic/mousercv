import { useRef, useEffect, useCallback } from "react"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import { BEHAVIORS, BEHAVIOR_COLORS, BEHAVIOR_LABELS } from "@/types"
import type { BehaviorType } from "@/types"

const LANE_HEIGHT = 24
const LANE_GAP = 2
const HEADER_WIDTH = 80
const AXIS_HEIGHT = 20
const TOP_PADDING = 4

const BEHAVIOR_ORDER: BehaviorType[] = BEHAVIORS.map((behavior) => behavior.name)

export function BehaviorTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentFrame = useVideoStore((s) => s.currentFrame)
  const totalFrames = useVideoStore((s) => s.totalFrames)
  const seekToFrame = useVideoStore((s) => s.seekToFrame)

  const behaviors = useAnnotationStore((s) => s.behaviors)
  const tracks = useAnnotationStore((s) => s.tracks)
  const selectedTrackId = useAnnotationStore((s) => s.selectedTrackId)
  const pendingInPoint = useAnnotationStore((s) => s.pendingInPoint)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const timelineWidth = rect.width - HEADER_WIDTH
    const maxFrame = Math.max(1, totalFrames - 1)
    const frameToX = (frame: number) =>
      HEADER_WIDTH + (frame / maxFrame) * timelineWidth

    // Draw lane labels
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"

    for (let i = 0; i < BEHAVIOR_ORDER.length; i++) {
      const behavior = BEHAVIOR_ORDER[i]
      const y = TOP_PADDING + i * (LANE_HEIGHT + LANE_GAP)

      // Lane background
      ctx.fillStyle = "rgba(39, 39, 42, 0.5)" // zinc-800 at 50%
      ctx.fillRect(HEADER_WIDTH, y, timelineWidth, LANE_HEIGHT)

      // Label
      ctx.fillStyle = BEHAVIOR_COLORS[behavior]
      ctx.font = "11px ui-monospace, monospace"
      ctx.fillText(BEHAVIOR_LABELS[behavior], HEADER_WIDTH - 8, y + LANE_HEIGHT / 2)
    }

    // Draw behavior segments
    for (const seg of behaviors) {
      const track = tracks.find((t) => t.id === seg.track_id)
      if (!track) continue

      const laneIndex = BEHAVIOR_ORDER.indexOf(seg.behavior)
      if (laneIndex === -1) continue

      const y = TOP_PADDING + laneIndex * (LANE_HEIGHT + LANE_GAP)
      const x1 = frameToX(seg.start_frame)
      const x2 = frameToX(seg.end_frame)
      const trackOffset = track.id === 1 ? 0 : LANE_HEIGHT / 2

      ctx.fillStyle = BEHAVIOR_COLORS[seg.behavior]
      ctx.globalAlpha = track.id === 1 ? 0.8 : 0.5
      ctx.fillRect(x1, y + trackOffset, x2 - x1, LANE_HEIGHT / 2)
      ctx.globalAlpha = 1
    }

    // Draw frame axis
    const axisY = TOP_PADDING + BEHAVIOR_ORDER.length * (LANE_HEIGHT + LANE_GAP)
    ctx.fillStyle = "#3f3f46" // zinc-700
    ctx.fillRect(HEADER_WIDTH, axisY, timelineWidth, 1)

    ctx.fillStyle = "#71717a" // zinc-500
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"

    const tickInterval = getTickInterval(totalFrames, timelineWidth)
    for (let f = 0; f <= totalFrames; f += tickInterval) {
      const x = frameToX(f)
      ctx.fillRect(x, axisY, 1, 4)
      ctx.fillText(f.toString(), x, axisY + 5)
    }

    if (pendingInPoint?.trackId === selectedTrackId) {
      const inPointX = frameToX(pendingInPoint.frame)
      ctx.strokeStyle = "#f97316"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(inPointX, 0)
      ctx.lineTo(inPointX, rect.height)
      ctx.stroke()

      ctx.fillStyle = "#f97316"
      ctx.fillRect(inPointX - 3, 0, 6, 8)
    }

    // Draw playhead
    const playheadX = frameToX(currentFrame)
    ctx.strokeStyle = "#ef4444" // red-500
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, rect.height)
    ctx.stroke()

    // Playhead triangle
    ctx.fillStyle = "#ef4444"
    ctx.beginPath()
    ctx.moveTo(playheadX - 4, 0)
    ctx.lineTo(playheadX + 4, 0)
    ctx.lineTo(playheadX, 6)
    ctx.closePath()
    ctx.fill()
  }, [currentFrame, totalFrames, behaviors, tracks, selectedTrackId, pendingInPoint])

  useEffect(() => {
    draw()
  }, [draw])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      draw()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  // Click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const timelineWidth = rect.width - HEADER_WIDTH

      if (x < HEADER_WIDTH) return

      const fraction = (x - HEADER_WIDTH) / timelineWidth
      const frame = Math.round(fraction * Math.max(0, totalFrames - 1))
      seekToFrame(frame)
    },
    [totalFrames, seekToFrame]
  )

  const totalHeight =
    TOP_PADDING +
    BEHAVIOR_ORDER.length * (LANE_HEIGHT + LANE_GAP) +
    AXIS_HEIGHT

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-zinc-400">
          Behavior Timeline
        </span>
        <div className="flex items-center gap-3">
          {BEHAVIOR_ORDER.map((b) => (
            <div key={b} className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: BEHAVIOR_COLORS[b] }}
              />
              <span className="text-[10px] text-zinc-500">
                {BEHAVIOR_LABELS[b]}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1">
              <div className="h-2 w-4 rounded-sm bg-zinc-500 opacity-80" />
              M1
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-4 rounded-sm bg-zinc-500 opacity-50" />
              M2
            </span>
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        className="rounded-md border border-zinc-800 bg-zinc-950/80"
        style={{ height: totalHeight }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair"
          onClick={handleClick}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  )
}

function getTickInterval(totalFrames: number, width: number): number {
  const maxTicks = width / 60
  const raw = totalFrames / maxTicks
  const magnitudes = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  for (const m of magnitudes) {
    if (m >= raw) return m
  }
  return Math.ceil(raw / 1000) * 1000
}
