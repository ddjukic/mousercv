import type { BehaviorSegment, Track } from "@/types"
import { BEHAVIORS, BEHAVIOR_LABELS } from "@/types"

export const ANNOTATIONS_SCHEMA = "mousercv-annotations/v1"

/**
 * A single annotation segment enriched with derived/display fields, shared by
 * both the CSV and JSON exporters so the two stay in lockstep.
 */
export interface EnrichedSegment {
  id: number
  track_id: number
  track_label: string
  behavior: string
  behavior_label: string
  start_frame: number
  end_frame: number
  start_sec: number
  end_sec: number
  duration_frames: number
  duration_sec: number
  notes: string
  confidence: number | null
}

export interface AnnotationsExport {
  schema: typeof ANNOTATIONS_SCHEMA
  video_filename: string | null
  exported_at: string
  fps: number
  frame_count: number | null
  annotator: string
  behavior_legend: Record<string, string>
  segments: EnrichedSegment[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Strip the file extension from a video filename, falling back to "mousercv". */
export function videoStem(videoFilename: string | null): string {
  if (!videoFilename) return "mousercv"
  const stem = videoFilename.replace(/\.[^.]+$/, "")
  return stem.length > 0 ? stem : "mousercv"
}

/** Timestamp safe for use in filenames: 2026-05-29T12-30-00-000Z. */
export function fileTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

/** behavior_legend: { "<hotkey>": "<behavior label>" } built from BEHAVIORS. */
export function buildBehaviorLegend(): Record<string, string> {
  const legend: Record<string, string> = {}
  for (const behavior of BEHAVIORS) {
    legend[behavior.hotkey] = behavior.label
  }
  return legend
}

/**
 * Enrich raw store segments with track labels and derived timing fields. Used
 * by both the CSV and JSON exporters.
 */
export function enrichSegments(
  segments: BehaviorSegment[],
  tracks: Track[],
  fps: number
): EnrichedSegment[] {
  const trackById = new Map(tracks.map((t) => [t.id, t]))
  const safeFps = Math.max(fps, 1)

  return segments.map((b) => {
    const track = trackById.get(b.track_id)
    const durationFrames = b.end_frame - b.start_frame + 1
    return {
      id: b.id,
      track_id: b.track_id,
      track_label: track?.label ?? "",
      behavior: b.behavior,
      behavior_label: BEHAVIOR_LABELS[b.behavior] ?? b.behavior,
      start_frame: b.start_frame,
      end_frame: b.end_frame,
      start_sec: round2(b.start_frame / safeFps),
      end_sec: round2(b.end_frame / safeFps),
      duration_frames: durationFrames,
      duration_sec: round2(durationFrames / safeFps),
      notes: b.notes ?? "",
      confidence: b.confidence ?? null,
    }
  })
}

export interface BuildExportArgs {
  segments: BehaviorSegment[]
  tracks: Track[]
  fps: number
  videoFilename: string | null
  duration: number | null
  annotator: string
  exportedAt?: Date
}

/** Build the full timestamped JSON export object. */
export function buildAnnotationsExport({
  segments,
  tracks,
  fps,
  videoFilename,
  duration,
  annotator,
  exportedAt = new Date(),
}: BuildExportArgs): AnnotationsExport {
  const frameCount =
    duration !== null && Number.isFinite(duration)
      ? Math.floor(duration * fps)
      : null

  return {
    schema: ANNOTATIONS_SCHEMA,
    video_filename: videoFilename ?? null,
    exported_at: exportedAt.toISOString(),
    fps,
    frame_count: frameCount,
    annotator,
    behavior_legend: buildBehaviorLegend(),
    segments: enrichSegments(segments, tracks, fps),
  }
}

/** Stable, pretty-printed JSON string for download / upload. */
export function serializeAnnotationsExport(data: AnnotationsExport): string {
  return JSON.stringify(data, null, 2)
}

/** Trigger a browser download of a JSON blob (mirrors the CSV export pattern). */
export function downloadJson(jsonString: string, filename: string): void {
  const blob = new Blob([jsonString], {
    type: "application/json;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
