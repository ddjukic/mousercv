/**
 * Minimal GitHub Contents API client using native fetch (no octokit).
 * Used to push annotation JSON straight from the browser.
 */

export interface GitHubPushArgs {
  owner: string
  repo: string
  branch: string
  /** Repo-relative path, e.g. "annotations/foo-annotations-2026-...json". */
  path: string
  /** UTF-8 JSON string to commit. */
  content: string
  /** Commit message. */
  message: string
  /** Fine-grained PAT with Contents: Read & Write. */
  token: string
}

export interface GitHubPushResult {
  /** Browser URL of the created/updated file, if returned by the API. */
  htmlUrl: string | null
  /** Commit URL, if returned by the API. */
  commitUrl: string | null
}

interface GitHubContentsResponse {
  content?: { html_url?: string | null } | null
  commit?: { html_url?: string | null } | null
}

interface GitHubErrorResponse {
  message?: string
}

interface GitHubExistingFileResponse {
  sha?: string
}

/**
 * Unicode-safe base64 encoder. Chunks the byte array to avoid blowing the
 * call-stack limit of String.fromCharCode on large payloads.
 */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const CHUNK = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function contentsUrl(owner: string, repo: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/contents/${encodedPath}`
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as GitHubErrorResponse
    if (body.message) return body.message
  } catch {
    // body was not JSON; fall through to the status-based message
  }
  return fallback
}

function statusFallback(status: number): string {
  switch (status) {
    case 401:
      return "Invalid or expired token (401). Check your fine-grained PAT."
    case 403:
      return "Forbidden (403). The token may lack Contents: Read & Write on this repo."
    case 404:
      return "Repo or branch not found (404). Check owner/repo/branch and token scope."
    case 422:
      return "Unprocessable (422). The branch may not exist or the path is invalid."
    default:
      return `GitHub API error (${status}).`
  }
}

/**
 * Look up the sha of an existing file at path@branch. Returns null when the
 * file does not exist (404) — this is the common case for unique timestamped
 * filenames. Throws on auth/repo errors so the caller can surface them.
 */
async function getExistingSha(
  args: Pick<GitHubPushArgs, "owner" | "repo" | "branch" | "path" | "token">
): Promise<string | null> {
  const url = `${contentsUrl(args.owner, args.repo, args.path)}?ref=${encodeURIComponent(
    args.branch
  )}`
  const response = await fetch(url, { headers: authHeaders(args.token) })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, statusFallback(response.status))
    )
  }

  const body = (await response.json()) as GitHubExistingFileResponse
  return body.sha ?? null
}

/**
 * Create or update a file via the GitHub Contents API. Filenames are unique
 * timestamps, but we GET first and include the sha if a file already exists so
 * a retry/collision can't fail with 422.
 */
export async function pushAnnotationsToGitHub(
  args: GitHubPushArgs
): Promise<GitHubPushResult> {
  const sha = await getExistingSha(args)

  const body: Record<string, string> = {
    message: args.message,
    content: encodeBase64(args.content),
    branch: args.branch,
  }
  if (sha) body.sha = sha

  const response = await fetch(contentsUrl(args.owner, args.repo, args.path), {
    method: "PUT",
    headers: {
      ...authHeaders(args.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, statusFallback(response.status))
    )
  }

  const result = (await response.json()) as GitHubContentsResponse
  return {
    htmlUrl: result.content?.html_url ?? null,
    commitUrl: result.commit?.html_url ?? null,
  }
}
