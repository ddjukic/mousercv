import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MOCK_VIDEO } from "@/data/mock"
import { useVideoStore } from "./video-store"

function resetStore() {
  useVideoStore.setState({
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
  })
}

describe("video store remote loading", () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads a mounted video URL without creating an object URL", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL")
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL")

    useVideoStore
      .getState()
      .loadRemoteUrl("/videos/session%201.mp4", "session 1.mp4")

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(useVideoStore.getState()).toMatchObject({
      videoId: null,
      videoUrl: "/videos/session%201.mp4",
      videoFilename: "session 1.mp4",
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
    })
  })

  it("revokes a previous blob URL before loading a remote video", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL")
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL")
    useVideoStore.setState({
      videoUrl: "blob:http://localhost/old-video",
      currentTime: 12,
      currentFrame: 300,
      isPlaying: true,
    })

    useVideoStore.getState().loadRemoteUrl("/videos/test.mov", "test.mov")

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/old-video"
    )
    expect(useVideoStore.getState()).toMatchObject({
      videoUrl: "/videos/test.mov",
      videoFilename: "test.mov",
      currentTime: 0,
      currentFrame: 0,
      isPlaying: false,
    })
  })
})
