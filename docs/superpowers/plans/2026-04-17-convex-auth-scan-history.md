# Convex Auth And Scan History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user login with Convex Auth, persist user-owned uploads and scan history in Convex, and let users revisit previous analyses and uploaded videos from the web app.

**Architecture:** Keep the current FastAPI TRIBE pipeline as the inference worker and source of transient local processing files, but make Convex the system of record for users, uploads, scans, and user-visible asset references. Use Convex Auth on the Next.js client for login, client-side route gating, and user-owned queries; use a shared-secret service bridge from FastAPI to Convex for job status/result writes so the Python service does not need to validate end-user auth directly.

**Tech Stack:** Next.js App Router, React client components, Convex, Convex Auth, Convex File Storage, FastAPI, Python 3.11, existing TRIBE storage/job services.

---

## Scope And Assumptions

- The app keeps its current local FastAPI upload/analyze flow for TRIBE execution.
- Convex becomes the durable home for:
  - user identity
  - scan metadata and statuses
  - user-visible upload/video references
  - scan summaries and derived artifact references
- Local disk remains a transient working directory for:
  - active upload processing
  - TRIBE cache
  - intermediate artifacts before they are mirrored or summarized into Convex
- Because Convex Auth support for Next.js is still beta, the first implementation should rely on client-side auth boundaries in the app UI rather than middleware-heavy or SSR-critical auth enforcement.

## Recommended Delivery Order

1. Convex foundation and schema
2. Convex Auth client integration
3. scan/upload domain model in Convex
4. FastAPI to Convex service bridge
5. authenticated web UX for history and past scans
6. hardening, migration, and docs

## File Map

### New Convex files

- Create: `convex/schema.ts`
- Create: `convex/auth.config.ts`
- Create: `convex/auth.ts`
- Create: `convex/users.ts`
- Create: `convex/uploads.ts`
- Create: `convex/scans.ts`
- Create: `convex/service.ts`
- Create: `convex/http.ts`

### New frontend files

- Create: `apps/web/src/app/convex-client-provider.tsx`
- Create: `apps/web/src/components/auth/auth-gate.tsx`
- Create: `apps/web/src/components/auth/login-panel.tsx`
- Create: `apps/web/src/components/history/history-view.tsx`
- Create: `apps/web/src/app/history/page.tsx`
- Create: `apps/web/src/lib/convex.ts`

### Modified frontend files

- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/landing-client.tsx`
- Modify: `apps/web/src/components/upload-workbench.tsx`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/compare-view.tsx`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/web/src/lib/api.ts`

### Modified backend files

- Modify: `apps/api/app/core/config.py`
- Create: `apps/api/app/services/convex_sync.py`
- Modify: `apps/api/app/services/jobs.py`
- Modify: `apps/api/app/routers/api.py`
- Modify: `apps/api/app/models/contracts.py`

### Tests

- Create: `apps/web/src/components/__tests__/auth-gate.test.tsx`
- Create: `apps/web/src/components/__tests__/history-view.test.tsx`
- Create: `apps/api/tests/test_convex_sync.py`
- Modify: `apps/api/tests/test_api.py`

### Docs / env

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `LOCAL_SETUP.md`
- Modify: `RUNBOOK.md`

## Domain Model

### Convex tables

- `users`
  - `tokenIdentifier`
  - `email`
  - `name`
  - `imageUrl`
  - `createdAt`
  - `lastSeenAt`
- `uploads`
  - `userId`
  - `filename`
  - `contentType`
  - `sizeBytes`
  - `convexVideoStorageId`
  - `convexThumbnailStorageId`
  - `localUploadId`
  - `createdAt`
- `scans`
  - `userId`
  - `uploadId`
  - `status`
  - `localAnalysisId`
  - `viralPotential`
  - `hookScore`
  - `pacingScore`
  - `retentionEstimate`
  - `summary`
  - `diagnostics`
  - `artifactStorageIds`
  - `createdAt`
  - `updatedAt`
- `scanComparisons` if compare history is meant to be durable in v1
  - optional; can be deferred if only single-scan history matters first

### Ownership rule

- Every public Convex query/mutation must resolve the logged-in identity first.
- Every returned upload/scan row must be filtered by the current user.
- FastAPI writes must go through service-authenticated Convex functions and may only update rows already associated with a user-owned upload or scan.

## Task 1: Add Convex Foundation

**Files:**
- Create: `convex/schema.ts`
- Create: `convex/users.ts`
- Create: `apps/web/src/lib/convex.ts`
- Modify: `apps/web/package.json`
- Modify: `.env.example`

- [ ] Install Convex packages in `apps/web`: `convex`, `@convex-dev/auth`, and any required React helpers.
- [ ] Add `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, and service-secret placeholders to `.env.example`.
- [ ] Define Convex schema for `users`, `uploads`, and `scans` with indexes on `userId`, `createdAt`, `localUploadId`, and `localAnalysisId`.
- [ ] Add a tiny shared Convex client module in the web app so there is one `ConvexReactClient` instance.
- [ ] Run the Convex codegen flow and verify generated API/types exist.

