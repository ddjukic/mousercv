export interface Project {
  id: number
  name: string
  description?: string
  created_at: string
}

export interface Video {
  id: number
  project_id: number
  filename: string
  status: string
  duration_sec: number
  fps: number
  width: number
  height: number
}

export interface Track {
  id: number
  video_id: number
  label: string
  color: string
  is_active: boolean
}

export interface Detection {
  id: number
  track_id: number
  frame_number: number
  x1: number
  y1: number
  x2: number
  y2: number
  confidence: number
  centroid_x: number
  centroid_y: number
}

export interface BehaviorSegment {
  id: number
  track_id: number
  start_frame: number
  end_frame: number
  behavior: BehaviorType
  notes?: string
  confidence?: number
}

export interface Keyframe {
  id: number
  track_id: number
  frame_number: number
  label: string
  thumbnail_path?: string
}

export interface AnalyticsData {
  behavior_counts: Record<string, Record<string, number>>
  behavior_durations: Record<string, Record<string, number>>
  movement_stats: Record<
    string,
    {
      total_distance: number
      time_moving_sec: number
      time_idle_sec: number
      movement_bouts: number
      mean_bout_duration: number
      erratic_index: number
    }
  >
  heatmap_data: Record<string, number[][]>
  timeline_data: BehaviorSegment[]
}

export const BEHAVIORS = [
  { name: "grooming", label: "Grooming", color: "#22c55e", hotkey: "1" },
  { name: "scratching", label: "Scratching", color: "#f97316", hotkey: "2" },
  { name: "rearing", label: "Rearing", color: "#a855f7", hotkey: "3" },
  { name: "idle", label: "Idle", color: "#6b7280", hotkey: "4" },
  { name: "uncertain", label: "Uncertain", color: "#fbbf24", hotkey: "5" },
  {
    name: "hypergrooming",
    label: "Hypergrooming",
    color: "#14b8a6",
    hotkey: "6",
  },
  { name: "head_shake", label: "Head shake", color: "#ec4899", hotkey: "7" },
] as const

export type BehaviorType = (typeof BEHAVIORS)[number]["name"]

export const BEHAVIOR_COLORS = Object.fromEntries(
  BEHAVIORS.map((behavior) => [behavior.name, behavior.color])
) as Record<BehaviorType, string>

export const BEHAVIOR_LABELS = Object.fromEntries(
  BEHAVIORS.map((behavior) => [behavior.name, behavior.label])
) as Record<BehaviorType, string>

export const BEHAVIOR_HOTKEYS = Object.fromEntries(
  BEHAVIORS.map((behavior) => [behavior.hotkey, behavior.name])
) as Record<(typeof BEHAVIORS)[number]["hotkey"], BehaviorType>
