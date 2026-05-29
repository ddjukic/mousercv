import { useRef, useEffect, useCallback } from "react"
import { useAnnotationStore } from "@/stores/annotation-store"
import { BEHAVIORS, BEHAVIOR_LABELS } from "@/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

export function OverviewTab() {
  const analytics = useAnnotationStore((s) => s.analytics)

  if (!analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-zinc-500">No analytics data</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Spatial Occupancy Heatmap */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Spatial Occupancy
          </h4>
          <OccupancyHeatmap data={analytics.heatmap_data} />
        </div>

        {/* Behavior Counts Bar Chart */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Behavior Counts
          </h4>
          <BehaviorCountsChart data={analytics.behavior_counts} />
        </div>
      </div>
    </ScrollArea>
  )
}

function OccupancyHeatmap({
  data,
}: {
  data: Record<string, number[][]>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Combine heatmaps
    const allGrids = Object.values(data)
    if (allGrids.length === 0) return

    const gridSize = allGrids[0].length
    const combined: number[][] = Array.from({ length: gridSize }, () =>
      Array(gridSize).fill(0) as number[]
    )

    for (const grid of allGrids) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          combined[y][x] += grid[y][x]
        }
      }
    }

    // Normalize
    let max = 0
    for (const row of combined) {
      for (const val of row) {
        if (val > max) max = val
      }
    }

    const size = canvas.width
    const cellSize = size / gridSize

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const val = max > 0 ? combined[y][x] / max : 0
        ctx.fillStyle = heatmapColor(val)
        ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5)
      }
    }

    // Draw arena circle outline
    ctx.strokeStyle = "rgba(161, 161, 170, 0.3)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.stroke()
  }, [data])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={180}
        height={180}
        className="rounded-md border border-zinc-800"
      />
      {/* Legend */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-zinc-600">Low</span>
        <div
          className="h-2 w-24 rounded-sm"
          style={{
            background:
              "linear-gradient(to right, #1e3a5f, #2563eb, #22c55e, #eab308, #ef4444)",
          }}
        />
        <span className="text-[9px] text-zinc-600">High</span>
      </div>
    </div>
  )
}

function heatmapColor(value: number): string {
  // Blue -> Cyan -> Green -> Yellow -> Red
  const stops = [
    { pos: 0, r: 30, g: 58, b: 95 },
    { pos: 0.25, r: 37, g: 99, b: 235 },
    { pos: 0.5, r: 34, g: 197, b: 94 },
    { pos: 0.75, r: 234, g: 179, b: 8 },
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

function BehaviorCountsChart({
  data,
}: {
  data: Record<string, Record<string, number>>
}) {
  const chartData = BEHAVIORS.map(({ name: b }) => {
    const entry: Record<string, string | number> = {
      behavior: BEHAVIOR_LABELS[b],
    }
    for (const [trackLabel, counts] of Object.entries(data)) {
      entry[trackLabel] = counts[b] ?? 0
    }
    return entry
  })

  const trackLabels = Object.keys(data)
  const trackColors = ["#3b82f6", "#ef4444"]

  const chartConfig: ChartConfig = {}
  trackLabels.forEach((label, i) => {
    chartConfig[label] = {
      label,
      color: trackColors[i] ?? "#71717a",
    }
  })

  return (
    <ChartContainer config={chartConfig} className="h-40 w-full">
      <BarChart data={chartData} barGap={2}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="rgba(63, 63, 70, 0.5)"
        />
        <XAxis
          dataKey="behavior"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "#71717a" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 9, fill: "#52525b" }}
          width={24}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {trackLabels.map((label, i) => (
          <Bar
            key={label}
            dataKey={label}
            fill={trackColors[i] ?? "#71717a"}
            radius={[2, 2, 0, 0]}
            barSize={16}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
