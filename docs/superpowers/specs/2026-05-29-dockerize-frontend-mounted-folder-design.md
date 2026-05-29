# Dockerize annotation frontend + mounted video folder — design

**Date:** 2026-05-29 · **Status:** approved, ready for implementation (run AFTER the timeline-lanes
feature merges — both touch `frontend/`). **Area:** `frontend/`, new Docker assets.

## Goal

Ship the annotation web app as a single Docker image an intern can run on **Linux/macOS or Windows**.
The user bind-mounts a host folder of videos; files placed there are **listed in the app** and load
with one click — no per-file OS dialog. Pure client-side today, so the container must also serve the
folder.

## Architecture

Multi-stage image; final runtime is **nginx** (tiny, cross-platform, handles range requests for video
seeking out of the box).

- **Stage 1 (build):** `node:24-alpine`, `corepack`/`pnpm install --frozen-lockfile`, `pnpm build` → `dist/`.
- **Stage 2 (serve):** `nginx:alpine`, copy `dist/` → `/usr/share/nginx/html`, custom `nginx.conf`:
  - `location / { try_files $uri $uri/ /index.html; }`  — SPA fallback.
  - `location /videos/ { alias /videos/; autoindex on; autoindex_format json; add_header Cache-Control "no-store"; }`
    — serves AND JSON-lists the mounted folder (`autoindex_format json` is built into nginx ≥1.7.9).
- Volume mount point: **`/videos`**. Exposed port **80** (→ host `8080`).

### Frontend change (small, additive)
- New `video-store` action `loadRemoteUrl(url: string, filename: string)` — sets `videoUrl = url` and
  `videoFilename = filename` directly (no `createObjectURL`); revokes any prior blob URL. The `<video>`
  plays the same-origin `/videos/...` URL; nginx byte-ranges make seeking work.
- New component **`MountedVideosPicker`** (in `components/layout/`, surfaced from `TopNav` next to
  "Load video", e.g. a "Folder" dropdown/dialog):
  - `GET /videos/` → parses nginx autoindex JSON (`[{name,type,mtime,size}]`),
    filters to video extensions (`.mp4 .mov .avi .mkv .webm` case-insensitive),
    lists names + size; clicking calls `loadRemoteUrl("/videos/" + encodeURIComponent(name), name)`.
  - A "Refresh" affordance re-fetches. Empty/!ok response → friendly inline message
    ("No mounted folder detected — are you running via Docker with -v …:/videos?"). Never throws.
  - When NOT served from the container (dev / no folder), the fetch 404s gracefully and the picker
    shows the hint; the existing local "Load video" file picker is unaffected.

## Cross-platform run

- `docker-compose.yml` with `volumes: ["./videos:/videos"]`, `ports: ["8080:80"]`.
- Repo ships an empty `videos/` (with `.gitkeep`) as the default mount target.
- Commands documented in README:
  - macOS/Linux: `docker compose up` (videos in `./videos`) — or `docker run -v "$PWD/videos:/videos" -p 8080:80 mousercv`.
  - Windows (PowerShell): `docker run -v "${PWD}/videos:/videos" -p 8080:80 mousercv` (Docker Desktop;
    enable file sharing for the drive). Note forward-slash container path.
- `.dockerignore` excludes `node_modules`, `dist`, `.git`, etc., to keep build context small.

## Testing / proof
- `docker build` succeeds; `docker run -v <sample>:/videos -p 8080:80` → app loads at `localhost:8080`,
  `/videos/` returns JSON, a sample video lists and plays/seeks.
- `pnpm build` still green; `pnpm test` still green (the new store action gets a unit test).
- Verify in browser (the picker lists a placed file and loads it).

## Non-goals
- Writing annotation exports back to the mounted folder (output stays via GitHub push + browser
  download). Auth. HTTPS/TLS (intern runs locally). Serving the FastAPI backend (not needed).
