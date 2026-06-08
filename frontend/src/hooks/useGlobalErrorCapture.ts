import { useEffect } from "react"
import { useDebugStore } from "@/stores/debug-store"

let consolePatched = false
let originalConsoleError: typeof console.error | null = null
let originalConsoleWarn: typeof console.warn | null = null

function formatValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === "string") return value

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(formatValue).join(" ")
}

function reasonDetail(reason: unknown): string | undefined {
  if (reason instanceof Error) return reason.stack ?? reason.message
  if (typeof reason === "string") return reason
  return formatValue(reason)
}

function patchConsole() {
  if (consolePatched) return

  originalConsoleError = console.error
  originalConsoleWarn = console.warn
  consolePatched = true

  console.error = (...args: unknown[]) => {
    useDebugStore.getState().log({
      level: "error",
      source: "console",
      message: formatArgs(args),
    })
    originalConsoleError?.(...args)
  }

  console.warn = (...args: unknown[]) => {
    useDebugStore.getState().log({
      level: "warn",
      source: "console",
      message: formatArgs(args),
    })
    originalConsoleWarn?.(...args)
  }
}

export function useGlobalErrorCapture(): void {
  useEffect(() => {
    if (typeof window === "undefined") return

    patchConsole()

    const handleError = (event: ErrorEvent) => {
      useDebugStore.getState().log({
        level: "error",
        source: "window",
        message: event.message || "Uncaught error",
        detail: event.error instanceof Error
          ? event.error.stack
          : event.filename
            ? `${event.filename}:${event.lineno}:${event.colno}`
            : undefined,
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      useDebugStore.getState().log({
        level: "error",
        source: "window",
        message: "Unhandled promise rejection",
        detail: reasonDetail(event.reason),
      })
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    }
  }, [])
}
