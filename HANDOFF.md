# MouserCV — Intern Handoff & Status

**Last updated:** 2026-05-29 · **Owner:** Dejan · **For:** interns (Marina + new joiners)

This is the "where we stand" page. Read this first. Step-by-step setup is in
[`README.md`](./README.md). JSON format for annotations is in
[`annotations/README.md`](./annotations/README.md).

---

## TL;DR — what interns do

There are **two independent workflows**. An intern can do either or both.

1. **Process a video (Google Colab, GPU).** Open `notebooks/08_dlc_topdown_colab.ipynb`
   in Colab, upload one top-down cage video to their Google Drive, run all cells. Out
   comes a **quality-check report** (per-keypoint reliability, multi-mouse diagnostic,
   annotated preview MP4, body-shape/speed stats) plus two JSON summaries. They paste
   the checklist JSON into the shared sheet. **This is the "generate statistics" path.**

2. **Annotate key frames (local, no GPU).** Run the annotation web app locally
   (`cd frontend && pnpm install && pnpm dev`), load a video file, mark behavior bouts
   with hotkeys 1–7, then **Export JSON** and/or **Push to GitHub**. Pushed files land
   in [`annotations/`](./annotations/). **This is the "annotate interesting frames" path.**

---

## Maturity status (what's actually verified)

| Piece | State | Evidence |
|---|---|---|
| Annotation web app builds & runs locally | ✅ Verified | `pnpm build` green (tsc + vite, 0 errors); runs standalone, no backend needed |
| Local video load (no backend) | ✅ Works | `URL.createObjectURL` in `video-store.ts` |
| Behavior hotkeys 1–7, in/out points, undo/redo, frame-step | ✅ Works | BORIS-grade shortcuts shipped May 2026 |
| CSV export | ✅ Works | existing `TopNav` export |
| **Timestamped JSON export** | ✅ Added this session | see README |
| **In-browser "Push to GitHub"** | ✅ Added this session | fine-grained PAT → GitHub contents API |
| Colab DLC notebook (`08_...`) | ✅ Mature | nbformat-valid, all cells parse, README + TEST docs; **not yet run end-to-end on a GPU** (needs an intern with Colab) |
| Backend (FastAPI) | ⚙️ Optional | not required for either intern workflow; runnable via `uv` if needed |

### The one empirical question still open (intern task #1)
`superanimal_topviewmouse` has **no explicit paw keypoints** — it uses shoulders/hips as
proxies. Our scratch-vs-groom classifier depends on **hind-vs-front limb** discrimination.
The first real job for an intern is to run the notebook on a top-down video and report:
**are the shoulder/hip proxies good enough, or do we switch to `superanimal_quadruped`?**
The notebook is built to answer exactly this (section 7–8 reliability tables; the README
"Comparing the two models" section explains running it twice).

---

## What changed in this handoff session (2026-05-29)

- **Flattened the repo into one git repository.** `frontend/` and `backend/` were
  separate nested git repos with no remotes (frontend had 1 local commit, backend had 0;
  no branches/stashes/unmerged work anywhere — audited before flattening). Now everything
  is one repo so it can be pushed and synced as a unit.
- **Added JSON export + GitHub push** to the annotation tool (see README).
- **Created `annotations/`** as the destination folder for pushed annotation JSON.
- **Wrote `README.md`** (easy install) and this `HANDOFF.md`.
- **Excluded clutter** from the repo (empty auto-generated `CLAUDE.md` stub trees:
  `protain/`, `preseed_draft/`, the stray nested `mousercv/`) so the handoff repo is clean.
- Repo pushed **private** to GitHub.

---

## How to walk an intern through it (~15 min)

1. **Repo access** — add them as a collaborator on the private `mousercv` GitHub repo.
2. **GitHub token** — have them create a *fine-grained* Personal Access Token scoped to
   **only** the `mousercv` repo with **Contents: Read & Write**. They paste it once into
   the annotation app's "Push to GitHub" dialog (stored in their browser only).
3. **Annotation app** — walk through `README.md` §"Annotation tool": `pnpm install`,
   `pnpm dev`, load a video, mark a few bouts (1=groom, 2=scratch…), Export JSON, Push.
   Confirm the file appears under `annotations/` on GitHub.
4. **Colab notebook** — open `notebooks/08_dlc_topdown_colab.ipynb` from GitHub in Colab,
   set GPU runtime, point it at one video on their Drive, run. Walk through the
   `08_dlc_topdown_colab_README.md` "What to look at, section by section" table.
5. **Behavior definitions** — point them at `annotations/README.md` (HIND = scratch,
   FRONT = groom). This is the single most important rule.

---

## Open items / next decisions (not blocking handoff)

- [ ] Replace the `REPLACE_ME` shared Google Sheet link in `08_dlc_topdown_colab_README.md`
      with the real sheet once created.
- [ ] Decide on a multi-mouse tracker (SuperAnimal does no identity correction
      out-of-the-box — section 9 of the notebook will show swaps).
- [ ] After interns label a handful of videos, revisit the v2 behavior-detection spec
      under the **top-down** perspective (the spec was written for front-angle —
      see `docs/superpowers/specs/2026-04-01-behavior-detection-v2-design.md`).
- [ ] Optional: backend persistence of annotations (currently localStorage + GitHub push).
