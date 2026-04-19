# LOCAL_SETUP

Cross-platform setup guide for running this repository locally on macOS or native Windows.

## Prerequisites

Both platforms need:

- `node v22.19.0` or another Node 22.x release
- `npm v10.9.3` or another npm 10.x release
- `python3.11 v3.11.14`
- `uv v0.9.x`
- `git`
- `ffmpeg` with `ffprobe`
- either Hugging Face access to `facebook/tribev2` and the upstream gated dependencies, or a Gemini API key for the fallback backend

macOS notes:

- Apple Silicon is supported as a baseline
- install `ffmpeg` and `ffprobe` with Homebrew

Windows notes:

- use native Windows Python and `py -3.11`
- install native Windows `ffmpeg` and `ffprobe` and put both on `PATH`
- do not route the workflow through WSL
- keep `HUGGINGFACE_HUB_TOKEN` in `.env` or the environment because the launcher does not take a token flag

## Repository setup

macOS:

```bash
git clone https://github.com/sryerabati/claudehackosu26.git
cd claudehackosu26
cp .env.example .env
npm install
cd apps/api
uv sync --python 3.11
cd ../..
```

Windows PowerShell:

```powershell
git clone https://github.com/sryerabati/claudehackosu26.git
cd claudehackosu26
Copy-Item .env.example .env
npm install
cd apps/api
uv sync --python 3.11
cd ../..
```

## Verify the machine tooling

macOS:

```bash
node -v
npm -v
python3.11 --version
uv --version
ffmpeg -version | head -n 1
ffprobe -version | head -n 1
```

Windows PowerShell:

```powershell
node -v
npm -v
py -3.11 --version
uv --version
ffmpeg -version
ffprobe -version
```

Expected on the target baseline:

- `node v22.19.0`
- `python3.11.14`
- `uv 0.9.x`
- Homebrew `ffmpeg 8.x`

## Backend configuration

Choose one backend in the repo-root `.env`.

TRIBE mode:

```bash
ANALYSIS_BACKEND=tribe
HUGGINGFACE_HUB_TOKEN=hf_your_token_here
```

Gemini fallback mode:

```bash
ANALYSIS_BACKEND=gemini
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-pro
```

Put `GEMINI_API_KEY` in the repo-root `.env`. The backend does not read it from `.env.example`.

## TRIBE v2 setup and local download

The TRIBE backend depends on the official GitHub repo directly, not PyPI.

```bash
cd apps/api
uv sync --python 3.11
```

The `pyproject.toml` pins:

- `tribev2 @ git+https://github.com/facebookresearch/tribev2.git@72399081ed3f1040c4d996cefb2864a4c46f5b8e`

The launcher and backend read tokens from `.env` or the active environment only; there is no CLI override. The first real TRIBE analysis request or an explicit launcher `download` command triggers the model download into `TRIBE_CACHE_DIR`, and that download still requires gated Hugging Face access.

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py probe
python3.11 apps/api/scripts/run_tribe_mac.py download
```

Native Windows example:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py probe
py -3.11 apps\api\scripts\run_tribe_windows.py download
```

## Serve the model-backed backend

"Serve" means start the FastAPI backend that loads TRIBE in-process and exposes `/api/*` and `/storage/*`.

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
```

## Environment variables

```bash
API_PORT=8000
WEB_PORT=3000
TRIBE_UPLOADS_DIR=./storage/uploads
TRIBE_RESULTS_DIR=./storage/analyses
TRIBE_CACHE_DIR=./storage/cache
TRIBE_ALLOWED_ORIGIN=http://localhost:3000
ANALYSIS_BACKEND=tribe
TRIBE_DEVICE=auto
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-pro
TRIBE_MAX_VIDEO_SECONDS=120
TRIBE_MAX_UPLOAD_BYTES=50000000
TRIBE_POLL_INTERVAL_MS=2500
NEXT_PUBLIC_CONVEX_URL=
CONVEX_SITE_URL=
CONVEX_SERVICE_SECRET=
REQUIRE_CONVEX_IDS=true
HUGGINGFACE_HUB_TOKEN=
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe
```

Notes:

- Keep `TRIBE_DEVICE=auto` on this Mac baseline unless you explicitly want to experiment with `mps`.
- CUDA is the recommended faster path, but the app should still run locally without it.
- `ANALYSIS_BACKEND=gemini` skips the TRIBE model download path and uses the remote content-analysis backend instead.
- `NEXT_PUBLIC_CONVEX_URL` is populated automatically by `npx convex dev` in `apps/web`.
- Leave `REQUIRE_CONVEX_IDS=true` for the authenticated web flow; only disable it for intentional local API-only smoke tests.

## Run the website locally

Once the backend is already running, start the web app from the repo root:

macOS:

```bash
npm run dev:web
```

Windows PowerShell:

```powershell
npm run dev:web
```

Then open `http://localhost:3000`.

macOS convenience shortcut:

```bash
npm run dev
```

That shortcut starts both services together, but the cross-platform setup flow is still:

1. download the model
2. serve the backend
3. run the website in a second terminal

## Verification checklist

1. `GET http://localhost:8000/api/health` returns JSON.
2. `http://localhost:3000` loads the landing page.
3. The landing page shows health status from the backend.
4. Uploading a short MP4 creates `storage/uploads/<uploadId>/source.mp4` and `thumbnail.jpg`.
5. A completed analysis creates:
   - `storage/analyses/<analysisId>/record.json`
   - `payload.json`
   - `events.csv`
   - `segments.json`
   - `cut-list.json`
   - `preds.npy` when `ANALYSIS_BACKEND=tribe`
   - `provider-response.json` when `ANALYSIS_BACKEND=gemini`
6. The analysis page renders timeline, heat-strip, scores, markers, and export links.

## Troubleshooting

- `tribev2 package is not installed`
  - Run `cd apps/api && uv sync --python 3.11`
- `TRIBE v2 could not be imported`
  - Confirm you are using `python3.11`, not the system `python3`
- `HUGGINGFACE_HUB_TOKEN is not set`
  - Add the token to `.env` or the active environment and restart the backend
- `ffmpeg` or `ffprobe` missing
  - Install with `brew install ffmpeg`
- Native Windows launcher failures
  - Confirm you are using `py -3.11` and native Windows `ffmpeg`/`ffprobe`, not WSL
- Backend cannot reach frontend
  - Confirm `TRIBE_ALLOWED_ORIGIN=http://localhost:3000`
- Frontend cannot reach backend
  - Confirm `API_PORT` matches the backend and that the Next rewrites are active
- Slow inference
  - This is expected on CPU or Apple Silicon; CUDA is faster
- Storage/path permission issues
  - Confirm the repo has write access to `storage/uploads`, `storage/analyses`, and `storage/cache`
