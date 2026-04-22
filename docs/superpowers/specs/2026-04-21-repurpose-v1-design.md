# Repurpose V1 Design

**Goal:** Add a dedicated authenticated product lane called `Repurpose` that turns one uploaded source video into three alternate exports built only from the original footage through segment selection, trimming, reordering, and stitching.

## Product Direction

The chosen direction is **Repurpose as a separate product path**.

- `Repurpose` is a sibling to Scan, Compare, and AI Editor.
- It is not a tab or mode inside AI Editor.
- It accepts exactly one source video per project.
- It returns exactly three exports in v1.
- The exports are generated from the source footage only.

`Repurpose` should feel like a deliverables workflow:

- upload one finished source
- let the system find reusable beats
- receive multiple alternate cuts for posting or testing

## V1 Boundary

Included:

- one source video upload per project
- automatic segmentation into internal beats
- AI-selected angle summaries
- one near-source-duration cut
- two shorter cuts when the source is long enough
- deadspace trimming
- internal reordering
- exported downloadable videos

Explicitly excluded:

- synthetic edits
- generated captions
- overlays or hook cards
- voice rewriting
- generated B-roll
- user-editable repurpose presets

## Output Rules

Each completed repurpose project produces three variants.

### Variant 1: Full-Length Repurpose

- stays close to the source duration
- may reorder internal beats
- may remove deadspace and clearly weak stretches
- should preserve broad narrative completeness

### Variant 2 and 3: Short Repurposes

- if the source video is longer than roughly `30` to `45` seconds, both shorter variants should target about `20` seconds
- if the source video is shorter than that threshold, the short variants may be shorter than the source but should still be materially different from the full-length variant
- the system chooses the angle for each variant from the source material itself

## Naming

The new lane should be named `Repurpose`.

Why:

- it says exactly what the user is asking for
- it is stronger and clearer than `Variants`
- it is broader and more outcome-focused than `Recut`

## Information Architecture

Add two authenticated routes:

- `/app/repurpose`
- `/app/repurpose/[projectId]`

### Repurpose Home

The home page should:

- explain the promise in one sentence
- let the user create a new repurpose project
- list recent repurpose projects
- show status, source filename, last result summary, and variant count

### Repurpose Project Page

The project page should:

- accept a single source upload
- show upload state and source metadata
- allow generation once the source is fully uploaded
- poll for the latest repurpose result while running
- render the three output variants once ready

The completed state should emphasize deliverables, not editing controls:

- source summary
- three variant cards
- each card shows duration, angle summary, and rationale
- each card includes a playable video preview

## Domain Model

Repurpose needs its own Convex entities.

### `repurposeProjects`

Fields:

- `userId`
- `title`
- `status`
- `sourceUploadId`
- `latestLocalResultId`
- `sourceFilename`
- `sourceDurationSec`
- `variantCount`
- `summary`
- `errorMessage`
- timestamps

This table represents the durable project record shown in the product UI.

### `repurposeVariants`

Fields:

- `projectId`
- `variantKey`
- `title`
- `angleSummary`
- `durationTarget`
- `durationSec`
- `exportUrl`
- `exportStorageId`
- `position`
- timestamps

This table gives the app lightweight per-variant summaries for project history and the project page.

## API Contracts

Add a dedicated API family:

- `POST /api/repurpose/generate`
- `GET /api/repurpose/projects/{projectId}/latest-result`

The generate request should include:

- `convexProjectId`
- `sourceUploadId`
- `localUploadId`
- `filename`

The response model should mirror the editor draft pattern:

- queued/running/completed/failed lifecycle
- progress stage
- status message
- full payload on completion

The completed payload should include:

- source video summary
- project-level summary
- three variant outputs
- per-variant segment/rationale metadata

## Worker Design

The FastAPI worker should create a dedicated repurpose job service.

### Step 1: Prepare Source

- load the uploaded source video
- inspect metadata
- summarize speech-driven content with the current editor AI provider
- derive deadspace candidates through the existing analysis engine heuristics

### Step 2: Build Candidate Segments

Create reusable internal beat segments from the source video.

V1 should derive candidate segments from:

- speech segments returned by the editor AI summarizer
- merged nearby speech windows
- fallback windows when speech coverage is sparse

Each segment should carry:

- segment id
- source start/end
- transcript preview
- short summary
- speech coverage hint

### Step 3: Ask the AI for Three Variant Plans

The AI provider should choose:

- a full-length repurpose angle
- two shorter alternate angles

For each variant it should return:

- a title
- an angle summary
- an ordered list of segment ids
- a rationale

### Step 4: Render Exports

Render each variant by stitching together kept source intervals from the original file.

No synthetic edits are allowed in v1.

### Step 5: Persist Result

Persist:

- the job record and payload in FastAPI storage
- project-level status and summary in Convex
- one row per variant in `repurposeVariants`

## Shared Infrastructure Reuse

This feature should reuse existing primitives where they already fit:

- `uploads` flow for source ingestion
- `StorageService` for local result persistence
- `MediaService.assemble_sequence` for export rendering
- editor AI provider plumbing for transcript-aware summarization
- Convex service-secret bridge for status and summary sync

This feature should not reuse `editorProjects` directly because the domain shape is different:

- AI Editor: many source clips to one draft
- Repurpose: one source video to many variants

## Error Handling

The project should fail cleanly when:

- the source upload is missing
- the AI provider is unavailable
- segment extraction produces no usable beats
- rendering fails

The UI should surface:

- queued/running/completed/failed state
- a status message during generation
- a single concise error message when failed

## Testing

V1 requires coverage in:

- FastAPI request/worker tests for repurpose generation
- storage and hydration of completed repurpose payloads
- web component tests for home and project flows
- route-level wiring for the new product path

The critical assertions are:

- generation creates three variants
- the completed payload exposes variant metadata and export URLs
- the project page disables generation until upload is ready
- the completed page renders three distinct variants
