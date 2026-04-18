# RUNBOOK

## Daily startup

From repo root:

```bash
npm run dev
```

The frontend proxies `/api/*` and `/storage/*` to the backend automatically during local development.

If you want to start the backend directly with the launcher surface:

macOS:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
```

Native Windows:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
```

Start Convex in its own terminal (required for login and history):

macOS:

```bash
cd apps/web
npx convex dev
```

Native Windows:

```powershell
cd apps\web
npx convex dev
```

Keep all three processes running together: Convex dev, FastAPI backend, and `npm run dev:web`.

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

## Debug failed analyses

1. Check `GET /api/health`.
2. Confirm `HUGGINGFACE_HUB_TOKEN` is set.
3. Confirm `ffmpeg` and `ffprobe` are available.
4. Inspect `storage/uploads/<uploadId>/`.
5. Inspect `storage/analyses/<analysisId>/record.json`.
6. If the payload is missing but the record says completed, rerun after clearing that analysis directory.
7. Confirm `npx convex dev` is still running in `apps/web`; the frontend cannot mint upload/scan IDs without it, and FastAPI will 400 when `REQUIRE_CONVEX_IDS=true`.
8. Confirm `CONVEX_SERVICE_SECRET` matches on both sides. Compare `npx convex env get CONVEX_SERVICE_SECRET` to the value in the repo-root `.env` and restart the backend after any change.

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
5. Confirm you are signed in on the browser; `/history` should show the pre-run scans.
6. Keep the disclaimer ready:
   - non-commercial
   - not medical
   - not mind-reading
   - viral estimate is heuristic

## Convex operations

### Rotate the service secret

```bash
openssl rand -hex 32
```

Update both sides in this order, then restart the backend:

1. `npx convex env set CONVEX_SERVICE_SECRET <new>` (run inside `apps/web`).
2. Update `CONVEX_SERVICE_SECRET` in the repo-root `.env`.
3. Restart the FastAPI serve process.

Mismatched values surface as 401s in the backend log whenever `ConvexSyncService` tries to patch a row.

### Reset a stuck scan

If a scan sits in `queued` or `running` in `/history` after the backend has clearly finished, the lifecycle hook in `jobs.py` likely failed to patch Convex. Check the backend log for errors near the analysis ID, confirm the service secret, then re-run the analysis. The stale row can be left in history (it is clearly labeled) or deleted manually via the Convex dashboard.

### Bypass Convex for a smoke test

Only for local debugging when Convex is intentionally offline:

1. Set `REQUIRE_CONVEX_IDS=false` in the repo-root `.env`.
2. Restart the FastAPI serve process.
3. The frontend still tries to mint Convex IDs and will fail to load without `NEXT_PUBLIC_CONVEX_URL`; use direct `curl` against `/api/upload` and `/api/analyze` for this mode.

Revert both changes before the next normal run.
