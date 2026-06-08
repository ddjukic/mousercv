import { useEffect, useRef, useState } from "react"
import { Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  selectErrorCount,
  type DebugEntry,
  useDebugStore,
} from "@/stores/debug-store"
import { probeCodecSupport } from "@/lib/video-diagnostics"
import { cn } from "@/lib/utils"

function formatTime(ts: number): string {
  const date = new Date(ts)
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const seconds = date.getSeconds().toString().padStart(2, "0")
  const ms = date.getMilliseconds().toString().padStart(3, "0")

  return `${hours}:${minutes}:${seconds}.${ms}`
}

function dumpEntries(entries: DebugEntry[]): string {
  return entries
    .map((entry) => {
      const line = [
        formatTime(entry.ts),
        entry.level.toUpperCase(),
        `[${entry.source}]`,
        entry.message,
      ].join(" ")

      return entry.detail ? `${line}\n${entry.detail}` : line
    })
    .join("\n\n")
}

function logCodecProbe() {
  const log = useDebugStore.getState().log

  probeCodecSupport().forEach((codec) => {
    log({
      level: "info",
      source: "codec",
      message: `${codec.label}: ${codec.support || "unsupported"}`,
      detail: codec.mime,
    })
  })
}

function levelClassName(level: DebugEntry["level"]) {
  if (level === "error") return "border-red-500/40 bg-red-500/15 text-red-200"
  if (level === "warn") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-200"
  }
  return "border-zinc-600 bg-zinc-800 text-zinc-300"
}

export function DebugPanel() {
  const [open, setOpen] = useState(false)
  const autoProbedRef = useRef(false)
  const entries = useDebugStore((s) => s.entries)
  const errorCount = useDebugStore(selectErrorCount)
  const clear = useDebugStore((s) => s.clear)
  const displayEntries = [...entries].reverse()

  useEffect(() => {
    if (!open) return
    if (autoProbedRef.current) return
    if (entries.some((entry) => entry.source === "codec")) return

    autoProbedRef.current = true
    logCodecProbe()
  }, [entries, open])

  const handleCopyAll = () => {
    void navigator.clipboard.writeText(dumpEntries(displayEntries))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-7 gap-1.5 text-xs text-zinc-400"
        >
          <Bug className="h-3 w-3" />
          Debug
          {errorCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[9px] leading-none text-white">
              {errorCount}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug
          </DialogTitle>
          <DialogDescription>
            Runtime errors, video diagnostics, and browser codec support.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950">
          {displayEntries.length > 0 ? (
            <div className="divide-y divide-zinc-800">
              {displayEntries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-1 p-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-500">
                      {formatTime(entry.ts)}
                    </span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none",
                        levelClassName(entry.level)
                      )}
                    >
                      {entry.level}
                    </span>
                    <span className="font-mono text-zinc-400">
                      {entry.source}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-zinc-200">
                      {entry.message}
                    </span>
                  </div>
                  {entry.detail ? (
                    <pre className="whitespace-pre-wrap break-words rounded bg-zinc-900/80 p-2 text-xs text-zinc-400">
                      {entry.detail}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-8 text-center text-xs text-zinc-500">
              No debug entries.
            </div>
          )}
        </div>

        <DialogFooter className="border-zinc-800 bg-zinc-900/70">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleCopyAll}
          >
            Copy all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={clear}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={logCodecProbe}
          >
            Re-run codec probe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
