import { afterEach, describe, expect, it, vi } from "vitest"
import {
  mediaErrorMessage,
  probeCodecSupport,
  summarizeVideoElement,
} from "./video-diagnostics"

function fakeMediaError(code: number, message = ""): MediaError {
  return {
    code,
    message,
  } as unknown as MediaError
}

describe("video diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("maps media error codes", () => {
    expect(mediaErrorMessage(fakeMediaError(1))).toContain("Playback aborted")
    expect(mediaErrorMessage(fakeMediaError(2))).toContain("Network error")
    expect(mediaErrorMessage(fakeMediaError(3))).toContain("Decode error")
    expect(mediaErrorMessage(fakeMediaError(4))).toContain(
      "Source/codec not supported"
    )
  })

  it("includes media error detail messages", () => {
    expect(mediaErrorMessage(fakeMediaError(3, "bad codec"))).toContain(
      "bad codec"
    )
  })

  it("handles null media errors", () => {
    expect(mediaErrorMessage(null)).toBe("No media error")
  })

  it("probes browser codec support", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        canPlayType: () => "",
      }),
    })

    const results = probeCodecSupport()

    expect(results).toHaveLength(5)
    expect(
      results.every((result) =>
        ["", "maybe", "probably"].includes(result.support)
      )
    ).toBe(true)
  })

  it("summarizes video dimensions", () => {
    const video = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 12.5,
      readyState: 2,
      networkState: 1,
      currentSrc: "blob:test",
    } as unknown as HTMLVideoElement

    const summary = summarizeVideoElement(video)

    expect(summary).toContain("1920x1080")
    expect(summary).toContain("duration=12.5")
  })
})
