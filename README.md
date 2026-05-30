# MouserCV

Mouse-behavior video analysis for the Bauer-lab EGFR pruritus (itch) model. Two things
live here that interns use:

1. **A Colab notebook** that runs pose estimation on a top-down cage video and produces a
   quality-check report. → `notebooks/08_dlc_topdown_colab.ipynb`
2. **A local annotation web app** to label behavior bouts and push the labels to GitHub.
   → `frontend/`

New here? Read [`HANDOFF.md`](./HANDOFF.md) first. Behavior definitions and the
annotation JSON format are in [`annotations/README.md`](./annotations/README.md).

---

## A. Annotation tool — run it locally (no GPU, no backend)

This is the part you install on your own laptop.

### 1. Prerequisites (one time)

- **Node.js 20+** — install via [nvm](https://github.com/nvm-sh/nvm):
  `nvm install 24 && nvm use 24`
- **pnpm** — `npm install -g pnpm` (or `corepack enable && corepack prepare pnpm@latest --activate`)

### 2. Get the code

```bash
git clone https://github.com/ddjukic/mousercv.git
cd mousercv/frontend          # IMPORTANT: run pnpm from inside frontend/, not the repo root
```

### 3. Install & run

```bash
pnpm install
pnpm dev
```

Open the URL it prints (usually http://localhost:5173).

### Run with Docker

**Collaborators — pull the prebuilt image (no build, no login needed).** A multi-arch
image (amd64 + arm64) is published publicly to GHCR by CI on every push to `main`. Put
videos in a local `videos/` folder and run:

```bash
docker run -v "$PWD/videos:/videos" -p 8080:80 ghcr.io/ddjukic/mousercv:latest
```

Windows PowerShell:

```powershell
docker run -v "${PWD}/videos:/videos" -p 8080:80 ghcr.io/ddjukic/mousercv:latest
```

**Build it yourself instead** (from a checkout of this repo):

```bash
docker compose up
# or:
docker build -f Dockerfile.frontend -t mousercv .
docker run -v "$PWD/videos:/videos" -p 8080:80 mousercv
```

Open http://localhost:8080 and use **Folder** to load videos from the mounted folder.

### 4. Annotate

1. Click **Load video** → pick a local `.mov` / `.mp4`. (The video never leaves your
   machine — it is not uploaded.)
2. Select a mouse track in the sidebar.
3. Play/pause with **Space**, step frames with **←/→** (or `,` / `.`), jog with **J/K/L**.
4. Mark a bout: press **I** at the start, scrub to the end, press **O**, then press the
   behavior hotkey:

   | Key | Behavior | | Key | Behavior |
   |---|---|---|---|---|
   | **1** | Grooming (front paws) | | **5** | Uncertain |
   | **2** | Scratching (hind limbs) | | **6** | Hypergrooming |
   | **3** | Rearing | | **7** | Head shake |
   | **4** | Idle | | **?** | Show all shortcuts |

   Rule of thumb: **scratch = HIND limbs, groom = FRONT paws.** When unsure, mark
   `Uncertain` and add a note.
5. **Z / Y** = undo / redo. Your work autosaves to the browser as you go.

### 5. Save your work

- **Export JSON** — downloads a timestamped `*.json` file to your computer.
- **Push to GitHub** — opens a pull request that adds the JSON to the repo's
  `annotations/` folder (see setup below). A maintainer reviews and merges it, so
  nothing lands on `main` unreviewed. This is the preferred way — no `git` needed on
  your machine.

---

## B. Push to GitHub — one-time token setup

So you can push annotations from the browser:

1. Get added as a **collaborator** on the `mousercv` repo (ask Dejan).
2. Create a **fine-grained Personal Access Token**:
   GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
   - **Repository access:** Only select repositories → `mousercv`.
   - **Permissions:** Repository permissions → **Contents → Read and write** *and*
     **Pull requests → Read and write**.
   - Copy the token (starts with `github_pat_…`).
3. In the annotation app, click **Push to GitHub**, paste the token (owner/repo/base
   branch are pre-filled), optionally set your name as "annotator", and click **Push**.
   The token is stored only in your browser's localStorage; use **Forget token** to clear it.

Each push creates a fresh branch, commits a new timestamped file under `annotations/`,
and **opens a pull request** into `main` — nothing is overwritten and nothing merges
without a maintainer's review. The dialog links straight to the PR it opened.

> **Maintainers:** to *enforce* review (so collaborators can't merge their own PRs),
> enable a branch protection / ruleset on `main` requiring a pull-request review.

---

## C. Processing notebook — Google Colab (GPU)

Full guide: [`notebooks/08_dlc_topdown_colab_README.md`](./notebooks/08_dlc_topdown_colab_README.md).
Short version:

1. Open `notebooks/08_dlc_topdown_colab.ipynb` from GitHub in
   **Google Colab** (right-click in Drive → Open with → Colaboratory, or use the
   "Open in Colab" badge).
2. **Runtime → Change runtime type → GPU** (T4 is fine).
3. Put **one** top-down video on your Google Drive under `MyDrive/mousercv/videos/`.
4. Run all cells. Outputs (reliability tables, annotated preview MP4, JSON summaries) are
   written to `MyDrive/mousercv/dlc_topdown_results/`.
5. Fill in the checklist JSON (section 12) and paste it into the shared sheet.

A 17-min video takes ~25–90 min on a T4. Default `MAX_SECONDS = 60` does a 1–3 min sanity
pass first; set it to `None` for the full video.

---

## D. Backend (optional — not needed for the above)

The FastAPI backend is **not required** for either intern workflow. If you do need it:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Requires Python 3.13 and [uv](https://docs.astral.sh/uv/). Config via `.env`
(see `.env.example`).

---

## Repo layout

```
frontend/    annotation web app (React + Vite + pnpm)  ← interns run this locally
notebooks/   Colab notebooks; 08_dlc_topdown_colab is the intern one
annotations/ pushed annotation JSON lands here
backend/     FastAPI service (optional)
docs/        design specs & plans
data/        videos (gitignored — not in the repo)
models/      model weights (gitignored)
```
