# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## What this project is

**Twine** — an authenticated short-form video review tool. Users can scan a single cut, compare two versions, build AI-assisted rough cuts from multiple clips, and repurpose one video into alternate cuts. Three services run together: a Next.js frontend, a Convex backend (auth + saved state), and a FastAPI Python worker (uploads, analysis jobs, trim exports, editor/repurpose draft generation).

## Commands

Run all three services together during development:

```bash
npx convex dev          # terminal 1: Convex dev server (required for auth + state)
npm run dev             # terminal 2: starts FastAPI + Next.js concurrently
```

Or individually:

```bash
npm run dev:api         # FastAPI on port 8000 (uv run uvicorn, --reload)
npm run dev:web         # Next.js on port 3000
```

Build / lint / test:

```bash
npm run build           # py_compile check + next build
npm run lint            # eslint (web) + py_compile (api)
npm run test            # pytest (api) + vitest (web)

# Single API test
cd apps/api && uv run pytest tests/test_engine.py::test_my_case

# Single web test
cd apps/web && npx vitest run src/components/__tests__/analysis-view.test.tsx
```

Python deps use `uv` (Python 3.11 only). Node deps use `npm` workspaces (root + `apps/web`).

## Architecture

### Three-layer system

```
apps/web        Next.js 16 App Router, React 19, Tailwind 4, Convex Auth
convex/         Convex: auth, uploads table, scans/compare/editor/repurpose state
apps/api        FastAPI: upload ingestion, analysis jobs, trim export, AI drafts
storage/        Runtime artifacts only — never commit contents
```

### FastAPI service wiring (`apps/api`)

`build_context()` in `app/main.py` assembles all services into a single `APIContext` object that is stored on `app.state.context` and injected into every route. The runner (analysis backend) is selected here via `ANALYSIS_BACKEND`:

- `tribe` — local TRIBE v2 model (requires `HUGGINGFACE_HUB_TOKEN`, GPU optional)
- `gemini` — Gemini API (`GEMINI_API_KEY`, no local model needed)
- `mirofish` — MiroFish audience-simulation service (`MIROFISH_*` vars)

Editor AI is selected via `EDITOR_AI_PROVIDER`: `gemini` or `nvidia`.

Services: `StorageService`, `MediaService`, `AnalysisEngine`, `ConvexSyncService`, and three job services (`AnalysisJobService`, `EditorDraftJobService`, `RepurposeJobService`).

### Convex ownership model

Every row in `uploads` and `scans` must have a `userId` field. Public queries/mutations resolve the current user via `getAuthUserId` and filter by that `userId`. FastAPI writes to Convex through service-secret-authenticated HTTP routes in `convex/http.ts` — these may only update rows already owned by a user. Always include argument validators on all Convex functions (`query`, `mutation`, `action`, internal variants).

`REQUIRE_CONVEX_IDS=true` enforces auth-owned rows in the upload/analysis path. Only set it to `false` for intentional local API-only smoke tests.

### Frontend pages (`apps/web/src/app`)

- `/` — marketing landing
- `/app` — authenticated dashboard
- `/app/library` — saved scan library
- `/app/scans/[scanId]` — single scan detail
- `/app/compare/[scanId]` — compare two scans
- `/app/editor/[projectId]` — AI editor workspace
- `/app/repurpose/[projectId]` — repurpose workspace

Page files are thin; logic lives in `src/components/`. Web tests use Vitest + @testing-library/react + jsdom with mocks at `src/test/mocks/`.

## Key env vars

Set in repo-root `.env.local`. See `LOCAL_SETUP.md` for the full matrix.

| Var | Purpose |
|-----|---------|
| `ANALYSIS_BACKEND` | `tribe`, `gemini`, or `mirofish` |
| `EDITOR_AI_PROVIDER` | `gemini` or `nvidia` |
| `NEXT_PUBLIC_CONVEX_URL` | Set automatically by `npx convex dev` |
| `CONVEX_SERVICE_SECRET` | Shared secret for FastAPI → Convex service routes |
| `REQUIRE_CONVEX_IDS` | Keep `true` for web flow; `false` only for API smoke tests |
| `GEMINI_API_KEY` | Required for Gemini analysis/editor |
| `HUGGINGFACE_HUB_TOKEN` | Required for local TRIBE mode |

Detailed daily operations and cache-clearing steps: `RUNBOOK.md`.
