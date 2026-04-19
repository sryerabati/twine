# Twine

Twine is an authenticated short-form video review tool for creators and content teams. It lets you:

- run a single scan on one cut
- compare two versions head to head
- keep a saved scan library in Convex
- export selected trims from completed scans
- build an AI-assisted rough cut from multiple uploaded clips

The app couples a Next.js frontend with Convex for auth and saved state, plus a FastAPI worker that handles uploads, analysis jobs, exports, and AI editor draft generation.

## Current stack

- `apps/web` - Next.js 16 App Router, React 19, Tailwind 4, Convex Auth
- `convex` - auth, uploads, saved scans, compare metadata, editor project state
- `apps/api` - FastAPI job runner for uploads, analysis, compare, trim, and editor draft generation
- `storage` - local runtime artifacts only; never commit generated contents

Detailed setup lives in [LOCAL_SETUP.md](/Users/shreyas/Desktop/projects/claudehackosu26/LOCAL_SETUP.md). Backend-only notes live in [apps/api/README.md](/Users/shreyas/Desktop/projects/claudehackosu26/apps/api/README.md). Daily operations and cleanup live in [RUNBOOK.md](/Users/shreyas/Desktop/projects/claudehackosu26/RUNBOOK.md).

## Product surface

- Marketing landing page with auth entry
- Authenticated dashboard at `/app`
- Saved scan library at `/app/library`
- Single-scan detail pages
- Compare scan pages
- AI editor home at `/app/editor`
- Per-project editor workspace at `/app/editor/[projectId]`

## Analysis backends

- `ANALYSIS_BACKEND=tribe`
  - runs local TRIBE v2 analysis
  - requires `HUGGINGFACE_HUB_TOKEN`
  - produces cortical-response-derived artifacts
- `ANALYSIS_BACKEND=gemini`
  - sends the uploaded video to Gemini Files API and normalizes the result into the same contract
  - requires `GEMINI_API_KEY`
  - is a fallback content-analysis path, not cortical prediction

## AI editor backends

- `EDITOR_AI_PROVIDER=gemini`
  - uses Gemini for clip summarization and ordering
- `EDITOR_AI_PROVIDER=nvidia`
  - uses the NVIDIA-backed editor path
  - requires `NVIDIA_API_KEY`

## What is direct model output vs app heuristic

- Direct TRIBE output in `tribe` mode:
  - per-segment cortical response predictions
  - event timing derived by the TRIBE pipeline
- App heuristics in both analysis modes:
  - hook, pacing, and viral-style summary scores
  - deadspace markers and cut suggestions
  - compare winner summaries and recommendations
  - editor storyline summaries and warning counts

## Quick local start

### 1. Install dependencies

```bash
git clone https://github.com/sryerabati/claudehackosu26.git
cd claudehackosu26
npm install
cd apps/api
uv sync --python 3.11
cd ../..
cp .env.example .env.local
```

### 2. Configure local secrets in repo-root `.env.local`

Minimal Gemini-based setup:

```dotenv
ANALYSIS_BACKEND=gemini
GEMINI_API_KEY=your_google_ai_studio_key
EDITOR_AI_PROVIDER=gemini
```

Local TRIBE setup:

```dotenv
ANALYSIS_BACKEND=tribe
HUGGINGFACE_HUB_TOKEN=hf_your_token_here
EDITOR_AI_PROVIDER=gemini
```

If you want the NVIDIA editor path:

```dotenv
EDITOR_AI_PROVIDER=nvidia
NVIDIA_API_KEY=your_nvidia_key
```

### 3. Start Convex for auth and saved state

```bash
cd apps/web
npx convex dev
```

This generates `apps/web/.env.local` with `NEXT_PUBLIC_CONVEX_URL`. Keep that file local.

### 4. Start the app

Single command on macOS/Linux:

```bash
npm run dev
```

Or run the services separately:

```bash
python3.11 apps/api/scripts/run_tribe_mac.py serve
npm run dev:web
```

Native Windows backend:

```powershell
py -3.11 apps\api\scripts\run_tribe_windows.py serve
npm run dev:web
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

Use repo-root `.env.local` for local secrets. `apps/web/.env.local` is Convex-generated and should also stay untracked.

- `ANALYSIS_BACKEND` - `tribe` or `gemini`
- `EDITOR_AI_PROVIDER` - `gemini` or `nvidia`
- `HUGGINGFACE_HUB_TOKEN` - required for local TRIBE analysis
- `GEMINI_API_KEY` - required for Gemini analysis and Gemini editor mode
- `GEMINI_MODEL` - main Gemini model for analysis
- `GEMINI_FALLBACK_MODEL` - lower-cost fallback model for retries
- `NVIDIA_API_KEY` - required for NVIDIA editor mode
- `NVIDIA_MODEL` - NVIDIA model identifier for editor requests
- `NEXT_PUBLIC_CONVEX_URL` - Convex client URL consumed by the web app
- `CONVEX_SITE_URL` - Convex `.site` URL used by FastAPI service routes
- `CONVEX_SERVICE_SECRET` - shared secret FastAPI must send to Convex service routes
- `CONVEX_DEPLOYMENT` - deployment selected by `npx convex dev`
- `REQUIRE_CONVEX_IDS` - when `true`, upload and analysis requests must match auth-owned Convex rows

See [LOCAL_SETUP.md](/Users/shreyas/Desktop/projects/claudehackosu26/LOCAL_SETUP.md) for the full env matrix.

## Public repo hygiene

Before making the repository public:

- do not commit `.env`, `.env.local`, or `apps/web/.env.local`
- do not commit generated `storage/` contents, `apps/api/storage/`, or `.superpowers/`
- rotate any key that was ever written into a tracked file or commit history
- if a secret was committed previously, remove it from history before publishing the repo

## Important disclaimer

- This is a non-commercial demo and must be treated as such under TRIBE v2's CC BY-NC 4.0 license.
- The app visualizes predicted average-subject brain-response signals and derived heuristics.
- Gemini mode is a content-analysis fallback, not cortical prediction.
- It is not a medical device, not mind reading, and not a claim of guaranteed virality.
