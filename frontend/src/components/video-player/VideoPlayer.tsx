import { useRef, useEffect, useCallback, useState } from "react"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import { useDebugStore } from "@/stores/debug-store"
import {
  mediaErrorMessage,
  summarizeVideoElement,
} from "@/lib/video-diagnostics"
import { PlaybackControls } from "./PlaybackControls"
import { BboxOverlay } from "./BboxOverlay"

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [videoDimensions, setVideoDimensions] = useState({
    width: 1280,
    height: 720,
  })
  const [hasVideoError, setHasVideoError] = useState(false)

  const {
    isPlaying,
    playbackRate,
    currentTime,
    currentFrame,
    fps,
    totalFrames,
    videoUrl,
    setCurrentTime,
    setPlaying,
    setDurationFromMetadata,
  } = useVideoStore()

  const allDetections = useAnnotationStore((s) => s.detections)
  const tracks = useAnnotationStore((s) => s.tracks)
  const detections = allDetections[currentFrame] ?? []
  const lastVideoUrlRef = useRef(videoUrl)

  useEffect(() => {
    if (lastVideoUrlRef.current === videoUrl) return

    lastVideoUrlRef.current = videoUrl
    const id = window.setTimeout(() => {
      setHasVideoError(false)
    }, 0)

    return () => window.clearTimeout(id)
  }, [videoUrl])

  // Sync video element with store state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.play().catch(() => {
        // No video source available, simulate playback
      })
    } else {
      video.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return
    if (Math.abs(video.currentTime - currentTime) > 1 / fps) {
      video.currentTime = currentTime
    }
  }, [currentTime, fps, videoUrl])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (
      (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback
    ) {
      return
    }
    setCurrentTime(video.currentTime)
  }, [setCurrentTime])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setVideoDimensions({
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    })
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDurationFromMetadata(video.duration)
    }
  }, [setDurationFromMetadata])

  const handleLoadedData = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setHasVideoError(false)
    useDebugStore.getState().log({
      level: "info",
      source: "video",
      message: "Loaded video data",
      detail: summarizeVideoElement(video),
    })
  }, [])

  const handleVideoError = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const message = mediaErrorMessage(video.error)
    useDebugStore.getState().log({
      level: "error",
      source: "video",
      message,
      detail: `${summarizeVideoElement(video)} | currentSrc=${video.currentSrc}`,
    })
    setHasVideoError(true)
  }, [])

  const handleVideoEnd = useCallback(() => {
    setPlaying(false)
  }, [setPlaying])

  useEffect(() => {
    const video = videoRef.current as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (
            callback: (
              now: DOMHighResTimeStamp,
              metadata: { mediaTime: number }
            ) => void
          ) => number
          cancelVideoFrameCallback?: (handle: number) => void
        })
      | null
    if (!video || !videoUrl || !video.requestVideoFrameCallback) return

    let callbackId: number | null = null
    let active = true

    const updateFrame = (
      _now: DOMHighResTimeStamp,
      metadata: { mediaTime: number }
    ) => {
      if (!active) return
      const frame = Math.round(metadata.mediaTime * fps)
      setCurrentTime(frame / fps)
      callbackId = video.requestVideoFrameCallback?.(updateFrame) ?? null
    }

    callbackId = video.requestVideoFrameCallback(updateFrame)

    return () => {
      active = false
      if (callbackId !== null) {
        video.cancelVideoFrameCallback?.(callbackId)
      }
    }
  }, [fps, setCurrentTime, videoUrl])

  // Simulated playback when no video source
  useEffect(() => {
    if (videoUrl) return // Real video handles its own timing

    let animationId: number
    let lastTimestamp: number | null = null

    const tick = (timestamp: number) => {
      if (!isPlaying) return

      if (lastTimestamp !== null) {
        const delta = (timestamp - lastTimestamp) / 1000
        const state = useVideoStore.getState()
        const newTime = state.currentTime + delta * state.playbackRate
        if (newTime >= state.duration) {
          setCurrentTime(state.duration)
          setPlaying(false)
          return
        }
        setCurrentTime(newTime)
      }
      lastTimestamp = timestamp
      animationId = requestAnimationFrame(tick)
    }

    if (isPlaying) {
      animationId = requestAnimationFrame(tick)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [isPlaying, videoUrl, setCurrentTime, setPlaying])

  // Format time for display
  const currentTimeDisplay = useVideoStore((s) => s.currentTime)
  const duration = useVideoStore((s) => s.duration)

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Video + overlay container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="h-full w-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onError={handleVideoError}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnd}
            playsInline
          />
        ) : (
          /* Simulated video area with dark background and grid */
          <div className="flex h-full w-full items-center justify-center bg-zinc-950">
            <div className="absolute inset-0 opacity-10">
              <svg width="100%" height="100%">
                <defs>
                  <pattern
                    id="grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            {/* Arena boundary circle */}
            <div className="absolute inset-4 rounded-full border border-dashed border-zinc-700 opacity-40" />
            <span className="z-10 font-mono text-xs text-zinc-600">
              No video loaded -- showing mock data overlay
            </span>
          </div>
        )}

        {/* Bounding box overlay */}
        <BboxOverlay
          detections={detections}
          tracks={tracks}
          containerRef={containerRef}
          videoWidth={videoDimensions.width}
          videoHeight={videoDimensions.height}
        />

        {hasVideoError ? (
          <div className="absolute inset-x-8 top-1/2 z-20 -translate-y-1/2 rounded-md border border-red-500/50 bg-red-950/85 px-4 py-3 text-center text-sm font-medium text-red-100 shadow-lg">
            ⚠ Video failed to display — likely an unsupported codec (e.g.
            HEVC/H.265 .MOV). Open Debug for details.
          </div>
        ) : null}

        {/* Time overlay */}
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-zinc-300">
          {formatTime(currentTimeDisplay)} / {formatTime(duration)}
        </div>

        {/* Frame overlay */}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-zinc-400">
          F:{currentFrame} / {totalFrames}
        </div>

        {/* FPS badge */}
        <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-zinc-500">
          {fps} FPS
        </div>
      </div>

      {/* Playback controls */}
      <PlaybackControls />
    </div>
  )
}
