import { Badge } from "@/components/ui/badge"
import { MOCK_PROJECT, MOCK_VIDEO, MOCK_TRACKS } from "@/data/mock"

export function SummaryPanel() {
  return (
    <div className="flex items-center gap-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-zinc-600">Project</span>
        <span className="text-xs text-zinc-300">{MOCK_PROJECT.name}</span>
      </div>
      <div className="h-3 w-px bg-zinc-800" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-zinc-600">Dataset</span>
        <span className="font-mono text-xs text-zinc-400">
          {MOCK_VIDEO.filename}
        </span>
      </div>
      <div className="h-3 w-px bg-zinc-800" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-zinc-600">Mice</span>
        <Badge
          variant="secondary"
          className="h-4 font-mono text-[10px]"
        >
          {MOCK_TRACKS.length}
        </Badge>
      </div>
      <div className="h-3 w-px bg-zinc-800" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-zinc-600">Status</span>
        <Badge
          variant="outline"
          className="h-4 border-green-800 px-1.5 font-mono text-[9px] text-green-500"
        >
          {MOCK_VIDEO.status}
        </Badge>
      </div>
      <div className="h-3 w-px bg-zinc-800" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-zinc-600">Resolution</span>
        <span className="font-mono text-[10px] text-zinc-500">
          {MOCK_VIDEO.width}x{MOCK_VIDEO.height}
        </span>
      </div>
    </div>
  )
}
