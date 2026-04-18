# TRIBE Creator API

FastAPI backend for local uploads, TRIBE v2 analysis, artifact serving, and comparison heuristics.

## What "serve the model" means in this repo

This project does not run a separate model-serving microservice. The backend process itself loads TRIBE in-process and exposes:

- `/api/*` for upload, analysis, compare, and health
- `/storage/*` for uploaded files and generated artifacts

The `apps/api/scripts/run_tribe_mac.py` and `apps/api/scripts/run_tribe_windows.py` launchers are the supported way to:

- probe the runtime
- warm-download the model into `TRIBE_CACHE_DIR`
- serve the backend locally
- run a smoke-test analysis on an MP4

## Prerequisites

- Python 3.11
- `uv`
- `ffmpeg` and `ffprobe` on `PATH`
- a valid `HUGGINGFACE_HUB_TOKEN` in `.env` or the environment
- Hugging Face access to `facebook/tribev2` and the gated upstream dependencies it pulls in

Windows note:

- Use native Windows Python with `py -3.11`
- Do not use WSL for this backend flow

## Install the backend environment

From the repo root:

macOS:

```bash
cp .env.example .env
cd apps/api
uv sync --python 3.11
cd ../..
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
cd apps/api
uv sync --python 3.11
cd ../..
```

Set your token in `.env`:

```dotenv
HUGGINGFACE_HUB_TOKEN=hf_your_token_here
```

## Download the model locally

The `download` command warm-loads TRIBE and fills `TRIBE_CACHE_DIR` ahead of the first analysis request.

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

If the token is missing, Python is not 3.11, `tribev2` is not installed, or `ffmpeg`/`ffprobe` are unavailable, the probe output will surface that before you try to serve the backend.

## Serve the backend locally

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
```

Defaults:

- host: `0.0.0.0`
- port: `API_PORT` from `.env`, or `8000`

You can override the port explicitly:

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve --port 8001
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve --port 8001
```

## Run a smoke-test analysis

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py analyze --video ./sample-tribe.mp4
```

Windows PowerShell:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py analyze --video .\sample-tribe.mp4
```

This command:

- copies the MP4 into `storage/uploads`
- inspects duration and metadata
- generates a thumbnail
- runs analysis through the same backend pipeline as the site
- writes artifacts into `storage/analyses`

## Run the website against this backend

Once the API is running, go back to the repo root and start the frontend:

```bash
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000). The Next.js app rewrites `/api/*` and `/storage/*` to the backend port configured by `API_PORT`.

## Enable Convex auth and saved scan history

The Cortent app now expects Convex to handle:

- email/password authentication
- durable upload and scan records
- saved cut selections
- latest export metadata per scan

Minimal setup:

```bash
npx convex dev
```

Then populate the shared `.env` values:

```dotenv
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_SITE_URL=https://<deployment>.convex.site
CONVEX_SERVICE_SECRET=your-shared-secret
CONVEX_DEPLOYMENT=<deployment-name>
```

The frontend uses `NEXT_PUBLIC_CONVEX_URL` for client auth and scan queries. The FastAPI backend uses `CONVEX_SITE_URL` and `CONVEX_SERVICE_SECRET` to patch upload/scan status back into Convex after uploads, analysis, and exports.

## Key environment variables

- `API_PORT` - backend port
- `WEB_PORT` - frontend port
- `TRIBE_UPLOADS_DIR` - upload storage directory
- `TRIBE_RESULTS_DIR` - analysis artifact directory
- `TRIBE_CACHE_DIR` - model cache directory
- `TRIBE_ALLOWED_ORIGIN` - frontend origin allowed by CORS
- `TRIBE_DEVICE` - `auto`, `cpu`, `cuda`, or manual `mps`
- `HUGGINGFACE_HUB_TOKEN` - required for real model download and analysis
- `FFMPEG_BIN` - ffmpeg binary name or path
- `FFPROBE_BIN` - ffprobe binary name or path
- `NEXT_PUBLIC_CONVEX_URL` - Convex client URL for auth and app queries
- `CONVEX_SITE_URL` - Convex `.site` URL for the FastAPI service bridge
- `CONVEX_SERVICE_SECRET` - shared secret for FastAPI -> Convex service writes
- `CONVEX_DEPLOYMENT` - deployment selector used by `npx convex dev`

## Verify the backend

- `http://127.0.0.1:8000/api/health` returns JSON
- `http://localhost:3000` can load backend health successfully
- uploads create files under `storage/uploads/<uploadId>`
- completed analyses create records and artifacts under `storage/analyses/<analysisId>`
