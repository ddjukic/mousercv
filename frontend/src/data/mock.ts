import type {
  Track,
  Detection,
  BehaviorSegment,
  AnalyticsData,
  Keyframe,
  Project,
  Video,
} from "@/types"

export const MOCK_PROJECT: Project = {
  id: 1,
  name: "Anxiety Model Study",
  description: "Open field test - C57BL/6 mice cohort A",
  created_at: "2026-03-20T10:00:00Z",
}

export const MOCK_VIDEO: Video = {
  id: 1,
  project_id: 1,
  filename: "trial_001_cam1.mp4",
  status: "processed",
  duration_sec: 300,
  fps: 30,
  width: 1280,
  height: 720,
}

export const MOCK_TRACKS: Track[] = [
  { id: 1, video_id: 1, label: "Mouse 1", color: "#3b82f6", is_active: true },
  { id: 2, video_id: 1, label: "Mouse 2", color: "#ef4444", is_active: true },
]

function generateDetections(): Record<number, Detection[]> {
  const detections: Record<number, Detection[]> = {}
  const totalFrames = 500

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / totalFrames

    // Mouse 1: moves in a roughly circular pattern
    const cx1 = 320 + Math.cos(t * Math.PI * 4) * 200 + Math.sin(t * 7) * 30
    const cy1 = 360 + Math.sin(t * Math.PI * 4) * 150 + Math.cos(t * 5) * 20
    const halfW1 = 40
    const halfH1 = 30

    // Mouse 2: more erratic movement
    const cx2 = 900 + Math.sin(t * Math.PI * 6) * 150 + Math.cos(t * 11) * 40
    const cy2 = 360 + Math.cos(t * Math.PI * 3) * 180 + Math.sin(t * 9) * 25
    const halfW2 = 38
    const halfH2 = 28

    detections[frame] = [
      {
        id: frame * 2 + 1,
        track_id: 1,
        frame_number: frame,
        x1: cx1 - halfW1,
        y1: cy1 - halfH1,
        x2: cx1 + halfW1,
        y2: cy1 + halfH1,
        confidence: 0.92 + Math.random() * 0.07,
        centroid_x: cx1,
        centroid_y: cy1,
      },
      {
        id: frame * 2 + 2,
        track_id: 2,
        frame_number: frame,
        x1: cx2 - halfW2,
        y1: cy2 - halfH2,
        x2: cx2 + halfW2,
        y2: cy2 + halfH2,
        confidence: 0.88 + Math.random() * 0.1,
        centroid_x: cx2,
        centroid_y: cy2,
      },
    ]
  }

  return detections
}

export const MOCK_DETECTIONS = generateDetections()

export const MOCK_BEHAVIORS: BehaviorSegment[] = [
  // Mouse 1 behaviors
  { id: 1, track_id: 1, start_frame: 0, end_frame: 45, behavior: "idle" },
  { id: 2, track_id: 1, start_frame: 46, end_frame: 90, behavior: "grooming" },
  { id: 3, track_id: 1, start_frame: 91, end_frame: 140, behavior: "rearing" },
  { id: 4, track_id: 1, start_frame: 141, end_frame: 200, behavior: "idle" },
  {
    id: 5,
    track_id: 1,
    start_frame: 201,
    end_frame: 260,
    behavior: "scratching",
  },
  {
    id: 6,
    track_id: 1,
    start_frame: 261,
    end_frame: 320,
    behavior: "grooming",
  },
  { id: 7, track_id: 1, start_frame: 321, end_frame: 380, behavior: "idle" },
  {
    id: 8,
    track_id: 1,
    start_frame: 381,
    end_frame: 430,
    behavior: "rearing",
  },
  { id: 9, track_id: 1, start_frame: 431, end_frame: 500, behavior: "idle" },

  // Mouse 2 behaviors
  {
    id: 10,
    track_id: 2,
    start_frame: 0,
    end_frame: 60,
    behavior: "grooming",
  },
  { id: 11, track_id: 2, start_frame: 61, end_frame: 120, behavior: "idle" },
  {
    id: 12,
    track_id: 2,
    start_frame: 121,
    end_frame: 180,
    behavior: "scratching",
  },
  {
    id: 13,
    track_id: 2,
    start_frame: 181,
    end_frame: 250,
    behavior: "rearing",
  },
  { id: 14, track_id: 2, start_frame: 251, end_frame: 310, behavior: "idle" },
  {
    id: 15,
    track_id: 2,
    start_frame: 311,
    end_frame: 370,
    behavior: "grooming",
  },
  {
    id: 16,
    track_id: 2,
    start_frame: 371,
    end_frame: 420,
    behavior: "scratching",
  },
  { id: 17, track_id: 2, start_frame: 421, end_frame: 500, behavior: "idle" },
]

function generateHeatmap(): number[][] {
  const grid: number[][] = []
  const size = 20
  for (let y = 0; y < size; y++) {
    const row: number[] = []
    for (let x = 0; x < size; x++) {
      // Create a hotspot pattern: higher values near center and edges
      const dx = x - size / 2
      const dy = y - size / 2
      const distCenter = Math.sqrt(dx * dx + dy * dy) / (size / 2)
      const distEdge = Math.min(x, y, size - 1 - x, size - 1 - y) / (size / 2)
      const val =
        Math.max(0, 1 - distCenter * 0.7) * 0.6 +
        Math.max(0, 1 - distEdge * 2) * 0.3 +
        Math.random() * 0.1
      row.push(Math.min(1, val))
    }
    grid.push(row)
  }
  return grid
}

export const MOCK_ANALYTICS: AnalyticsData = {
  behavior_counts: {
    "Mouse 1": { grooming: 2, scratching: 1, rearing: 2, idle: 4 },
    "Mouse 2": { grooming: 2, scratching: 2, rearing: 1, idle: 3 },
  },
  behavior_durations: {
    "Mouse 1": {
      grooming: 3.67,
      scratching: 2.0,
      rearing: 3.3,
      idle: 7.7,
    },
    "Mouse 2": {
      grooming: 3.97,
      scratching: 3.3,
      rearing: 2.33,
      idle: 7.0,
    },
  },
  movement_stats: {
    "Mouse 1": {
      total_distance: 4823.5,
      time_moving_sec: 11.2,
      time_idle_sec: 5.47,
      movement_bouts: 14,
      mean_bout_duration: 0.8,
      erratic_index: 0.32,
    },
    "Mouse 2": {
      total_distance: 5612.8,
      time_moving_sec: 12.8,
      time_idle_sec: 3.87,
      movement_bouts: 18,
      mean_bout_duration: 0.71,
      erratic_index: 0.47,
    },
  },
  heatmap_data: {
    "Mouse 1": generateHeatmap(),
    "Mouse 2": generateHeatmap(),
  },
  timeline_data: [],
}

// Make timeline_data reference the same behaviors
MOCK_ANALYTICS.timeline_data = MOCK_BEHAVIORS

export const MOCK_KEYFRAMES: Keyframe[] = [
  { id: 1, track_id: 1, frame_number: 0, label: "Start" },
  { id: 2, track_id: 1, frame_number: 46, label: "Grooming onset" },
  { id: 3, track_id: 1, frame_number: 201, label: "Scratching onset" },
  { id: 4, track_id: 2, frame_number: 121, label: "Scratching onset" },
  { id: 5, track_id: 2, frame_number: 181, label: "Rearing onset" },
]
