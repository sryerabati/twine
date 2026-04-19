# Read The Room MiroFish Design

## Goal

Replace the current Gemini-based fallback "brain scan" behavior with an explicitly non-neural analysis mode called `Read the room`. This mode should predict likely audience reaction to a video by generating a normalized video brief, feeding that brief into MiroFish, and rendering a moment-by-moment audience sentiment timeline in the existing scan experience.

This work should preserve the eventual role of `tribe` as the true brain-response backend. The Gemini fallback path is temporary and should stop presenting itself as a proxy brain scan once `Read the room` exists.

## Product Intent

`Read the room` answers: "How is an audience likely to react to this video over time?"

Primary output:
- consumer sentiment outlook

Secondary output:
- likely praise themes
- likely rejection or skepticism themes
- likely confusion points
- likely shareable moments
- likely drop-off risk

This mode must not imply:
- medical analysis
- mind reading
- actual live audience measurement
- cortical or neurological inference

## Recommended Approach

Implement `Read the room` as a new backend mode built on a two-stage pipeline:

1. Generate a normalized `video brief` from the uploaded media using existing transcript and media-feature extraction.
2. Send that brief to a MiroFish adapter that returns structured audience-outlook JSON.

Recommendation rationale:
- MiroFish is better suited to simulation from structured seed material than direct raw-video analysis.
- The current Gemini fallback contract is shaped like pseudo-neural output; keeping that shape without semantic separation will keep misleading the UI.
- A separate backend mode allows the app to preserve the current timeline-driven UX while changing the meaning of the data cleanly.

## Scope

In scope:
- add `mirofish` as an analysis backend
- define a `Read the room` response contract
- generate a normalized video brief before simulation
- render a timeline of audience sentiment shifts by moment
- update product copy and labels so this mode is explicitly audience-outlook based

Out of scope:
- replacing or redesigning the editor workflow
- changing Convex persistence architecture beyond storing the new payload shape
- implementing the real TRIBE model path
- making claims of accuracy against real-world viewer analytics

## Existing Constraints

- The current stack has a single analysis payload contract centered on `brainResponse`.
- The current Gemini fallback is normalized into that contract and displayed in the same UI.
- The frontend already has a strong timeline-based analysis experience that should be preserved.
- The backend already extracts media features and transcript-derived heuristics that can be reused for brief generation.

## Architecture

### 1. Backend Selection

Add `mirofish` to `ANALYSIS_BACKEND`.

Supported backends after this change:
- `tribe`: actual brain-response analysis
- `mirofish`: audience-outlook simulation

The old Gemini analysis backend should be removed or demoted behind the MiroFish adapter, depending on whether a separate LLM is still needed to help assemble the brief.

### 2. Video Brief Generation

Create a normalized `video brief` object before provider invocation. This object should be backend-facing and not necessarily exposed directly to the UI.

Required brief sections:
- video metadata
  - duration
  - aspect ratio
  - file timestamps if available
- transcript package
  - full transcript when available
  - compressed transcript summary
  - speech density by time window
- scene and pacing package
  - shot-change density
  - motion score by time window
  - audio energy by time window
  - silence segments
- content interpretation
  - hook description
  - CTA or ask detection
  - topic
  - tone
  - likely target audience
  - key claims or promises
- timeline windows
  - fixed windows aligned with the current analysis timeline resolution
  - per-window summary notes for what happens in that interval

### 3. MiroFish Adapter

Add a dedicated service, likely `mirofish_runner.py`, parallel to the existing provider services.

The adapter should:
- accept the normalized video brief
- package it into the seed material format MiroFish expects
- request an audience-reaction simulation focused on consumer sentiment
- return strict structured JSON

The adapter is responsible for translating MiroFish’s broader simulation output into Twine’s narrower audience-outlook contract. The rest of the app should not depend on raw MiroFish response format.

### 4. Response Contract Split

The app should stop forcing all analysis payloads into a `brainResponse` model.

Recommended payload model:
- top-level `analysisMode`
  - `brain_scan`
  - `read_the_room`
- mode-specific payload section

For `read_the_room`, replace `brainResponse.timeSeries` semantics with audience-reaction semantics.

