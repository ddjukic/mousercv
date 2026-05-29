import { create } from "zustand"
import { MOCK_VIDEO } from "@/data/mock"

interface VideoState {
  currentTime: number
  duration: number
  fps: number
  isPlaying: boolean
  playbackRate: number
  currentFrame: number
  videoUrl: string | null
  videoId: number | null
  videoFilename: string | null
  totalFrames: number

  setCurrentTime: (t: number) => void
  setPlaying: (p: boolean) => void
  togglePlaying: () => void
  setPlaybackRate: (r: number) => void
  setFps: (fps: number) => void
  setDurationFromMetadata: (durationSec: number) => void
  loadVideo: (id: number) => void
  loadLocalFile: (file: File) => void
  loadRemoteUrl: (url: string, filename: string) => void
  stepFrame: (delta: number) => void
  seekToFrame: (frame: number) => void
}

function revokeBlobUrl(url: string | null) {
  if (!url?.startsWith("blob:")) return

  try {
    URL.revokeObjectURL(url)
  } catch {
    // best-effort revoke; safe to ignore
  }
}

export const useVideoStore = create<VideoState>((set, get) => ({
  currentTime: 0,
  duration: MOCK_VIDEO.duration_sec,
  fps: MOCK_VIDEO.fps,
  isPlaying: false,
  playbackRate: 1,
  currentFrame: 0,
  videoUrl: null,
  videoId: MOCK_VIDEO.id,
  videoFilename: null,
  totalFrames: Math.floor(MOCK_VIDEO.duration_sec * MOCK_VIDEO.fps),

  setCurrentTime: (t: number) => {
    const { fps } = get()
    set({
      currentTime: t,
      currentFrame: Math.floor(t * fps),
    })
  },

  setPlaying: (p: boolean) => set({ isPlaying: p }),

  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaybackRate: (r: number) => set({ playbackRate: r }),

  setFps: (fps: number) => {
    const { duration } = get()
    set({ fps, totalFrames: Math.floor(duration * fps) })
  },

  setDurationFromMetadata: (durationSec: number) => {
    const { fps } = get()
    set({
      duration: durationSec,
      totalFrames: Math.max(1, Math.floor(durationSec * fps)),
    })
  },

  loadVideo: (id: number) => {
    set({
      videoId: id,
      videoUrl: `/api/videos/${id}/stream`,
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
    })
  },

  loadLocalFile: (file: File) => {
    revokeBlobUrl(get().videoUrl)
    const url = URL.createObjectURL(file)
    set({
      videoId: null,
      videoUrl: url,
      videoFilename: file.name,
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
    })
  },

  loadRemoteUrl: (url: string, filename: string) => {
    revokeBlobUrl(get().videoUrl)
    set({
      videoId: null,
      videoUrl: url,
      videoFilename: filename,
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
    })
  },

  stepFrame: (delta: number) => {
    const { currentFrame, fps, totalFrames } = get()
    const newFrame = Math.max(0, Math.min(totalFrames - 1, currentFrame + delta))
    set({
      currentFrame: newFrame,
      currentTime: newFrame / fps,
    })
  },

  seekToFrame: (frame: number) => {
    const { fps, totalFrames } = get()
    const clamped = Math.max(0, Math.min(totalFrames - 1, frame))
    set({
      currentFrame: clamped,
      currentTime: clamped / fps,
    })
  },
}))
