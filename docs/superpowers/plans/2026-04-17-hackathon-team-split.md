# Hackathon Team Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 4-person team a clean execution split so everyone can work independently and still land a polished, demo-safe MVP.

**Architecture:** The current project already has the right top-level separation: a FastAPI backend for upload, analysis, heuristics, and artifacts, plus a Next.js frontend for landing, upload, results, and compare. The plan below freezes the analysis contract early, isolates branding from product implementation, and keeps editing scope constrained to deadspace preview/export only.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Recharts, FastAPI, Python 3.11, ffmpeg/ffprobe, TRIBE/MetaTribe-style inference, local artifact storage.

---

## Scope Lock

Ship these before anything else:

- Upload one or two videos
- Run analysis or a stable fallback demo path
- Show a strong results page with brain/timeline view, markers, and scorecards
- Show a clear A/B winner with reasons
- Show deadspace suggestions and one narrow edit/export workflow

Do not expand into these unless all of the above are solid:

- Full editor behavior
- 3D brain rendering
- Auth
- Persona modes
- Thumbnail recommendations
- Shareable reports
- Long-form support

## Shared Rules

- Freeze `AnalysisPayload` and `CompareResponse` early on Day 1. After freeze, contract changes should be additive only.
- Use one known-good demo clip and one known-good analysis fixture so frontend work is never blocked on live model runs.
- Keep editing limited to deadspace preview/apply/export. Do not build a general timeline editor.
- Do not do large refactors during the hackathon. Favor small, local changes.
- Commit in narrow slices and keep ownership boundaries clear.
- If a task risks demo stability, prefer a believable deterministic fallback over an ambitious incomplete feature.

## File Ownership Map

- Backend contract and inference: `apps/api/app/models/contracts.py`, `apps/api/app/routers/api.py`, `apps/api/app/services/tribe_runner.py`
- Backend heuristics and media/export logic: `apps/api/app/services/analysis_engine.py`, `apps/api/app/services/media.py`, `apps/api/app/services/storage.py`
- Frontend landing and brand shell: `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/components/brand-shell.tsx`
- Frontend product surfaces: `apps/web/src/components/upload-workbench.tsx`, `apps/web/src/components/analysis-view.tsx`, `apps/web/src/components/compare-view.tsx`

### Task 1: Shreyas - Model, Contract, and Demo Stability

**Files:**
- Modify: `apps/api/app/models/contracts.py`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/api/app/routers/api.py`
- Modify: `apps/api/app/services/tribe_runner.py`
- Modify: `apps/api/README.md`
- Modify: `README.md`
- Test: `apps/api/tests/test_api.py`
- Test: `apps/api/tests/test_engine.py`

**Mission:** Own the truth of the backend contract and make sure the demo can always complete end-to-end.

**Dependencies:** None. This is the first unblock for everyone else.

**Unblocks:** Shashank, Srujan, Sanjay

- [ ] Freeze the response contract for single-analysis and compare flows.
- [ ] Make sure `apps/api/app/models/contracts.py` and `apps/web/src/lib/contracts.ts` match exactly.
- [ ] Decide whether MOV support is actually in scope. If yes, implement it in upload validation. If no, explicitly keep the product copy MP4-only so there is no mismatch between pitch and product.
- [ ] Make `/api/health` the single source of truth for demo readiness: model access, ffmpeg, ffprobe, token presence, selected device, and blockers should be actionable and easy to read.
- [ ] Add a stable fallback for demo mode if real model access is flaky, slow, or gated. The fallback can be fixture-based, but it needs to preserve the same response shape as the live path.
- [ ] Generate one known-good demo clip and one known-good analysis payload that frontend can use for development and live demo backup.
- [ ] Write down the exact backend startup and recovery steps in `README.md` and `apps/api/README.md` so nobody is guessing under time pressure.

**Definition of done:**

- Frontend can rely on a frozen payload shape.
- A live or fallback analysis can be demonstrated without backend surprises.
- Health output immediately explains what is broken when the environment is not ready.

### Task 2: Sanjay - Brand, Positioning, and Visual System

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/brand-shell.tsx`
- Reference: `apps/web/src/components/upload-workbench.tsx`
- Reference: `apps/web/src/components/analysis-view.tsx`
- Reference: `apps/web/src/components/compare-view.tsx`

**Mission:** Make the project feel like a real product, not a hackathon prototype stitched together from default components.

**Dependencies:** Needs the current product scope to stay frozen. Does not need finished backend work.

**Unblocks:** Shashank

- [ ] Finalize the product name, short tagline, tone, and one-sentence pitch.
- [ ] Create the visual system: color palette, typography, spacing language, surfaces, badges, and states.
- [ ] Design the landing experience so the value proposition lands in under 10 seconds.
- [ ] Write final copy for landing, upload, processing, results, compare, and disclaimer language.
- [ ] Make sure the same visual system carries through the landing page, processing state, results page, and compare page.
- [ ] Hand off the brand direction in a way engineering can use immediately: exact copy, token values, and a small set of reference screenshots or notes for each major surface.
- [ ] Keep the brand work aligned to the product truth. Do not promise unsupported functionality in the copy.

**Definition of done:**

