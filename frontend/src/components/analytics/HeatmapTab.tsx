import { useRef, useEffect, useCallback } from "react"
import { useAnnotationStore } from "@/stores/annotation-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"

export function HeatmapTab() {
  const analytics = useAnnotationStore((s) => s.analytics)
  const tracks = useAnnotationStore((s) => s.tracks)
  const [selectedTrack, setSelectedTrack] = useState<string>("all")

  if (!analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-zinc-500">No heatmap data</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        {/* Track selector */}
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Occupancy Heatmap
          </h4>
          <Select value={selectedTrack} onValueChange={setSelectedTrack}>
            <SelectTrigger className="h-6 w-28 border-zinc-800 bg-zinc-900 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Tracks
              </SelectItem>
              {tracks.map((track) => (
                <SelectItem
                  key={track.id}
                  value={track.label}
                  className="text-xs"
                >
                  {track.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Full heatmap */}
        <FullHeatmap
          data={analytics.heatmap_data}
          selectedTrack={selectedTrack}
        />

        {/* Legend */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-[9px] text-zinc-600">Low occupancy</span>
          <div
            className="h-3 w-32 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #0f172a, #1e3a5f, #2563eb, #22c55e, #eab308, #ef4444)",
            }}
          />
          <span className="text-[9px] text-zinc-600">High occupancy</span>
        </div>

        {/* Statistics */}
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2">
          <div className="text-[10px] text-zinc-500">
            Grid resolution: 20 x 20 cells
          </div>
          <div className="text-[10px] text-zinc-500">
            Video dimensions: 1280 x 720 px
          </div>
          <div className="text-[10px] text-zinc-500">
            Cell size: 64 x 36 px
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

function FullHeatmap({
  data,
  selectedTrack,
}: {
  data: Record<string, number[][]>
  selectedTrack: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const grids =
      selectedTrack === "all"
        ? Object.values(data)
        : data[selectedTrack]
          ? [data[selectedTrack]]
          : []

    if (grids.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const gridSize = grids[0].length
    const combined: number[][] = Array.from({ length: gridSize }, () =>
      Array(gridSize).fill(0) as number[]
    )

    for (const grid of grids) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          combined[y][x] += grid[y][x]
        }
      }
    }

    let max = 0
    for (const row of combined) {
      for (const val of row) {
        if (val > max) max = val
      }
    }

    const size = canvas.width
    const cellSize = size / gridSize

    // Background
    ctx.fillStyle = "#09090b"
    ctx.fillRect(0, 0, size, size)

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const val = max > 0 ? combined[y][x] / max : 0
        ctx.fillStyle = heatmapColor(val)
        ctx.fillRect(
          x * cellSize,
          y * cellSize,
          cellSize + 0.5,
          cellSize + 0.5
        )
      }
    }

    // Arena outline
    ctx.strokeStyle = "rgba(161, 161, 170, 0.4)"
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Grid lines
    ctx.strokeStyle = "rgba(63, 63, 70, 0.15)"
    ctx.lineWidth = 0.5
    for (let i = 0; i <= gridSize; i++) {
      const pos = i * cellSize
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(size, pos)
      ctx.stroke()
    }
  }, [data, selectedTrack])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        width={240}
        height={240}
        className="rounded-md border border-zinc-800"
      />
    </div>
  )
}

function heatmapColor(value: number): string {
  const stops = [
    { pos: 0, r: 15, g: 23, b: 42 },
    { pos: 0.2, r: 30, g: 58, b: 95 },
    { pos: 0.4, r: 37, g: 99, b: 235 },
    { pos: 0.6, r: 34, g: 197, b: 94 },
    { pos: 0.8, r: 234, g: 179, b: 8 },
    { pos: 1, r: 239, g: 68, b: 68 },
  ]

  let lower = stops[0]
  let upper = stops[stops.length - 1]

  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].pos && value <= stops[i + 1].pos) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }

  const range = upper.pos - lower.pos
  const t = range > 0 ? (value - lower.pos) / range : 0

  const r = Math.round(lower.r + (upper.r - lower.r) * t)
  const g = Math.round(lower.g + (upper.g - lower.g) * t)
  const b = Math.round(lower.b + (upper.b - lower.b) * t)

  return `rgb(${r}, ${g}, ${b})`
}
