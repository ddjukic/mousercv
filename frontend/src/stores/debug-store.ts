import { create } from "zustand"

const MAX_ENTRIES = 500

let counter = 0

export type DebugEntry = {
  id: string
  ts: number
  level: "error" | "warn" | "info"
  source: string
  message: string
  detail?: string
}

type DebugLogInput = Omit<DebugEntry, "id" | "ts">

interface DebugState {
  entries: DebugEntry[]
  log: (input: DebugLogInput) => void
  clear: () => void
}

export const useDebugStore = create<DebugState>((set) => ({
  entries: [],

  log: (input: DebugLogInput) => {
    const ts = Date.now()
    const entry: DebugEntry = {
      ...input,
      id: `${ts}-${counter++}`,
      ts,
    }

    set((state) => ({
      entries: [...state.entries, entry].slice(-MAX_ENTRIES),
    }))
  },

  clear: () => set({ entries: [] }),
}))

export function selectErrorCount(state: DebugState) {
  return state.entries.filter((entry) => entry.level === "error").length
}
