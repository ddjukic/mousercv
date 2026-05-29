import { useRef, useEffect, type RefObject } from "react"
import type { Detection, Track } from "@/types"

interface BboxOverlayProps {
  detections: Detection[]
  tracks: Track[]
  containerRef: RefObject<HTMLDivElement | null>
  videoWidth: number
  videoHeight: number
}

export function BboxOverlay({
  detections,
  tracks,
  containerRef,
  videoWidth,
  videoHeight,
}: BboxOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const scaleX = rect.width / videoWidth
    const scaleY = rect.height / videoHeight

    for (const det of detections) {
      const track = tracks.find((t) => t.id === det.track_id)
      if (!track || !track.is_active) continue

      const x = det.x1 * scaleX
      const y = det.y1 * scaleY
      const w = (det.x2 - det.x1) * scaleX
      const h = (det.y2 - det.y1) * scaleY
      const color = track.color

      // Draw bounding box
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)

      // Draw label background
      const label = `${track.label}: ${Math.round(det.confidence * 100)}%`
      ctx.font = "11px ui-monospace, monospace"
      const textMetrics = ctx.measureText(label)
      const labelHeight = 16
      const labelWidth = textMetrics.width + 8

      ctx.fillStyle = color
      ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight)

      // Draw label text
      ctx.fillStyle = "#000"
      ctx.fillText(label, x + 4, y - 4)

      // Draw centroid dot
      const cx = det.centroid_x * scaleX
      const cy = det.centroid_y * scaleY
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }, [detections, tracks, containerRef, videoWidth, videoHeight])

  // Resize handler
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
