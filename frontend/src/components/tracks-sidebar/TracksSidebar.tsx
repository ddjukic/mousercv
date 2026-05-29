import { useAnnotationStore } from "@/stores/annotation-store"
import { useVideoStore } from "@/stores/video-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, EyeOff, Trash2, Edit, Play, Keyboard } from "lucide-react"
import { BEHAVIORS, BEHAVIOR_COLORS, BEHAVIOR_LABELS } from "@/types"
import { useState } from "react"

export function TracksSidebar() {
  const tracks = useAnnotationStore((s) => s.tracks)
  const behaviors = useAnnotationStore((s) => s.behaviors)
  const keyframes = useAnnotationStore((s) => s.keyframes)
  const selectedTrackId = useAnnotationStore((s) => s.selectedTrackId)
  const selectTrack = useAnnotationStore((s) => s.selectTrack)

  const currentFrame = useVideoStore((s) => s.currentFrame)
  const fps = useVideoStore((s) => s.fps)

  const [showShortcuts, setShowShortcuts] = useState(false)

  // Find current behavior for selected track
  const currentBehavior = behaviors.find(
    (b) =>
      b.track_id === selectedTrackId &&
      currentFrame >= b.start_frame &&
      currentFrame <= b.end_frame
  )

  // Get keyframes for selected track
  const trackKeyframes = keyframes.filter(
    (kf) => kf.track_id === selectedTrackId
  )

  // Calculate velocity for current frame
  const getVelocity = () => {
    const detections = useAnnotationStore.getState().detections
    const prevFrame = detections[currentFrame - 1]
    const currFrame = detections[currentFrame]

    if (!prevFrame || !currFrame || !selectedTrackId) return 0

    const prev = prevFrame.find((d) => d.track_id === selectedTrackId)
    const curr = currFrame.find((d) => d.track_id === selectedTrackId)

    if (!prev || !curr) return 0

    const dx = curr.centroid_x - prev.centroid_x
    const dy = curr.centroid_y - prev.centroid_y
    return Math.sqrt(dx * dx + dy * dy) * fps
  }

  const velocity = getVelocity()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-medium text-zinc-300">
          Tracks & Annotations
        </h3>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {tracks.length} tracks
          </Badge>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2 space-y-2">
          {/* Track list */}
          <div className="space-y-1">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors ${
                  selectedTrackId === track.id
                    ? "bg-zinc-800/80"
                    : "hover:bg-zinc-800/40"
                }`}
                onClick={() => selectTrack(track.id)}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: track.color }}
                  />
                  <span className="text-xs text-zinc-200">{track.label}</span>
                  {track.is_active && (
                    <Badge
                      variant="outline"
                      className="h-4 border-zinc-700 px-1 font-mono text-[9px] text-zinc-500"
                    >
                      LIVE
                    </Badge>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem className="text-xs">
                      <Edit className="mr-2 h-3 w-3" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">
                      {track.is_active ? (
                        <>
                          <EyeOff className="mr-2 h-3 w-3" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="mr-2 h-3 w-3" />
                          Show
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs text-destructive">
                      <Trash2 className="mr-2 h-3 w-3" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          <Separator className="bg-zinc-800" />

          {/* Action buttons row */}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 gap-1 border-zinc-700 text-[10px] text-zinc-400"
            >
              <Play className="h-3 w-3" />
              Process
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-zinc-700 text-[10px] text-zinc-400"
              onClick={() => setShowShortcuts(!showShortcuts)}
            >
              <Keyboard className="h-3 w-3" />
            </Button>
          </div>

          {showShortcuts && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2 space-y-1 text-[10px] text-zinc-500">
              <div className="flex justify-between"><span>Play/Pause</span><kbd className="rounded bg-zinc-800 px-1 font-mono">Space</kbd></div>
              <div className="flex justify-between"><span>Frame step</span><kbd className="rounded bg-zinc-800 px-1 font-mono">Left/Right</kbd></div>
              {BEHAVIORS.map((behavior) => (
                <div key={behavior.name} className="flex justify-between">
                  <span>{behavior.label}</span>
                  <kbd className="rounded bg-zinc-800 px-1 font-mono">
                    {behavior.hotkey}
                  </kbd>
                </div>
              ))}
            </div>
          )}

          <Separator className="bg-zinc-800" />

          {/* Annotation tools */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Annotation Tools
            </h4>

            {/* Selected track selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500">Active Track</label>
              <Select
                value={selectedTrackId?.toString() ?? ""}
                onValueChange={(v) => selectTrack(parseInt(v))}
              >
                <SelectTrigger className="h-7 border-zinc-800 bg-zinc-900 text-xs">
                  <SelectValue placeholder="Select track" />
                </SelectTrigger>
                <SelectContent>
                  {tracks.map((track) => (
                    <SelectItem
                      key={track.id}
                      value={track.id.toString()}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: track.color }}
                        />
                        {track.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current state */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                <div className="text-[9px] uppercase text-zinc-600">Velocity</div>
                <div className="font-mono text-xs text-zinc-200">
                  {velocity.toFixed(1)} px/s
                </div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                <div className="text-[9px] uppercase text-zinc-600">Behavior</div>
                <div className="flex items-center gap-1">
                  {currentBehavior && (
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: BEHAVIOR_COLORS[currentBehavior.behavior],
                      }}
                    />
                  )}
                  <span className="font-mono text-xs text-zinc-200">
                    {currentBehavior
                      ? BEHAVIOR_LABELS[currentBehavior.behavior]
                      : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* Key frames */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-500">Key Frames</label>
                <Badge variant="secondary" className="font-mono text-[9px]">
                  {trackKeyframes.length}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {trackKeyframes.length === 0 && (
                  <p className="text-[10px] text-zinc-600">No keyframes</p>
                )}
                {trackKeyframes.map((kf) => (
                  <button
                    key={kf.id}
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left transition-colors hover:bg-zinc-800/60"
                    onClick={() =>
                      useVideoStore.getState().seekToFrame(kf.frame_number)
                    }
                  >
                    <span className="text-[10px] text-zinc-300">{kf.label}</span>
                    <span className="font-mono text-[9px] text-zinc-600">
                      F:{kf.frame_number}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Behavior shortcuts inline */}
            <div className="grid grid-cols-2 gap-1">
              {BEHAVIORS.map((behavior) => (
                <div
                  key={behavior.name}
                  className="flex items-center gap-1.5 rounded border border-zinc-800 px-1.5 py-1"
                >
                  <kbd className="flex h-4 w-4 items-center justify-center rounded bg-zinc-800 font-mono text-[9px] text-zinc-400">
                    {behavior.hotkey}
                  </kbd>
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: behavior.color }}
                  />
                  <span className="text-[10px] text-zinc-400">
                    {behavior.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
