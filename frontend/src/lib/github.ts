/**
 * Minimal GitHub API client using native fetch (no octokit). Pushes annotation
 * JSON from the browser by opening a pull request: it creates a fresh branch off
 * the base branch, commits the JSON to it, then opens a PR into the base branch
 * so a maintainer can review before the annotations land.
 */

export interface GitHubPushArgs {
  owner: string
  repo: string
  /** Branch the PR targets, e.g. "main". */
  baseBranch: string
  /** New branch the commit goes on, e.g. "annotations/cageA-2026-...-x7k2". */
  headBranch: string
  /** Repo-relative path, e.g. "annotations/foo-annotations-2026-...json". */
  path: string
  /** UTF-8 JSON string to commit. */
  content: string
  /** Commit message. */
  message: string
  /** Pull request title. */
  prTitle: string
  /** Pull request body (markdown). */
  prBody: string
  /** Fine-grained PAT with Contents + Pull requests: Read & Write. */
  token: string
}

export interface GitHubPushResult {
  /** Browser URL of the opened pull request. */
  prUrl: string | null
  /** Pull request number, e.g. 42. */
  prNumber: number | null
  /** The head branch that was created. */
  headBranch: string
  /** Browser URL of the committed file on the head branch, if returned. */
  fileUrl: string | null
}

interface GitHubRefResponse {
  object?: { sha?: string | null } | null
}

interface GitHubContentsResponse {
  content?: { html_url?: string | null } | null
}

interface GitHubPullResponse {
  html_url?: string | null
  number?: number | null
}

interface GitHubErrorResponse {
  message?: string
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

const API = "https://api.github.com"

function repoPath(owner: string, repo: string): string {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
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
    if (body.message) return `${fallback} — ${body.message}`
  } catch {
    // body was not JSON; fall through to the status-based message
  }
  return fallback
}

/** Resolve the commit sha at the tip of a branch. */
async function getBaseSha(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<string> {
  const url = `${API}/repos/${repoPath(owner, repo)}/git/ref/heads/${encodePath(
    branch
  )}`
  const response = await fetch(url, { headers: authHeaders(token) })

  if (response.status === 404) {
    throw new Error(
      `Base branch "${branch}" not found (404). Check the base branch and that the token can read this repo.`
    )
  }
  if (response.status === 401) {
    throw new Error("Invalid or expired token (401). Check your fine-grained PAT.")
  }
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Could not read base branch "${branch}" (${response.status}).`
      )
    )
  }

  const body = (await response.json()) as GitHubRefResponse
  const sha = body.object?.sha
  if (!sha) {
    throw new Error(`Base branch "${branch}" returned no commit sha.`)
  }
  return sha
}

/** Create a new branch pointing at baseSha. */
async function createBranch(
  owner: string,
  repo: string,
  headBranch: string,
  baseSha: string,
  token: string
): Promise<void> {
  const url = `${API}/repos/${repoPath(owner, repo)}/git/refs`
  const response = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${headBranch}`, sha: baseSha }),
  })

  if (response.ok) return

  if (response.status === 422) {
    throw new Error(
      `Branch "${headBranch}" already exists (422). Try pushing again to get a fresh branch name.`
    )
  }
  if (response.status === 403) {
    throw new Error(
      "Forbidden (403). The token may lack Contents: Read & Write on this repo."
    )
  }
  throw new Error(
    await readErrorMessage(
      response,
      `Could not create branch "${headBranch}" (${response.status}).`
    )
  )
}

/** Commit the file onto the head branch (brand-new branch, so no sha needed). */
async function commitFile(
  args: GitHubPushArgs
): Promise<string | null> {
  const url = `${API}/repos/${repoPath(args.owner, args.repo)}/contents/${encodePath(
    args.path
  )}`
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(args.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      content: encodeBase64(args.content),
      branch: args.headBranch,
    }),
  })

  if (response.status === 403) {
    throw new Error(
      "Forbidden (403). The token may lack Contents: Read & Write on this repo."
    )
  }
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Could not commit the annotation file (${response.status}).`
      )
    )
  }

  const body = (await response.json()) as GitHubContentsResponse
  return body.content?.html_url ?? null
}

/** Open the pull request from headBranch into baseBranch. */
async function openPullRequest(
  args: GitHubPushArgs
): Promise<{ url: string | null; number: number | null }> {
  const url = `${API}/repos/${repoPath(args.owner, args.repo)}/pulls`
  const response = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(args.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: args.prTitle,
      head: args.headBranch,
      base: args.baseBranch,
      body: args.prBody,
      maintainer_can_modify: true,
    }),
  })

  if (response.status === 403) {
    throw new Error(
      "Forbidden (403). The token needs Pull requests: Read & Write on this repo."
    )
  }
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Could not open the pull request (${response.status}).`
      )
    )
  }

  const body = (await response.json()) as GitHubPullResponse
  return { url: body.html_url ?? null, number: body.number ?? null }
}

/**
 * Push annotations as a pull request: branch off base, commit the JSON, open a
 * PR. A maintainer reviews and merges, which keeps collaborator contributions
 * gated behind review instead of landing straight on the base branch.
 */
export async function pushAnnotationsToGitHub(
  args: GitHubPushArgs
): Promise<GitHubPushResult> {
  const baseSha = await getBaseSha(
    args.owner,
    args.repo,
    args.baseBranch,
    args.token
  )
  await createBranch(args.owner, args.repo, args.headBranch, baseSha, args.token)
  const fileUrl = await commitFile(args)
  const pr = await openPullRequest(args)

  return {
    prUrl: pr.url,
    prNumber: pr.number,
    headBranch: args.headBranch,
    fileUrl,
  }
}
