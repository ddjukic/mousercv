import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useVideoStore } from "@/stores/video-store"
import { Folder, Loader2, RefreshCw } from "lucide-react"

interface AutoindexEntry {
  name: string
  type: string
  mtime?: string
  size?: number
}

type PickerStatus = "idle" | "loading" | "ready" | "error"

const VIDEO_FILE_PATTERN = /\.(mp4|mov|avi|mkv|webm)$/i
const MOUNT_HINT =
  "No mounted folder detected — run via Docker with -v <host>:/videos"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseAutoindexEntries(value: unknown): AutoindexEntry[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []

    const { name, type, mtime, size } = entry
    if (typeof name !== "string" || typeof type !== "string") return []

    return [
      {
        name,
        type,
        mtime: typeof mtime === "string" ? mtime : undefined,
        size: typeof size === "number" ? size : undefined,
      },
    ]
  })
}

function formatBytes(size: number | undefined) {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return "Unknown size"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

export function MountedVideosPicker() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<PickerStatus>("idle")
  const [videos, setVideos] = useState<AutoindexEntry[]>([])
  const loadRemoteUrl = useVideoStore((s) => s.loadRemoteUrl)

  const loadMountedVideos = useCallback(async () => {
    setStatus("loading")
    try {
      const response = await fetch("/videos/")
      if (!response.ok) {
        setVideos([])
        setStatus("error")
        return
      }

      const entries = parseAutoindexEntries(await response.json())
      setVideos(
        entries.filter(
          (entry) => entry.type === "file" && VIDEO_FILE_PATTERN.test(entry.name)
        )
      )
      setStatus("ready")
    } catch {
      setVideos([])
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadMountedVideos()
    }
  }, [loadMountedVideos, open])

  const handleSelect = (name: string) => {
    loadRemoteUrl(`/videos/${encodeURIComponent(name)}`, name)
    setOpen(false)
  }

  const showHint = status === "error"
  const showEmpty = status === "ready" && videos.length === 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
            >
              <Folder className="h-3 w-3" />
              Folder
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Load a video from the mounted /videos folder</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Mounted videos
          </DialogTitle>
          <DialogDescription>
            Videos served from the Docker-mounted /videos folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {status === "ready"
              ? `${videos.length} video${videos.length === 1 ? "" : "s"}`
              : "Mounted folder"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void loadMountedVideos()}
            disabled={status === "loading"}
          >
            <RefreshCw
              className={cn("h-3 w-3", status === "loading" && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        <div className="min-h-32 overflow-hidden rounded-md border border-zinc-800">
          {status === "loading" ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading videos
            </div>
          ) : null}

          {showHint ? (
            <div className="p-3 text-sm leading-snug text-muted-foreground">
              {MOUNT_HINT}
            </div>
          ) : null}

          {showEmpty ? (
            <div className="p-3 text-sm leading-snug text-muted-foreground">
              No supported videos found in /videos.
            </div>
          ) : null}

          {status === "ready" && videos.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {videos.map((video) => (
                <button
                  key={video.name}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-left",
                    "text-sm transition-colors last:border-b-0 hover:bg-zinc-900/80"
                  )}
                  onClick={() => handleSelect(video.name)}
                >
                  <span className="min-w-0 truncate text-zinc-100">
                    {video.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(video.size)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