**Exit criteria:**
- Convex deployment is bootstrapped locally.
- Generated `convex/_generated/*` files exist.
- Schema captures user, upload, and scan ownership cleanly.

## Task 2: Add Convex Auth To The Next.js Client

**Files:**
- Create: `convex/auth.config.ts`
- Create: `convex/auth.ts`
- Create: `apps/web/src/app/convex-client-provider.tsx`
- Create: `apps/web/src/components/auth/auth-gate.tsx`
- Create: `apps/web/src/components/auth/login-panel.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] Configure Convex Auth in the Convex backend with the chosen initial login method.
- [ ] Recommended v1 login method: passwordless email magic link or OTP, because it keeps provider sprawl down for the MVP.
- [ ] Add a client provider in the Next.js app that wraps the app tree with Convex and auth context.
- [ ] Add a minimal login surface for logged-out users.
- [ ] Add an auth gate component to show:
  - logged-out view
  - auth-loading state
  - authenticated children
- [ ] Update the landing page so upload actions are only available when authenticated.

**Exit criteria:**
- A user can sign in from the existing landing experience.
- The app has a stable authenticated client context.
- Logged-out users cannot start uploads from the primary workbench.

## Task 3: Create User And Scan Domain Functions In Convex

**Files:**
- Create: `convex/uploads.ts`
- Create: `convex/scans.ts`
- Modify: `convex/users.ts`

- [ ] Add a `users.upsertCurrentUser` mutation that maps the current auth identity into the `users` table.
- [ ] Add `uploads.createPendingUpload` mutation that creates a user-owned upload shell before the browser sends bytes to FastAPI.
- [ ] Add `scans.createPendingScan` mutation that creates a user-owned scan record before `/api/analyze`.
- [ ] Add `uploads.listMine`, `uploads.getMineById`, `scans.listMine`, and `scans.getMineById` queries.
- [ ] Add a `scans.listRecentMine` query tailored for the history page.
- [ ] Add compare-related fields only if the current UI needs durable compare history now; otherwise leave compare persistence for a later plan.

**Exit criteria:**
- Frontend can create user-owned placeholders in Convex before calling FastAPI.
- Frontend can query back prior uploads/scans reactively.

## Task 4: Add FastAPI To Convex Service Sync

**Files:**
- Create: `convex/service.ts`
- Create: `convex/http.ts`
- Create: `apps/api/app/services/convex_sync.py`
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/services/jobs.py`
- Modify: `apps/api/app/routers/api.py`

- [ ] Add backend env vars for:
  - `CONVEX_DEPLOYMENT`
  - `CONVEX_SITE_URL`
  - `CONVEX_SERVICE_SECRET`
- [ ] Create service-authenticated Convex entrypoints for:
  - marking an upload as received
  - marking a scan as queued/running/completed/failed
  - attaching durable asset/storage references
- [ ] Follow a shared-secret model for external service access, with the secret validated before any write logic.
- [ ] Add a Python service client in FastAPI that calls those Convex endpoints.
- [ ] Update `/api/upload` so the browser can pass the Convex `uploadRecordId` created earlier and FastAPI syncs the local `uploadId` back into Convex.
- [ ] Update `/api/analyze` so the browser can pass the Convex `scanRecordId` created earlier and FastAPI syncs job state transitions to Convex during execution.

**Exit criteria:**
- FastAPI no longer owns the only durable record of upload/scan history.
- Convex receives lifecycle updates for queued, running, completed, and failed scans.

## Task 5: Persist User-Visible Files In Convex Storage

**Files:**
- Modify: `convex/uploads.ts`
- Modify: `convex/scans.ts`
- Modify: `convex/service.ts`
- Modify: `apps/api/app/services/convex_sync.py`
- Modify: `apps/api/app/services/jobs.py`

- [ ] Decide the minimum durable asset set for v1:
  - source MP4
  - thumbnail
  - processed JSON summary
  - cut-list JSON
  - optional raw `preds.npy`
- [ ] Mirror user-visible files into Convex File Storage and save their storage IDs on `uploads` or `scans`.
- [ ] Keep local disk paths only as transient runtime details, not as the primary history surface.
- [ ] Expose served file URLs or storage IDs through Convex queries so the web UI can render past videos and download past exports.
- [ ] Add retention rules:
  - if raw tensor files are too large or too expensive, mark them optional and keep only the processed summary in v1

**Exit criteria:**
- A previously completed scan remains viewable even after the local working directory is cleaned.
- The history UI can render video/thumb links from Convex-backed storage.

