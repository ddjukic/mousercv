import { useRef, useEffect, useCallback } from "react"
import { useAnnotationStore } from "@/stores/annotation-store"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export function TrackingTab() {
  const analytics = useAnnotationStore((s) => s.analytics)
  const detections = useAnnotationStore((s) => s.detections)
  const tracks = useAnnotationStore((s) => s.tracks)

  if (!analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-zinc-500">No tracking data</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Movement path visualization */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Movement Paths
          </h4>
          <TrajectoryCanvas detections={detections} tracks={tracks} />
        </div>

        {/* Movement stats cards */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Movement Statistics
          </h4>
          <div className="space-y-2">
            {Object.entries(analytics.movement_stats).map(
              ([trackLabel, stats]) => {
                const track = tracks.find((t) => t.label === trackLabel)
                return (
                  <Card
                    key={trackLabel}
                    className="border-zinc-800 bg-zinc-900/50"
                  >
                    <CardContent className="p-2.5">
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: track?.color ?? "#71717a",
                          }}
                        />
                        <span className="text-xs font-medium text-zinc-300">
                          {trackLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCell
                          label="Distance"
                          value={`${stats.total_distance.toFixed(0)} px`}
                        />
                        <StatCell
                          label="Avg Speed"
                          value={`${(stats.total_distance / (stats.time_moving_sec || 1)).toFixed(0)} px/s`}
                        />
                        <StatCell
                          label="Bouts"
                          value={stats.movement_bouts.toString()}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              }
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase text-zinc-600">{label}</div>
      <div className="font-mono text-xs text-zinc-200">{value}</div>
    </div>
  )
}

function TrajectoryCanvas({
  detections,
  tracks,
}: {
  detections: Record<number, import("@/types").Detection[]>
  tracks: import("@/types").Track[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    // Draw arena
    ctx.strokeStyle = "rgba(63, 63, 70, 0.4)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 4, 0, Math.PI * 2)
    ctx.stroke()

    // Group centroids by track
    const trajectories: Record<number, { x: number; y: number }[]> = {}

    const frames = Object.keys(detections)
      .map(Number)
      .sort((a, b) => a - b)

    for (const frame of frames) {
      const dets = detections[frame]
      if (!dets) continue
      for (const det of dets) {
        if (!trajectories[det.track_id]) {
          trajectories[det.track_id] = []
        }
        trajectories[det.track_id].push({
          x: det.centroid_x,
          y: det.centroid_y,
        })
      }
    }

    // Scale to canvas
    const videoW = 1280
    const videoH = 720
    const scaleX = w / videoW
    const scaleY = h / videoH

    for (const [trackIdStr, points] of Object.entries(trajectories)) {
      const trackId = parseInt(trackIdStr)
      const track = tracks.find((t) => t.id === trackId)
      if (!track || points.length < 2) continue

      ctx.strokeStyle = track.color
      ctx.lineWidth = 0.8
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY)

      // Sample every N points to avoid overloading
      const step = Math.max(1, Math.floor(points.length / 200))
      for (let i = step; i < points.length; i += step) {
        ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY)
      }
      ctx.stroke()
      ctx.globalAlpha = 1

      // Start marker
      ctx.fillStyle = track.color
      ctx.beginPath()
      ctx.arc(points[0].x * scaleX, points[0].y * scaleY, 3, 0, Math.PI * 2)
      ctx.fill()

      // End marker
      const last = points[points.length - 1]
      ctx.strokeStyle = track.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(last.x * scaleX, last.y * scaleY, 3, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [detections, tracks])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={160}
      className="w-full rounded-md border border-zinc-800 bg-zinc-950"
    />
  )
}
