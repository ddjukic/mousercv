import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  encodeBase64,
  pushAnnotationsToGitHub,
  type GitHubPushArgs,
} from "./github"

const ARGS: GitHubPushArgs = {
  owner: "ddjukic",
  repo: "mousercv",
  baseBranch: "main",
  headBranch: "annotations/cageA-2026-05-30-x7k2",
  path: "annotations/cageA-annotations-2026-05-30.json",
  content: '{"schema":"mousercv-annotations/v1"}',
  message: "annotations: cageA (3 bouts)",
  prTitle: "Annotations: cageA (3 bouts)",
  prBody: "Adds annotations for cageA.",
  token: "github_pat_test",
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Route a fetch call to a label by URL + method so tests can assert order. */
function routeOf(url: string, method: string): string {
  if (url.endsWith("/git/ref/heads/main")) return "getRef"
  if (url.endsWith("/git/refs") && method === "POST") return "createRef"
  if (url.includes("/contents/") && method === "PUT") return "putContents"
  if (url.endsWith("/pulls") && method === "POST") return "createPull"
  return `unknown:${method}:${url}`
}

interface Handlers {
  getRef?: () => Response
  createRef?: () => Response
  putContents?: () => Response
  createPull?: () => Response
}

function installFetch(handlers: Handlers): {
  calls: { route: string; url: string; method: string; body: unknown }[]
} {
  const calls: { route: string; url: string; method: string; body: unknown }[] =
    []
  const defaults: Required<Handlers> = {
    getRef: () => json(200, { object: { sha: "BASESHA123" } }),
    createRef: () =>
      json(201, { ref: `refs/heads/${ARGS.headBranch}`, object: { sha: "BASESHA123" } }),
    putContents: () =>
      json(201, {
        content: { html_url: "https://github.com/ddjukic/mousercv/blob/x/y.json" },
        commit: { html_url: "https://github.com/ddjukic/mousercv/commit/abc" },
      }),
    createPull: () =>
      json(201, {
        html_url: "https://github.com/ddjukic/mousercv/pull/42",
        number: 42,
      }),
  }
  const merged = { ...defaults, ...handlers }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      const method = (init?.method ?? "GET").toUpperCase()
      const route = routeOf(url, method)
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      calls.push({ route, url, method, body })
      const handler = (merged as Record<string, () => Response>)[route]
      if (!handler) throw new Error(`Unrouted request: ${method} ${url}`)
      return handler()
    })
  )

  return { calls }
}

describe("encodeBase64", () => {
  it("round-trips unicode safely", () => {
    const text = "grooming 🐭 — scratched? ✓"
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encodeBase64(text)), (c) => c.charCodeAt(0))
    )
    expect(decoded).toBe(text)
  })
})

describe("pushAnnotationsToGitHub (PR flow)", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("creates branch, commits file, opens PR — in that order", async () => {
    const { calls } = installFetch({})

    const result = await pushAnnotationsToGitHub(ARGS)

    expect(calls.map((c) => c.route)).toEqual([
      "getRef",
      "createRef",
      "putContents",
      "createPull",
    ])
    expect(result).toEqual({
      prUrl: "https://github.com/ddjukic/mousercv/pull/42",
      prNumber: 42,
      headBranch: ARGS.headBranch,
      fileUrl: "https://github.com/ddjukic/mousercv/blob/x/y.json",
    })
  })

  it("branches off the base sha and commits onto the head branch", async () => {
    const { calls } = installFetch({})

    await pushAnnotationsToGitHub(ARGS)

    const createRef = calls.find((c) => c.route === "createRef")!
    expect(createRef.body).toMatchObject({
      ref: `refs/heads/${ARGS.headBranch}`,
      sha: "BASESHA123",
    })
    const put = calls.find((c) => c.route === "putContents")!
    expect(put.body).toMatchObject({ branch: ARGS.headBranch })
    expect((put.body as { content: string }).content).toBe(
      encodeBase64(ARGS.content)
    )
  })

  it("targets the PR from head into base", async () => {
    const { calls } = installFetch({})

    await pushAnnotationsToGitHub(ARGS)

    const pull = calls.find((c) => c.route === "createPull")!
    expect(pull.body).toMatchObject({
      head: ARGS.headBranch,
      base: "main",
      title: ARGS.prTitle,
    })
  })

  it("throws a clear error when the base branch is missing (404)", async () => {
    installFetch({ getRef: () => json(404, { message: "Not Found" }) })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow(
      /Base branch "main" not found/
    )
  })

  it("throws on token without repo read (401)", async () => {
    installFetch({ getRef: () => json(401, { message: "Bad credentials" }) })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow(
      /Invalid or expired token \(401\)/
    )
  })

  it("explains a branch-name collision (422 on create ref)", async () => {
    installFetch({
      createRef: () => json(422, { message: "Reference already exists" }),
    })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow(
      /already exists \(422\)/
    )
  })

  it("flags missing Contents write on commit (403)", async () => {
    installFetch({
      putContents: () => json(403, { message: "Resource not accessible" }),
    })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow(
      /Contents: Read & Write/
    )
  })

  it("flags missing Pull requests write when opening the PR (403)", async () => {
    installFetch({
      createPull: () => json(403, { message: "Resource not accessible" }),
    })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow(
      /Pull requests: Read & Write/
    )
  })

  it("does not open a PR if the commit failed", async () => {
    const { calls } = installFetch({
      putContents: () => json(403, { message: "nope" }),
    })
    await expect(pushAnnotationsToGitHub(ARGS)).rejects.toThrow()
    expect(calls.some((c) => c.route === "createPull")).toBe(false)
  })
})
