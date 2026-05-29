import type { Project, Video, Track, Detection, AnalyticsData } from "@/types"

const BASE_URL = "/api"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  // Projects
  getProjects: () => request<Project[]>("/projects"),
  getProject: (id: number) => request<Project>(`/projects/${id}`),

  // Videos
  getVideos: (projectId: number) =>
    request<Video[]>(`/projects/${projectId}/videos`),
  getVideo: (id: number) => request<Video>(`/videos/${id}`),

  // Tracks
  getTracks: (videoId: number) => request<Track[]>(`/videos/${videoId}/tracks`),

  // Detections
  getDetections: (videoId: number, frame?: number) => {
    const params = frame !== undefined ? `?frame=${frame}` : ""
    return request<Detection[]>(`/videos/${videoId}/detections${params}`)
  },

  // Analytics
  getAnalytics: (videoId: number) =>
    request<AnalyticsData>(`/videos/${videoId}/analytics`),

  // Video stream URL (not a fetch, just URL builder)
  getVideoStreamUrl: (videoId: number) => `${BASE_URL}/videos/${videoId}/stream`,

  // GCS Sync
  syncGcs: () =>
    request<{ videos_added: number; videos_updated: number; errors: string[] }>(
      "/sync/gcs",
      { method: "POST" }
    ),

  // Export
  exportVideo: (videoId: number) =>
    request<Record<string, unknown>>(`/videos/${videoId}/export`),
}