- The product has one coherent name and visual identity.
- The landing page, results page, and compare page feel like the same product.
- Shashank has enough design direction to implement without guessing.

### Task 3: Shashank - Frontend Product Experience

**Files:**
- Modify: `apps/web/src/components/landing-client.tsx`
- Modify: `apps/web/src/components/upload-workbench.tsx`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/compare-view.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Test: `apps/web/src/components/__tests__/analysis-view.test.tsx`
- Test: `apps/web/src/components/__tests__/compare-view.test.tsx`
- Test: `apps/web/src/components/__tests__/upload-workbench.test.tsx`

**Mission:** Turn the existing functional UI into the polished demo experience that users can understand without narration.

**Dependencies:** Needs Shreyas to freeze the contract and Sanjay to freeze brand tokens/copy.

**Unblocks:** Final demo narrative

- [ ] Apply Sanjay's brand system across upload, processing, results, and compare surfaces.
- [ ] Strengthen the upload flow so it is obvious what the user can upload, what happens next, and what constraints matter.
- [ ] Make the processing state feel intentional and premium, including progress messaging and a visual teaser for the brain-response concept.
- [ ] Improve the results page hierarchy so the eye lands on the video, the brain/timeline view, the recommendation, and the scorecards in the right order.
- [ ] Add synced interaction between the video and the analysis UI. At minimum, clicking a marker should seek the player, and current playback should visibly map onto the analysis view.
- [ ] Make the brain-response section feel like the visual wow moment even if the implementation remains 2D and simple.
- [ ] Improve the A/B compare page so the winner, reasoning, and differences are obvious in a few seconds.
- [ ] Build the frontend controls for deadspace preview/export once Srujan exposes the backend behavior.
- [ ] Keep frontend work moving against fixture data if live analysis is not ready yet.

**Definition of done:**

- A first-time user can upload, wait, inspect results, and understand what to do next.
- The results page feels demo-worthy.
- The compare page tells a clear story about which cut wins and why.

### Task 4: Srujan - Heuristics, Deadspace Workflow, and Backend Reliability

**Files:**
- Modify: `apps/api/app/services/analysis_engine.py`
- Modify: `apps/api/app/services/media.py`
- Modify: `apps/api/app/services/storage.py`
- Modify: `apps/api/app/routers/api.py`
- Test: `apps/api/tests/test_engine.py`
- Test: `apps/api/tests/test_api.py`

**Mission:** Make the backend output more actionable and turn deadspace suggestions into a real, narrow edit workflow.

**Dependencies:** Needs the contract freeze from Shreyas. Can otherwise work in parallel with Shashank.

**Unblocks:** Shashank

- [ ] Tighten marker logic and suggestion wording so the app sounds precise and creator-friendly instead of generic.
- [ ] Improve score explanations and compare reasoning so the backend output clearly supports the winner and recommendation text.
- [ ] Turn deadspace ranges into a small but real workflow: preview the proposed cuts, apply them deterministically, and export the trimmed result.
- [ ] Keep the edit scope constrained to deadspace removal only. No generalized editing behavior.
- [ ] Make sure exported artifacts are easy for the frontend to link to and explain.
- [ ] Add tests around deadspace detection, score generation, compare behavior, and the trim/export path.
- [ ] Fail loudly and clearly when media processing cannot complete.

**Definition of done:**

- Deadspace output is not just informational; it drives a usable preview/export flow.
- Suggestions sound actionable.
- The API is reliable enough that the frontend is not compensating for backend ambiguity.

## Handoff Checkpoints

### Day 1 - Morning

- [ ] Shreyas freezes the API contract and publishes a known-good payload fixture.
- [ ] Sanjay locks name, headline, tagline, and visual tokens.
- [ ] Shashank starts implementing against the fixture instead of waiting for live inference.
- [ ] Srujan starts on marker quality and export-path design.

### Day 1 - Evening

- [ ] Landing, upload, and processing states follow the brand system.
- [ ] Analysis page uses the real contract shape.
- [ ] Backend can produce at least one stable analysis result or fallback fixture.

### Day 2 - Midpoint

- [ ] Results page feels coherent and synced.
- [ ] Compare page clearly declares a winner.
- [ ] Deadspace preview/export path exists end-to-end.

### Final Freeze

- [ ] No new features after the first full successful demo run.
- [ ] Only bug fixes, copy polish, animation polish, and demo-script improvements after freeze.
- [ ] Everyone tests the same golden path with the same clips.

## Golden Demo Path

- Landing page explains the product in one screen.
- User uploads a short clip.
- Processing state feels active and intentional.
- Results page shows brain/timeline insight, markers, recommendation, and scorecards.
- Deadspace preview/export shows a concrete improvement action.
- A/B compare shows a clear winner and why.

## Demo-Kill Risks

- Contract changes after frontend work begins
- Live model instability without a fallback
- Branding that promises more than the product actually does
- Scope creep into a full editor
- Compare and export left until the last few hours

## Success Criteria

- The app runs end-to-end without explanation from the engineer driving it.
- The brain-response view is memorable.
- The recommendations sound useful, not random.
- The A/B winner feels believable.
- The team can work independently because ownership boundaries are clear.
