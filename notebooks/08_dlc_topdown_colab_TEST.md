# 08_dlc_topdown_colab — Verification Log

## Target versions

| Package | Pinned how | Notes |
|---|---|---|
| `deeplabcut` | `pip install --pre deeplabcut` | Matches the official DLC SuperAnimal Colab demo install line (`%pip install --pre deeplabcut`). |
| `torch` | Whatever Colab ships (currently 2.x with CUDA 12.x). | DLC PyTorch backend; not pinned in the official demo either. |
| `opencv-python-headless` | latest | Used for thumbnail/preview rendering. |
| `pandas`, `matplotlib`, `numpy`, `scipy`, `tqdm` | latest | Standard. |

## Sources cited

1. Official DeepLabCut SuperAnimal Colab notebook — install line + `video_inference_superanimal` call signature: `https://github.com/DeepLabCut/DeepLabCut/blob/main/examples/COLAB/COLAB_DEMO_SuperAnimal.ipynb` (raw: `https://raw.githubusercontent.com/DeepLabCut/DeepLabCut/main/examples/COLAB/COLAB_DEMO_SuperAnimal.ipynb`).
2. DeepLabCut Model Zoo docs — confirms `superanimal_quadruped` and `superanimal_topviewmouse` are the two relevant SuperAnimal model names, and that `model_name="hrnet_w32"` + `detector_name="fasterrcnn_resnet50_fpn_v2"` is the supported top-down pair: `https://deeplabcut.github.io/DeepLabCut/docs/ModelZoo.html`.
3. SuperAnimal-TopViewMouse model card — confirms the model is for **top-down lab-mouse footage** with **27 keypoints** (this is why the notebook defaults to TopViewMouse rather than Quadruped despite the user's brief): `https://huggingface.co/mwmathis/DeepLabCutModelZoo-SuperAnimal-TopViewMouse`.
4. SuperAnimal-Quadruped model card — 39 keypoints, mostly **side-view** training data: `https://huggingface.co/mwmathis/DeepLabCutModelZoo-SuperAnimal-Quadruped`.
5. DLClibrary keypoint config — the canonical bodypart names per model live in `dlclibrary/dlcmodelzoo/superanimal_configs/{superquadruped.yaml, supertopview.yaml}`. Used to build the `MODEL_KP_MAP` table in section 7. `https://github.com/DeepLabCut/DLClibrary/tree/main/dlclibrary/dlcmodelzoo/superanimal_configs`.
6. SuperAnimal Nature Communications paper — `https://www.nature.com/articles/s41467-024-48792-2` (background on training set composition; informs the "TopViewMouse for top-down, Quadruped for side-view" recommendation).

## Verification I did locally (no GPU, no Drive)

1. **JSON well-formed:**
   ```
   uv run --with nbformat python3 -c "import nbformat; nb=nbformat.read('notebooks/08_dlc_topdown_colab.ipynb', as_version=4); nbformat.validate(nb); print(len(nb.cells))"
   ```
   → `33` cells, no validation errors.

2. **Cell IDs normalized:** ran `nbformat.validator.normalize(nb)` once and rewrote the file so every cell has a stable id (avoids the `MissingIDFieldWarning` that nbformat 5.10+ will turn into a hard error).

3. **All code cells parse with `ast.parse`** after stripping `%`-magics and `!`-shell escapes:
   ```
   Syntax errors: 0
   ```
   This catches typos and broken indentation but cannot catch import errors at runtime.

4. **Non-DLC, non-Colab imports resolve** in a clean uv env:
   ```
   uv run --with numpy --with pandas --with matplotlib --with opencv-python-headless --with scipy --with tqdm python3 -c "import numpy, pandas, matplotlib, cv2, scipy, tqdm; from scipy.spatial import ConvexHull"
   ```
   → succeeds. These are the imports used in cells 8, 12, 16, 17, 21, 24, 26, 28.

5. **Source video paths exist** on the dev machine:
   - `/Users/dejandukic/dejan_dev/mousercv/data/videos/CV analysis project/Cage 17082 video.MOV` — 1.2 GB, present.
   - `/Users/dejandukic/dejan_dev/mousercv/data/videos/CV analysis project/Cage 17083 video.MOV` — 2.3 GB, present.

## What I could NOT verify without Colab

- **Cell 2 (`%pip install --pre deeplabcut`)** — actual install resolution depends on Colab's pre-installed PyTorch + Python. Cannot replicate locally without burning GPU minutes; this matches the install line of the official DLC SuperAnimal Colab notebook so it should resolve identically.
- **Cell 3 (CUDA check)** — only meaningful inside a Colab GPU runtime.
- **Cell 4 (`drive.mount`)** — `google.colab.drive` only exists in Colab.
- **Cell 14 (`deeplabcut.video_inference_superanimal`)** — needs the model weights download (≈ 1.5 GB) and a GPU. The call signature matches the current upstream Colab demo.
- **Cell 16 (h5 file glob)** — depends on the exact filename DLC writes; the glob pattern is permissive (`*{MODEL}*.h5` falling back to `*.h5`) so the most common naming changes will still resolve.
- **Cells 23, 26 (multi-animal columns)** — only exercised when DLC returns a 4-level MultiIndex (multi-animal mode). Both branches (`multi_animal=True/False`) are present in the code.

## Risks the intern should flag back if they see them

1. **`superanimal_topviewmouse` lacks explicit paw keypoints** (uses `left_shoulder`/`right_shoulder`/`left_hip`/`right_hip`). The notebook surfaces this as `OK (proxy)` in section 7 — if the intern reports proxies are unreliable, we need to switch the default to `superanimal_quadruped` for paw-sensitive behaviors.
2. **Identity swaps** in multi-animal mode are not corrected by SuperAnimal out-of-the-box (no SORT/Bytetrack post-processing). Section 9 will reveal this and the team needs to decide on a tracker.
3. **`video_adapt=True` doubles inference time** but improves accuracy. The default is `False` for the first sanity pass; once the perspective is confirmed, future runs should turn it on.

## Files delivered

- `/Users/dejandukic/dejan_dev/mousercv/notebooks/08_dlc_topdown_colab.ipynb` (33 cells; nbformat-valid; all code cells parse).
- `/Users/dejandukic/dejan_dev/mousercv/notebooks/08_dlc_topdown_colab_README.md` (one-page intern guide).
- `/Users/dejandukic/dejan_dev/mousercv/notebooks/08_dlc_topdown_colab_TEST.md` (this file).
