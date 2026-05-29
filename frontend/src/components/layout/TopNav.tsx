import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Braces,
  Crosshair,
  Download,
  Eraser,
  FolderOpen,
  GitBranch,
  RefreshCw,
} from "lucide-react"
import { MOCK_PROJECT } from "@/data/mock"
import { api } from "@/api/client"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import {
  buildAnnotationsExport,
  downloadJson,
  enrichSegments,
  fileTimestamp,
  serializeAnnotationsExport,
  videoStem,
} from "@/lib/annotations-export"
import { loadGitHubSettings } from "@/lib/github-settings"
import { MountedVideosPicker } from "./MountedVideosPicker"
import { PushToGitHubDialog } from "./PushToGitHubDialog"

export function TopNav() {
  const [syncing, setSyncing] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadLocalFile = useVideoStore((s) => s.loadLocalFile)
  const videoFilename = useVideoStore((s) => s.videoFilename)
  const fps = useVideoStore((s) => s.fps)
  const duration = useVideoStore((s) => s.duration)
  const behaviors = useAnnotationStore((s) => s.behaviors)
  const tracks = useAnnotationStore((s) => s.tracks)
  const setBehaviors = useAnnotationStore((s) => s.setBehaviors)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await api.syncGcs()
      console.log("GCS sync:", result)
    } catch (e) {
      console.warn("GCS sync failed:", e)
    } finally {
      setSyncing(false)
    }
  }

  const handleLoadClick = () => fileInputRef.current?.click()

  const handleClear = () => {
    if (behaviors.length === 0) return
    const ok = window.confirm(
      `Clear all ${behaviors.length} annotation segments? This cannot be undone with Z (history is preserved per session, not across reloads).`
    )
    if (ok) setBehaviors([])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadLocalFile(file)
    // reset so the same file can be picked twice in a row
    e.target.value = ""
  }

  const handleExport = () => {
    const enriched = enrichSegments(behaviors, tracks, fps)
    const csvHeader = [
      "id",
      "track_id",
      "track_label",
      "behavior",
      "behavior_label",
      "start_frame",
      "end_frame",
      "duration_frames",
      "duration_sec",
      "notes",
      "confidence",
    ].join(",")
    const csvRows = enriched.map((s) => {
      const cells = [
        s.id,
        s.track_id,
        s.track_label,
        s.behavior,
        s.behavior_label,
        s.start_frame,
        s.end_frame,
        s.duration_frames,
        s.duration_sec.toFixed(3),
        s.notes,
        s.confidence ?? "",
      ]
      return cells
        .map((c) => {
          const cell = String(c)
          return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
        })
        .join(",")
    })
    const csv = [csvHeader, ...csvRows].join("\n")
    const stem = videoStem(videoFilename)
    const ts = fileTimestamp()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${stem}-annotations-${ts}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportJson = () => {
    const exportData = buildAnnotationsExport({
      segments: behaviors,
      tracks,
      fps,
      videoFilename,
      duration,
      annotator: loadGitHubSettings().annotator.trim(),
    })
    const jsonString = serializeAnnotationsExport(exportData)
    const stem = videoStem(videoFilename)
    const ts = fileTimestamp()
    downloadJson(jsonString, `${stem}-annotations-${ts}.json`)
  }

  return (
    <header className="flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
      {/* Left: Logo + project */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Crosshair className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            MouserCV
          </span>
        </div>
        <Separator orientation="vertical" className="h-4 bg-zinc-800" />
        <span className="text-xs text-zinc-500">{MOCK_PROJECT.name}</span>
        <Badge
          variant="outline"
          className="h-4 border-zinc-700 font-mono text-[9px] text-zinc-600"
        >
          v0.1
        </Badge>
      </div>

      {/* Right: Load + Refresh + Export */}
      <div className="flex items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mov,.mp4,.avi,.mkv,.webm"
          className="hidden"
          onChange={handleFileChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
              onClick={handleLoadClick}
            >
              <FolderOpen className="h-3 w-3" />
              {videoFilename
                ? videoFilename.length > 24
                  ? `${videoFilename.slice(0, 21)}…`
                  : videoFilename
                : "Load video"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Load a local .mov / .mp4 file into the player
          </TooltipContent>
        </Tooltip>
        <MountedVideosPicker />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw
                className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
              />
              Sync
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh videos from GCS</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-zinc-200"
              onClick={handleClear}
              disabled={behaviors.length === 0}
            >
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Wipe all annotations (with confirm)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
              onClick={handleExport}
              disabled={behaviors.length === 0}
            >
              <Download className="h-3 w-3" />
              Export ({behaviors.length})
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Download all annotations as CSV
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
              onClick={handleExportJson}
              disabled={behaviors.length === 0}
            >
              <Braces className="h-3 w-3" />
              JSON
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Download all annotations as timestamped JSON
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-zinc-400"
              onClick={() => setPushOpen(true)}
              disabled={behaviors.length === 0}
            >
              <GitBranch className="h-3 w-3" />
              Push to GitHub
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Push annotations JSON straight to GitHub
          </TooltipContent>
        </Tooltip>
      </div>
      <PushToGitHubDialog open={pushOpen} onOpenChange={setPushOpen} />
    </header>
  )
}
