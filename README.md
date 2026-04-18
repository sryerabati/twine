# Content Analysis Lab

Hackathon MVP for uploading one or two short-form videos, running either a local TRIBE workflow or a temporary remote content-analysis backend, and turning the result into a creator-oriented timeline workspace.

## What this app does

- Upload a short MP4 and run full-video content analysis through the configured backend.
- Convert raw fsaverage5 vertex predictions into:
  - global activation
  - left/right hemisphere summaries
  - rolling variance, spikes, and drops
  - 64-bin hemisphere heat-strips
- Layer on app-side heuristics for:
  - hook strength
  - pacing
  - deadspace suggestions
  - compare-mode winner summaries
  - a clearly labeled viral potential estimate

## Backend modes

- `ANALYSIS_BACKEND=tribe`
  - uses the official TRIBE path locally through `TribeModel.from_pretrained(...)`, `get_events_dataframe(...)`, and `predict(...)`
  - requires `HUGGINGFACE_HUB_TOKEN` plus gated Hugging Face access
- `ANALYSIS_BACKEND=gemini`
  - sends the full uploaded MP4 to Gemini Files API and normalizes the structured response into the same analysis contract
  - requires `GEMINI_API_KEY` in the repo-root `.env`
  - is a temporary content-analysis fallback, not cortical prediction

## What is direct model output vs app heuristic

- Direct TRIBE output when `ANALYSIS_BACKEND=tribe`:
  - per-segment cortical response predictions on the average-subject fsaverage5 mesh
  - segment/event timing derived by the official TRIBE pipeline
- App-side heuristics in both modes:
  - marker labels such as `strong_hook`, `attention_drop`, and `deadspace_candidate`
  - deadspace cut ranges
  - score panels
  - viral potential estimate
  - compare winner and recommendation text

## Important disclaimer

- This is a non-commercial demo and must be treated as such under TRIBE v2's CC BY-NC 4.0 license.
- The app visualizes predicted average-subject brain-response signals and derived heuristics.
- In fallback mode it presents a temporary content-analysis proxy, not real cortical prediction.
- It is not a medical device.
- It is not mind reading.
- It does not claim that TRIBE v2 directly predicts virality.

## Repo structure

- `apps/web` – Next.js App Router frontend, TypeScript, Tailwind, shadcn/ui, Recharts
- `apps/api` – FastAPI backend, `uv`-managed Python 3.11 environment, local file persistence
- `storage` – local uploads, analyses, and cache directories

## Cross-Platform Local Run Guide

Use this flow if you want to:

- download and warm the TRIBE model locally
- serve the backend that hosts the model-backed API
- run the website on your machine

Important: there is no separate standalone inference microservice in this repo. "Serve the model" means starting the FastAPI backend, which loads TRIBE in-process and exposes `/api/*` plus `/storage/*`.

Detailed machine notes are in [LOCAL_SETUP.md](/Users/shreyas/Desktop/projects/claudehackosu26/LOCAL_SETUP.md). Backend-only details are in [apps/api/README.md](/Users/shreyas/Desktop/projects/claudehackosu26/apps/api/README.md). Daily operations and troubleshooting are in [RUNBOOK.md](/Users/shreyas/Desktop/projects/claudehackosu26/RUNBOOK.md).

### Prerequisites

Both macOS and native Windows need:

- Node.js 22.x
- npm 10.x
- Python 3.11
- `uv`
- `ffmpeg` and `ffprobe` on `PATH`
- a Hugging Face account with access to `facebook/tribev2` and the gated upstream dependencies it pulls in

Windows note:

- Use native Windows Python and the Windows launcher in `apps/api/scripts/run_tribe_windows.py`.
- Do not route the setup through WSL.

### 1. Clone the repo and install dependencies

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

### 2. Configure the backend you want in `.env`

TRIBE mode:

```dotenv
ANALYSIS_BACKEND=tribe
HUGGINGFACE_HUB_TOKEN=hf_your_token_here
```

Gemini fallback mode:

```dotenv
ANALYSIS_BACKEND=gemini
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-pro
```

Put `GEMINI_API_KEY` in the repo-root `.env`. Do not put it only in `.env.example`.

### 3. Probe the runtime and download the model

The `download` command warm-loads TRIBE and populates `TRIBE_CACHE_DIR` before you open the site.

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py probe
python3.11 apps/api/scripts/run_tribe_mac.py download
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py probe
py -3.11 apps\api\scripts\run_tribe_windows.py download
```

If you skip `download`, the first real analysis request will trigger the same model load on demand.

### 4. Serve the model-backed backend locally

Keep this running in its own terminal.

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
```

By default this starts the API on `http://127.0.0.1:8000` using `API_PORT` from `.env`.

### 5. Run the website locally

Open a second terminal at the repo root.

macOS:

```bash
npm run dev:web
```

Windows PowerShell:

```powershell
npm run dev:web
```

Then open [http://localhost:3000](http://localhost:3000).

macOS shortcut:

```bash
npm run dev
```

That shortcut starts both the API and the web app together, but the explicit two-terminal flow above is the cross-platform path to follow. On native Windows, prefer the backend runner plus `npm run dev:web` instead of the root `npm run dev` shortcut.

### 6. Optional smoke-test analysis

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py analyze --video ./sample-tribe.mp4
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py analyze --video .\sample-tribe.mp4
```

This runs one MP4 through the same upload, thumbnail, analysis, artifact, and scoring pipeline used by the site.

### 7. Verify the stack

- `http://127.0.0.1:8000/api/health` returns JSON.
- `http://localhost:3000` loads the landing page.
- The landing page shows backend health instead of connection errors.
- Uploading a short MP4 produces files in `storage/uploads` and `storage/analyses`.
- Completed analysis pages can load their charts, heat-strip, markers, and export links.

## Environment variables

- `API_PORT` – backend port
- `WEB_PORT` – frontend port
- `TRIBE_UPLOADS_DIR` – upload storage directory
- `TRIBE_RESULTS_DIR` – analysis artifact directory
- `TRIBE_CACHE_DIR` – TRIBE cache directory
- `TRIBE_ALLOWED_ORIGIN` – CORS origin for the frontend
- `ANALYSIS_BACKEND` – `tribe` or `gemini`
- `TRIBE_DEVICE` – `auto`, `cpu`, `cuda`, or optional manual `mps`
- `GEMINI_API_KEY` – required for the Gemini content-analysis fallback
- `GEMINI_MODEL` – defaults to `gemini-2.5-pro`
- `TRIBE_MAX_VIDEO_SECONDS` – upload duration cap for the MVP
- `HUGGINGFACE_HUB_TOKEN` – required for real TRIBE model access

## Known limitations

- Apple Silicon local execution is supported as a baseline, but inference may be slow.
- The repo does not bundle a demo clip; use your own short MP4.
- Full 3D brain rendering is not required for this MVP; the baseline visualization is the activation chart plus the 2D heat-strip.
- Real TRIBE execution depends on the local Python environment and Hugging Face access.
