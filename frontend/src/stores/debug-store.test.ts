import { beforeEach, describe, expect, it } from "vitest"
import { selectErrorCount, useDebugStore } from "./debug-store"

function resetStore() {
  useDebugStore.setState({ entries: [] })
}

describe("debug store", () => {
  beforeEach(() => {
    resetStore()
  })

  it("appends log entries and records the level", () => {
    useDebugStore.getState().log({
      level: "warn",
      source: "test",
      message: "first",
    })
    useDebugStore.getState().log({
      level: "error",
      source: "test",
      message: "second",
    })

    expect(useDebugStore.getState().entries).toMatchObject([
      { level: "warn", source: "test", message: "first" },
      { level: "error", source: "test", message: "second" },
    ])
  })

  it("clears entries", () => {
    useDebugStore.getState().log({
      level: "info",
      source: "test",
      message: "entry",
    })

    useDebugStore.getState().clear()

    expect(useDebugStore.getState().entries).toEqual([])
  })

  it("caps entries at 500 and drops the oldest", () => {
    for (let i = 0; i < 501; i++) {
      useDebugStore.getState().log({
        level: "info",
        source: "test",
        message: `entry-${i}`,
      })
    }

    const entries = useDebugStore.getState().entries
    expect(entries).toHaveLength(500)
    expect(entries[0].message).toBe("entry-1")
    expect(entries[499].message).toBe("entry-500")
  })

  it("counts only errors", () => {
    useDebugStore.getState().log({
      level: "info",
      source: "test",
      message: "info",
    })
    useDebugStore.getState().log({
      level: "warn",
      source: "test",
      message: "warn",
    })
    useDebugStore.getState().log({
      level: "error",
      source: "test",
      message: "error",
    })

    expect(selectErrorCount(useDebugStore.getState())).toBe(1)
  })
})
