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
- `ANALYSIS_BACKEND=mirofish`
  - generates a structured video brief, sends it to the official MiroFish backend, and normalizes the simulation output into Twine's timeline contract
  - requires either `MIROFISH_BASE_URL` pointing at a running MiroFish backend, or `MIROFISH_REPO_DIR` plus `MIROFISH_AUTO_START=true`
  - requires `MIROFISH_ZEP_API_KEY`
  - uses audience simulation for `Read the room`; the brain scan becomes a compact side summary

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
- Direct MiroFish output in `mirofish` mode:
  - graph construction and multi-agent audience simulation from the generated video brief
  - report-agent synthesis that Twine normalizes into the `Read the room` timeline
- App-normalized outputs across analysis modes:
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

Real MiroFish setup:

```bash
git clone https://github.com/666ghj/MiroFish.git ../MiroFish
cd ../MiroFish
npm run setup:backend
cd ../claudehackosu26
```

Then put this in repo-root `.env.local`:

```dotenv
ANALYSIS_BACKEND=mirofish
MIROFISH_REPO_DIR=../MiroFish
MIROFISH_AUTO_START=true
MIROFISH_ZEP_API_KEY=your_zep_key_here

# If your existing Gemini path already runs on Vertex, keep Vertex enabled.
GEMINI_PLATFORM=vertex
MIROFISH_VERTEX_PROJECT_ID=your_gcp_project_id
MIROFISH_VERTEX_LOCATION=global

# Then provide ADC locally, either with:
# GOOGLE_APPLICATION_CREDENTIALS=/abs/path/service-account.json
# or by running `gcloud auth application-default login`

# Optional explicit non-Vertex override for the official MiroFish backend:
MIROFISH_LLM_API_KEY=
MIROFISH_LLM_BASE_URL=
MIROFISH_LLM_MODEL_NAME=

# Developer API fallback only if you intentionally want AI Studio.
GEMINI_API_KEY=
EDITOR_AI_PROVIDER=gemini
```

If you prefer to run MiroFish yourself, start it from its own checkout and point Twine at it:

```bash
cd ../MiroFish
npm run backend
```

```dotenv
ANALYSIS_BACKEND=mirofish
MIROFISH_BASE_URL=http://127.0.0.1:5001
MIROFISH_ZEP_API_KEY=your_zep_key_here
EDITOR_AI_PROVIDER=gemini
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

- `ANALYSIS_BACKEND` - `tribe`, `gemini`, or `mirofish`
- `MIROFISH_BASE_URL` - URL for a running official MiroFish backend
- `MIROFISH_REPO_DIR` - local checkout of `666ghj/MiroFish` used for auto-start
- `MIROFISH_AUTO_START` - when `true`, Twine starts the official MiroFish backend from `MIROFISH_REPO_DIR` on demand
- `MIROFISH_ZEP_API_KEY` - required by the official MiroFish backend
- `MIROFISH_LLM_API_KEY` - optional explicit OpenAI-compatible LLM key for MiroFish
- `MIROFISH_LLM_BASE_URL` - optional OpenAI-compatible base URL for MiroFish
- `MIROFISH_LLM_MODEL_NAME` - optional OpenAI-compatible model name for MiroFish
- `MIROFISH_VERTEX_PROJECT_ID` - Google Cloud project id for Vertex-backed MiroFish auth
- `MIROFISH_VERTEX_LOCATION` - Vertex location for the OpenAI-compatible endpoint, usually `global`
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
- MiroFish mode is audience simulation built from a generated brief, not a literal brain scan.
- It is not a medical device, not mind reading, and not a claim of guaranteed virality.
