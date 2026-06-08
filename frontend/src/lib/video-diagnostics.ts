export interface CodecSupport {
  label: string
  mime: string
  support: "" | "maybe" | "probably"
}

const mediaErrorMessages: Record<number, string> = {
  1: "Playback aborted",
  2: "Network error while loading video",
  3: "Decode error — the file is likely a codec the browser can't decode (e.g. HEVC/H.265)",
  4: "Source/codec not supported — likely HEVC/H.265 .MOV or an unsupported container",
}

const codecProbeTargets = [
  {
    label: "MP4 / H.264 (AVC)",
    mime: 'video/mp4; codecs="avc1.42E01E"',
  },
  {
    label: "MP4 / H.265 (HEVC)",
    mime: 'video/mp4; codecs="hev1.1.6.L93.B0"',
  },
  {
    label: "MP4 / AV1",
    mime: 'video/mp4; codecs="av01.0.05M.08"',
  },
  {
    label: "WebM / VP9",
    mime: 'video/webm; codecs="vp9"',
  },
  {
    label: "QuickTime (.mov)",
    mime: "video/quicktime",
  },
]

export function mediaErrorMessage(err: MediaError | null): string {
  if (!err) return "No media error"

  const base = mediaErrorMessages[err.code] ?? `Unknown media error ${err.code}`
  return err.message ? `${base}: ${err.message}` : base
}

export function probeCodecSupport(): CodecSupport[] {
  const video = document.createElement("video")

  return codecProbeTargets.map((target) => ({
    ...target,
    support: video.canPlayType(target.mime),
  }))
}

export function summarizeVideoElement(video: HTMLVideoElement): string {
  return [
    `${video.videoWidth}x${video.videoHeight}`,
    `duration=${video.duration}`,
    `readyState=${video.readyState}`,
    `networkState=${video.networkState}`,
    `currentSrc=${video.currentSrc}`,
  ].join(" ")
}