## Task 6: Update The Web App To Use Convex For History And Ownership

**Files:**
- Create: `apps/web/src/app/history/page.tsx`
- Create: `apps/web/src/components/history/history-view.tsx`
- Modify: `apps/web/src/components/upload-workbench.tsx`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/compare-view.tsx`
- Modify: `apps/web/src/components/landing-client.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/contracts.ts`

- [ ] Before hitting FastAPI upload/analyze endpoints, call the new Convex mutations that create durable user-owned placeholder records.
- [ ] Pass Convex record IDs through the existing FastAPI request bodies or headers.
- [ ] Add a history route that shows the current user:
  - previous uploads
  - scan statuses
  - completed scan summaries
  - links back to individual analysis pages
- [ ] Update the analysis page so it can hydrate from Convex-backed metadata when revisiting a completed scan.
- [ ] Decide whether the `/analysis/[analysisId]` route should stay keyed by local FastAPI analysis ID or migrate to a Convex scan ID. Recommended: migrate the route to a Convex scan ID and store the local analysis ID as an internal field.

**Exit criteria:**
- A logged-in user can revisit prior scans from a dedicated page.
- Upload and analyze flows are user-owned from the moment they start.

## Task 7: Testing And Hardening

**Files:**
- Create: `apps/web/src/components/__tests__/auth-gate.test.tsx`
- Create: `apps/web/src/components/__tests__/history-view.test.tsx`
- Create: `apps/api/tests/test_convex_sync.py`
- Modify: `apps/api/tests/test_api.py`

- [ ] Add frontend tests for:
  - logged-out gate
  - authenticated landing state
  - history rendering
  - empty-state history
- [ ] Add backend tests for:
  - service-secret validation
  - sync payload generation
  - upload/scan state propagation to Convex
- [ ] Add integration coverage for the happy path:
  - create pending upload in Convex
  - upload to FastAPI
  - queue analysis
  - completed scan reflected in Convex-backed history
- [ ] Add failure coverage for:
  - unauthenticated browser requests
  - invalid or stale record IDs
  - Convex sync failure during analysis completion

**Exit criteria:**
- History/auth behavior is test-covered, not just manually verified.
- FastAPI failure modes do not silently orphan user scan records.

## Task 8: Docs, Migration, And Rollout

**Files:**
- Modify: `README.md`
- Modify: `LOCAL_SETUP.md`
- Modify: `RUNBOOK.md`

- [ ] Document all new env vars and the local startup order:
  - Convex dev deployment
  - FastAPI backend
  - Next.js frontend
- [ ] Add a runbook section for:
  - resetting local Convex data during development
  - repairing a scan stuck in `running`
  - cleaning local transient storage without deleting Convex history
- [ ] Add a migration note:
  - older local-only scans in `storage/analyses` will not automatically appear in Convex history unless a backfill task is written
- [ ] Decide whether a one-time backfill script is in scope now or a follow-up plan. Recommended: defer backfill and only support new authenticated scans in the first delivery.

**Exit criteria:**
- Another engineer can stand the new auth/history stack up from docs alone.
- The app’s persistence model is explicit: local scratch plus Convex durable state.

## Risks And Decision Points

### Risk 1: Convex Auth + Next.js maturity

- Official Convex docs currently describe Convex Auth as beta and state that Next.js support is still under active development.
- Mitigation:
  - keep auth-critical UI in client components
  - do not make middleware or SSR auth a requirement for v1
  - isolate auth provider wiring into `convex-client-provider.tsx`

### Risk 2: FastAPI does not naturally understand Convex Auth user sessions

- Mitigation:
  - do not make Python validate end-user auth directly in v1
  - use service-authenticated Convex writes from FastAPI
  - create durable upload/scan placeholders in Convex before calling FastAPI

### Risk 3: Asset duplication and cost

- Storing videos both locally and in Convex duplicates bytes.
- Mitigation:
  - keep local copies transient
  - mirror only durable/user-visible assets to Convex
  - make raw tensor retention optional

## Recommended First Executable Slice

If this is broken into smaller implementation rounds, start with:

1. Convex foundation
2. Convex Auth login gate
3. `users`, `uploads`, `scans` tables and basic queries
4. history page fed purely from Convex placeholders

Then add the FastAPI sync bridge in the second slice.

## Verification Checklist

- User can sign in and sign out.
- Logged-out users cannot initiate upload or analysis.
- Logged-in users can see a history page with their scans only.
- Starting an upload creates a durable Convex record before bytes go to FastAPI.
- Completing a scan updates the Convex record and makes the scan revisit-able.
- Cleaning `storage/uploads` and `storage/analyses` does not erase Convex metadata or any mirrored Convex-stored assets.

