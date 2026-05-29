import { useAnnotationStore } from "@/stores/annotation-store"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { BEHAVIORS, BEHAVIOR_COLORS, BEHAVIOR_LABELS } from "@/types"

export function StatisticsTab() {
  const analytics = useAnnotationStore((s) => s.analytics)
  const tracks = useAnnotationStore((s) => s.tracks)

  if (!analytics) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-zinc-500">No statistics data</span>
      </div>
    )
  }

  // Aggregate totals
  const allStats = Object.values(analytics.movement_stats)
  const totalDistance = allStats.reduce((s, v) => s + v.total_distance, 0)
  const totalMoving = allStats.reduce((s, v) => s + v.time_moving_sec, 0)
  const totalIdle = allStats.reduce((s, v) => s + v.time_idle_sec, 0)
  const totalDuration = totalMoving + totalIdle
  const avgErratic =
    allStats.reduce((s, v) => s + v.erratic_index, 0) / allStats.length

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard
            label="Total Duration"
            value={`${totalDuration.toFixed(1)}s`}
            sublabel={`${(totalDuration / 60).toFixed(1)} min`}
          />
          <SummaryCard
            label="Total Distance"
            value={`${totalDistance.toFixed(0)} px`}
            sublabel={`${tracks.length} tracks`}
          />
          <SummaryCard
            label="Moving Time"
            value={`${totalMoving.toFixed(1)}s`}
            sublabel={`${((totalMoving / totalDuration) * 100).toFixed(0)}%`}
          />
          <SummaryCard
            label="Idle Time"
            value={`${totalIdle.toFixed(1)}s`}
            sublabel={`${((totalIdle / totalDuration) * 100).toFixed(0)}%`}
          />
        </div>

        {/* Erratic behavior index */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] uppercase text-zinc-600">
                  Erratic Behavior Index
                </div>
                <div className="font-mono text-lg text-zinc-100">
                  {avgErratic.toFixed(3)}
                </div>
              </div>
              <Badge
                variant="outline"
                className={`border-zinc-700 font-mono text-[10px] ${
                  avgErratic > 0.4
                    ? "text-orange-400"
                    : avgErratic > 0.2
                      ? "text-yellow-400"
                      : "text-green-400"
                }`}
              >
                {avgErratic > 0.4
                  ? "High"
                  : avgErratic > 0.2
                    ? "Moderate"
                    : "Low"}
              </Badge>
            </div>
            {/* Mini bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, avgErratic * 100)}%`,
                  backgroundColor:
                    avgErratic > 0.4
                      ? "#f97316"
                      : avgErratic > 0.2
                        ? "#eab308"
                        : "#22c55e",
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Separator className="bg-zinc-800" />

        {/* Behavior duration table */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Behavior Duration Breakdown
          </h4>
          <div className="rounded-md border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-2 py-1.5 text-left text-[9px] font-medium uppercase text-zinc-500">
                    Behavior
                  </th>
                  {Object.keys(analytics.behavior_durations).map((label) => (
                    <th
                      key={label}
                      className="px-2 py-1.5 text-right text-[9px] font-medium uppercase text-zinc-500"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BEHAVIORS.map(({ name: behavior }) => (
                  <tr
                    key={behavior}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2 w-2 rounded-sm"
                          style={{
                            backgroundColor: BEHAVIOR_COLORS[behavior],
                          }}
                        />
                        <span className="text-xs text-zinc-300">
                          {BEHAVIOR_LABELS[behavior]}
                        </span>
                      </div>
                    </td>
                    {Object.entries(analytics.behavior_durations).map(
                      ([label, durations]) => (
                        <td
                          key={label}
                          className="px-2 py-1.5 text-right font-mono text-xs text-zinc-400"
                        >
                          {(durations[behavior] ?? 0).toFixed(1)}s
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Per-track movement breakdown */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Per-Track Movement
          </h4>
          {Object.entries(analytics.movement_stats).map(
            ([trackLabel, stats]) => {
              const track = tracks.find((t) => t.label === trackLabel)
              return (
                <Card
                  key={trackLabel}
                  className="border-zinc-800 bg-zinc-900/50"
                >
                  <CardContent className="p-2.5">
                    <div className="mb-1.5 flex items-center gap-2">
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
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <StatRow
                        label="Total distance"
                        value={`${stats.total_distance.toFixed(0)} px`}
                      />
                      <StatRow
                        label="Time moving"
                        value={`${stats.time_moving_sec.toFixed(1)}s`}
                      />
                      <StatRow
                        label="Time idle"
                        value={`${stats.time_idle_sec.toFixed(1)}s`}
                      />
                      <StatRow
                        label="Movement bouts"
                        value={stats.movement_bouts.toString()}
                      />
                      <StatRow
                        label="Mean bout dur."
                        value={`${stats.mean_bout_duration.toFixed(2)}s`}
                      />
                      <StatRow
                        label="Erratic index"
                        value={stats.erratic_index.toFixed(3)}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            }
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string
  value: string
  sublabel: string
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardContent className="p-2.5">
        <div className="text-[9px] uppercase text-zinc-600">{label}</div>
        <div className="font-mono text-sm text-zinc-100">{value}</div>
        <div className="font-mono text-[9px] text-zinc-600">{sublabel}</div>
      </CardContent>
    </Card>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="font-mono text-[10px] text-zinc-300">{value}</span>
    </div>
  )
}
