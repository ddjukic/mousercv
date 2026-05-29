import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  XCircle,
} from "lucide-react"
import { useVideoStore } from "@/stores/video-store"
import { useAnnotationStore } from "@/stores/annotation-store"
import {
  buildAnnotationsExport,
  fileTimestamp,
  serializeAnnotationsExport,
  videoStem,
} from "@/lib/annotations-export"
import { pushAnnotationsToGitHub } from "@/lib/github"
import {
  clearGitHubToken,
  loadGitHubSettings,
  loadGitHubToken,
  saveGitHubSettings,
  saveGitHubToken,
  type GitHubSettings,
} from "@/lib/github-settings"

interface PushToGitHubDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PushStatus =
  | { kind: "idle" }
  | { kind: "pushing" }
  | { kind: "success"; htmlUrl: string | null; path: string }
  | { kind: "error"; message: string }

interface FieldProps {
  id: string
  label: string
  value: string
  type?: "text" | "password"
  placeholder?: string
  helper?: string
  onChange: (value: string) => void
}

function Field({
  id,
  label,
  value,
  type = "text",
  placeholder,
  helper,
  onChange,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={type === "password" ? "off" : undefined}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground",
          "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          "placeholder:text-muted-foreground/60"
        )}
      />
      {helper ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

export function PushToGitHubDialog({
  open,
  onOpenChange,
}: PushToGitHubDialogProps) {
  const idPrefix = useId()
  const [settings, setSettings] = useState<GitHubSettings>(() =>
    loadGitHubSettings()
  )
  const [token, setToken] = useState<string>(() => loadGitHubToken())
  const [status, setStatus] = useState<PushStatus>({ kind: "idle" })

  const behaviors = useAnnotationStore((s) => s.behaviors)
  const tracks = useAnnotationStore((s) => s.tracks)
  const fps = useVideoStore((s) => s.fps)
  const duration = useVideoStore((s) => s.duration)
  const videoFilename = useVideoStore((s) => s.videoFilename)

  const updateField = (key: keyof GitHubSettings) => (value: string) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      saveGitHubSettings(next)
      return next
    })
  }

  const handleTokenChange = (value: string) => {
    setToken(value)
    saveGitHubToken(value)
  }

  const handleForgetToken = () => {
    setToken("")
    clearGitHubToken()
  }

  const canPush =
    behaviors.length > 0 &&
    token.trim().length > 0 &&
    settings.owner.trim().length > 0 &&
    settings.repo.trim().length > 0 &&
    settings.branch.trim().length > 0 &&
    status.kind !== "pushing"

  const handlePush = async () => {
    setStatus({ kind: "pushing" })
    try {
      const exportData = buildAnnotationsExport({
        segments: behaviors,
        tracks,
        fps,
        videoFilename,
        duration,
        annotator: settings.annotator.trim(),
      })
      const jsonString = serializeAnnotationsExport(exportData)
      const stem = videoStem(videoFilename)
      const ts = fileTimestamp()
      const folder = settings.folder.trim().replace(/^\/+|\/+$/g, "")
      const filename = `${stem}-annotations-${ts}.json`
      const path = folder ? `${folder}/${filename}` : filename

      const result = await pushAnnotationsToGitHub({
        owner: settings.owner.trim(),
        repo: settings.repo.trim(),
        branch: settings.branch.trim(),
        path,
        content: jsonString,
        message: `annotations: ${stem} (${behaviors.length} bouts)`,
        token: token.trim(),
      })

      setStatus({ kind: "success", htmlUrl: result.htmlUrl, path })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Network error while contacting GitHub."
      setStatus({ kind: "error", message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Push annotations to GitHub
          </DialogTitle>
          <DialogDescription>
            Commits {behaviors.length} bout{behaviors.length === 1 ? "" : "s"} as
            a timestamped JSON file directly to the repository.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id={`${idPrefix}-owner`}
              label="Owner"
              value={settings.owner}
              onChange={updateField("owner")}
            />
            <Field
              id={`${idPrefix}-repo`}
              label="Repo"
              value={settings.repo}
              onChange={updateField("repo")}
            />
            <Field
              id={`${idPrefix}-branch`}
              label="Branch"
              value={settings.branch}
              onChange={updateField("branch")}
            />
            <Field
              id={`${idPrefix}-folder`}
              label="Folder"
              value={settings.folder}
              onChange={updateField("folder")}
            />
          </div>

          <Field
            id={`${idPrefix}-annotator`}
            label="Annotator (optional)"
            value={settings.annotator}
            placeholder="Your name"
            onChange={updateField("annotator")}
          />

          <Field
            id={`${idPrefix}-token`}
            label="Token"
            type="password"
            value={token}
            placeholder="github_pat_..."
            helper="Fine-grained PAT scoped to the mousercv repo with Contents: Read & Write. Stored in this browser's localStorage."
            onChange={handleTokenChange}
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleForgetToken}
              disabled={token.length === 0}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              Forget token
            </button>
          </div>

          {status.kind === "success" ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span>Pushed {status.path}</span>
                {status.htmlUrl ? (
                  <a
                    href={status.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    View on GitHub
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {status.kind === "error" ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{status.message}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handlePush}
            disabled={!canPush}
            className="gap-1.5"
          >
            {status.kind === "pushing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitBranch className="h-3.5 w-3.5" />
            )}
            {status.kind === "pushing" ? "Pushing…" : "Push"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
