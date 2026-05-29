import { useMemo } from "react"
import { Trash2 } from "lucide-react"
import { useAnnotationStore } from "@/stores/annotation-store"
import { useVideoStore } from "@/stores/video-store"
import { BEHAVIOR_COLORS, BEHAVIOR_LABELS } from "@/types"

function formatFrame(frame: number, fps: number): string {
  const totalSec = frame / Math.max(fps, 1)
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const cs = Math.floor((totalSec % 1) * 100)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`
}

export function AnnotationsTab() {
  const behaviors = useAnnotationStore((s) => s.behaviors)
  const tracks = useAnnotationStore((s) => s.tracks)
  const selectedTrackId = useAnnotationStore((s) => s.selectedTrackId)
  const selectTrack = useAnnotationStore((s) => s.selectTrack)
  const removeBehavior = useAnnotationStore((s) => s.removeBehavior)

  const seekToFrame = useVideoStore((s) => s.seekToFrame)
  const currentFrame = useVideoStore((s) => s.currentFrame)
  const fps = useVideoStore((s) => s.fps)

  const trackById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks]
  )

  const sorted = useMemo(
    () => [...behaviors].sort((a, b) => a.start_frame - b.start_frame),
    [behaviors]
  )

  if (behaviors.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-zinc-500">No annotations yet</p>
        <p className="text-[10px] text-zinc-600">
          Press <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono">I</kbd> to set
          an in-point, scrub forward, then{" "}
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono">O</kbd> +{" "}
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono">1–7</kbd> to commit.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-b border-zinc-800 px-3 py-2 text-[10px] uppercase tracking-wide text-zinc-500">
        {behaviors.length} segment{behaviors.length === 1 ? "" : "s"} ·{" "}
        sorted by start
      </div>
      <ol className="flex-1 overflow-auto">
        {sorted.map((seg) => {
          const track = trackById.get(seg.track_id)
          const isCurrent =
            currentFrame >= seg.start_frame && currentFrame <= seg.end_frame
          const color = BEHAVIOR_COLORS[seg.behavior] ?? "#888"
          const label = BEHAVIOR_LABELS[seg.behavior] ?? seg.behavior
          const dur = seg.end_frame - seg.start_frame + 1
          const isSelected = seg.track_id === selectedTrackId
          return (
            <li
              key={seg.id}
              className={[
                "group flex cursor-pointer items-center gap-2 border-b border-zinc-900 px-3 py-1.5 hover:bg-zinc-900/60",
                isCurrent ? "bg-zinc-900/80" : "",
              ].join(" ")}
              onClick={() => {
                selectTrack(seg.track_id)
                seekToFrame(seg.start_frame)
              }}
              title={`Seek to frame ${seg.start_frame} on ${track?.label ?? "track"}`}
            >
              <span
                className="block h-3 w-1 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span
                className={[
                  "w-14 shrink-0 truncate text-[10px]",
                  isSelected ? "text-zinc-200" : "text-zinc-500",
                ].join(" ")}
                style={{ color: isSelected ? track?.color : undefined }}
              >
                {track?.label ?? `T${seg.track_id}`}
              </span>
              <span className="w-20 shrink-0 truncate text-zinc-300">
                {label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                {formatFrame(seg.start_frame, fps)}–
                {formatFrame(seg.end_frame, fps)}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">
                {(dur / Math.max(fps, 1)).toFixed(1)}s
              </span>
              <button
                type="button"
                className="opacity-0 transition group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  removeBehavior(seg.id)
                }}
                title="Delete this segment"
                aria-label="Delete segment"
              >
                <Trash2 className="h-3 w-3 text-zinc-500 hover:text-rose-400" />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
