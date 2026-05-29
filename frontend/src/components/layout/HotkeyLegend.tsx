import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HOTKEY_LEGEND_CLOSE_EVENT,
  HOTKEY_LEGEND_OPEN_EVENT,
} from "@/hooks/useKeyboardShortcuts"
import { BEHAVIORS } from "@/types"

const GROUPS = [
  {
    title: "Playback",
    shortcuts: [
      { keys: ["Space"], label: "Play / pause" },
      { keys: ["J"], label: "Play at 0.5x" },
      { keys: ["K"], label: "Play / pause" },
      { keys: ["L"], label: "Play at 2x" },
      { keys: [","], label: "Previous frame" },
      { keys: ["."], label: "Next frame" },
      { keys: ["Shift", ","], label: "Back 10 frames" },
      { keys: ["Shift", "."], label: "Forward 10 frames" },
      { keys: ["Left"], label: "Previous frame" },
      { keys: ["Right"], label: "Next frame" },
    ],
  },
  {
    title: "Navigate",
    shortcuts: [
      { keys: ["N"], label: "Next annotation on active track" },
      { keys: ["P"], label: "Previous annotation on active track" },
    ],
  },
  {
    title: "Annotation",
    shortcuts: [
      { keys: ["I"], label: "Set in point" },
      { keys: ["O", "1-7"], label: "Commit out point with behavior" },
      ...BEHAVIORS.map((behavior) => ({
        keys: [behavior.hotkey],
        label: behavior.label,
      })),
      { keys: ["Z"], label: "Undo" },
      { keys: ["Shift", "Z"], label: "Redo" },
      { keys: ["Y"], label: "Redo" },
      { keys: ["Backspace"], label: "Delete current segment" },
      { keys: ["Delete"], label: "Delete current segment" },
    ],
  },
  {
    title: "Track",
    shortcuts: [
      { keys: ["Shift", "1-9"], label: "Select track by row" },
    ],
  },
  {
    title: "Help",
    shortcuts: [
      { keys: ["?"], label: "Open this legend" },
      { keys: ["Esc"], label: "Clear in point and close legend" },
    ],
  },
]

export function HotkeyLegend() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const openLegend = () => setOpen(true)
    const closeLegend = () => setOpen(false)

    window.addEventListener(HOTKEY_LEGEND_OPEN_EVENT, openLegend)
    window.addEventListener(HOTKEY_LEGEND_CLOSE_EVENT, closeLegend)

    return () => {
      window.removeEventListener(HOTKEY_LEGEND_OPEN_EVENT, openLegend)
      window.removeEventListener(HOTKEY_LEGEND_CLOSE_EVENT, closeLegend)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Annotation controls are disabled while typing in form fields.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-xs font-medium uppercase text-zinc-500">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={`${group.title}-${shortcut.label}-${shortcut.keys.join("+")}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5"
                  >
                    <span className="text-xs text-zinc-300">
                      {shortcut.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-6 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-center font-mono text-[10px] text-zinc-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
