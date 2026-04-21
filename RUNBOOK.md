# RUNBOOK

## Daily startup

From repo root:

```bash
npm run dev
```

The frontend proxies `/api/*` and `/storage/*` to the backend automatically during local development.

To use the Gemini fallback locally, put this in the repo-root `.env` before startup:

```dotenv
ANALYSIS_BACKEND=gemini
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-pro
```

To use the real MiroFish audience-simulation backend locally:

```dotenv
ANALYSIS_BACKEND=mirofish
MIROFISH_REPO_DIR=../MiroFish
MIROFISH_AUTO_START=true
MIROFISH_ZEP_API_KEY=your_zep_key_here

# Vertex-backed setup.
GEMINI_PLATFORM=vertex
MIROFISH_VERTEX_PROJECT_ID=your_gcp_project_id
MIROFISH_VERTEX_LOCATION=global

# Provide ADC locally with either:
# GOOGLE_APPLICATION_CREDENTIALS=/abs/path/service-account.json
# or `gcloud auth application-default login`

# Optional explicit non-Vertex override.
MIROFISH_LLM_API_KEY=
MIROFISH_LLM_BASE_URL=
MIROFISH_LLM_MODEL_NAME=
```

Or, if you already have the official MiroFish backend running:

```dotenv
ANALYSIS_BACKEND=mirofish
MIROFISH_BASE_URL=http://127.0.0.1:5001
MIROFISH_ZEP_API_KEY=your_zep_key_here
```

If you want to start the backend directly with the launcher surface:

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
```

Native Windows:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
```

For authenticated upload/history flows, also keep Convex running in a separate terminal:

```bash
cd apps/web
npx convex dev
```

## Clear caches safely

Remove analysis artifacts:

```bash
rm -rf storage/uploads/* storage/analyses/*
touch storage/uploads/.gitkeep storage/analyses/.gitkeep
```

Clear TRIBE cache:

```bash
rm -rf storage/cache/*
touch storage/cache/.gitkeep
```

## Re-download model files

This applies only when `ANALYSIS_BACKEND=tribe`.

1. Clear `storage/cache`.
2. Run the launcher `download` command again.
3. If you still see an access error, confirm `HUGGINGFACE_HUB_TOKEN` is present in `.env` or the active environment and that your Hugging Face account has gated access.

Examples:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py download
```

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py download
```

## Prepare a known sample clip

Use your own local source file:

```bash
ffmpeg -y -ss 0 -i /path/to/source.mov -t 15 -vf "scale=1080:-2" -c:v libx264 -c:a aac sample-tribe.mp4
```

This produces a short MP4 that is usually easier to debug than a long or variable-format source.

## Inspect backend logs

The backend runs under:

```bash
npm run dev:api
```

Watch the terminal for:

- health/readiness messages
- upload validation failures
- TRIBE import/model-load failures
- MiroFish sidecar startup or simulation failures
- analysis job exceptions

## Confirm predictions and shapes

After a completed run:

```bash
python3.11 - <<'PY'
import numpy as np
preds = np.load("storage/analyses/<analysisId>/preds.npy")
print(preds.shape)
PY
```

Expected pattern:

- first dimension = number of kept analysis windows
- second dimension = number of cortical vertices

When `ANALYSIS_BACKEND=gemini` or `ANALYSIS_BACKEND=mirofish`, inspect the provider response instead:

```bash
cat storage/analyses/<analysisId>/provider-response.json
```

## Debug failed analyses

1. Check `GET /api/health`.
2. Confirm the active backend has its credential set:
   - `HUGGINGFACE_HUB_TOKEN` for `ANALYSIS_BACKEND=tribe`
   - `GEMINI_API_KEY` for `ANALYSIS_BACKEND=gemini`
   - `MIROFISH_ZEP_API_KEY` plus either `MIROFISH_BASE_URL` or `MIROFISH_REPO_DIR` for `ANALYSIS_BACKEND=mirofish`
3. Confirm `ffmpeg` and `ffprobe` are available.
4. Inspect `storage/uploads/<uploadId>/`.
5. Inspect `storage/analyses/<analysisId>/record.json`.
6. If the payload is missing but the record says completed, rerun after clearing that analysis directory.
7. If `/api/upload` or `/api/analyze` now 400 on missing Convex IDs, confirm the frontend is creating pending Convex upload/scan rows and that `REQUIRE_CONVEX_IDS` matches your intended mode.
8. If the backend logs Convex sync warnings, compare `CONVEX_SERVICE_SECRET` in `.env` with the value configured in Convex and restart the backend after changes.
9. If auto-started MiroFish never becomes healthy, inspect `storage/cache/mirofish-backend.log`.

For a quick launcher-side sanity check:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py probe
```

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py probe
```

## Prepare the demo before presenting

1. Pre-verify `GET /api/health`.
2. Keep one short, known-good MP4 ready locally.
3. Clear stale uploads and analyses if the workspace is noisy.
4. Run one single analysis and one A/B compare before the demo window.
5. Keep the disclaimer ready:
   - non-commercial
   - not medical
   - not mind-reading
   - viral estimate is heuristic
