/**
 * Persisted GitHub push settings (localStorage). The token is stored under a
 * separate key so it can be cleared independently ("Forget token").
 */

const SETTINGS_KEY = "mousercv:github:v1"
const TOKEN_KEY = "mousercv:github-token:v1"

export interface GitHubSettings {
  owner: string
  repo: string
  branch: string
  folder: string
  annotator: string
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  owner: "ddjukic",
  repo: "mousercv",
  branch: "main",
  folder: "annotations",
  annotator: "",
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function loadGitHubSettings(): GitHubSettings {
  if (typeof window === "undefined") return { ...DEFAULT_GITHUB_SETTINGS }
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY)
    if (!stored) return { ...DEFAULT_GITHUB_SETTINGS }
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_GITHUB_SETTINGS }
    }
    const record = parsed as Record<string, unknown>
    return {
      owner: isString(record.owner)
        ? record.owner
        : DEFAULT_GITHUB_SETTINGS.owner,
      repo: isString(record.repo) ? record.repo : DEFAULT_GITHUB_SETTINGS.repo,
      branch: isString(record.branch)
        ? record.branch
        : DEFAULT_GITHUB_SETTINGS.branch,
      folder: isString(record.folder)
        ? record.folder
        : DEFAULT_GITHUB_SETTINGS.folder,
      annotator: isString(record.annotator)
        ? record.annotator
        : DEFAULT_GITHUB_SETTINGS.annotator,
    }
  } catch {
    return { ...DEFAULT_GITHUB_SETTINGS }
  }
}

export function saveGitHubSettings(settings: GitHubSettings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage quota/privacy failures.
  }
}

export function loadGitHubToken(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? ""
  } catch {
    return ""
  }
}

export function saveGitHubToken(token: string): void {
  if (typeof window === "undefined") return
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore storage quota/privacy failures.
  }
}

export function clearGitHubToken(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore storage failures.
  }
}