Recommended timeline point shape:
- `startSec`
- `endSec`
- `sentiment`
  - normalized 0-1 or -1 to 1 scale, but pick one and standardize it
- `interest`
- `clarity`
- `trust`
- `shareIntent`
- `dropoffRisk`
- `controversyRisk`
- `primaryReaction`
- `note`

Recommended marker types:
- `interest_spike`
- `confusion_point`
- `skepticism_risk`
- `shareable_moment`
- `dropoff_risk`
- `sentiment_recovery`

Recommended summary fields:
- `overallAudienceOutlook`
- `likelyPraise`
- `likelyPushback`
- `likelyAudienceSegments`
- `keyRisks`
- `recommendation`

### 5. Frontend Rendering

Preserve the existing analysis screen structure where possible:
- video player
- timeline
- markers
- summary
- recommendations

But when `analysisMode=read_the_room`, the UI must change language:
- `Brain scan` -> `Read the room`
- `activation` -> `audience sentiment` or `audience reaction`
- `rewatch` markers -> `shareable moment` where appropriate
- `attention drop` -> `drop-off risk` or `audience cooling`

The user should be able to scrub through the same timeline interaction model, but the panel copy, legend, and badges must reflect audience simulation rather than neural activity.

### 6. Persistence and Compatibility

Persist the normalized `read_the_room` payload through the same analysis records pipeline used today.

Compatibility strategy:
- add discriminated unions in API and frontend contracts
- preserve old payload support for existing saved scans
- avoid rewriting historical records unless needed

## Data Model Design

Recommended discriminated union:

- `analysisMode: "brain_scan"` with `brainResponsePayload`
- `analysisMode: "read_the_room"` with `audienceOutlookPayload`

This is preferable to overloading current brain fields because:
- naming becomes truthful
- frontend rendering can branch cleanly
- future TRIBE integration will not be polluted by fallback semantics

## Error Handling

The MiroFish path should fail clearly when:
- the adapter service is unavailable
- the brief cannot be generated
- transcript extraction is too sparse to support a reliable prediction
- MiroFish returns malformed or incomplete JSON

User-facing failure copy should say:
- audience outlook could not be generated

It should not say:
- brain scan failed

Low-confidence runs should still return payloads when possible, with:
- low confidence band
- explicit warnings about limited transcript coverage, ambiguous topic, or weak signal

## Testing Strategy

Backend tests:
- brief generation from representative transcript and media features
- MiroFish adapter response normalization
- malformed provider response handling
- contract serialization for `read_the_room`

Frontend tests:
- discriminated rendering for `brain_scan` vs `read_the_room`
- timeline labels and markers switch correctly
- no brain-scan copy appears in `read_the_room` mode
- existing saved scan rendering remains intact

Integration tests:
- upload -> analyze -> persisted result -> detail page render for `mirofish`

## Rollout Plan

Phase 1:
- add backend enum, adapter, and contract
- wire a mocked or local MiroFish response path

Phase 2:
- update frontend labels and mode-specific rendering
- preserve current page layout

Phase 3:
- optionally remove direct Gemini fallback analysis references from docs and env defaults

## Open Decisions Resolved

Resolved:
- Mode name: `Read the room`
- Primary optimization target: consumer sentiment
- Display pattern: keep a moment-by-moment timeline
- Input to MiroFish: generated summary, transcript, and metadata package rather than raw video

## Risks

1. MiroFish is a simulation platform, not a simple single-call classifier.
This may require a dedicated adapter service or local deployment rather than a small provider wrapper.

2. The current analysis contract is too brain-centric.
Trying to reuse it without a discriminated split will keep semantics muddy and UI copy misleading.

3. Timeline fidelity depends on preprocessing quality.
If brief windows are too coarse or transcript summaries are weak, the moment-level sentiment curve will feel invented instead of grounded.

## Final Recommendation

Build `Read the room` as a first-class `mirofish` backend with its own truthful audience-outlook payload and a preserved timeline UX. Do not continue presenting the Gemini fallback as a brain scan, and do not force audience-simulation output into neural-response naming.
