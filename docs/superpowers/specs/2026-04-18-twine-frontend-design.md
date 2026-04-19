# Twine Frontend Redesign Design

**Goal:** Transform the current `Cortent` frontend into `Twine`: a dark, modern, pink-accented product experience with a minimal landing page, a cleaner upload-first dashboard, and focused scan results that surface only the most important information.

## Product Direction

The chosen direction is **Poster + Command Deck**.

- The public landing page behaves like a poster, not a brochure.
- The authenticated product behaves like a command surface, not a dashboard card mosaic.
- The scan workspace behaves like a premium review tool with clear hierarchy, not a dense debug console.

This redesign keeps the app’s existing value proposition intact:

- upload a file
- run a scan
- review the verdict
- act on the result
- revisit saved scans later

It removes the redundant explanation, duplicate proof sections, and light-theme card density that currently make the product feel more like an early SaaS template than a deliberate product.

## Visual Thesis

`Twine` should feel like a dark creative-analysis system lit by sakura pink.

- Base surfaces: charcoal, black, soft graphite
- Accent family: light sakura pink plus darker rose and blush shades
- Typography: strong display type for headlines, quiet utility text for product UI
- Composition: large visual planes, low chrome, high contrast, deliberate whitespace
- Motion: subtle, smooth, and noticeable enough to give presence without slowing task flow

The design should avoid:

- bright white surfaces as the default
- stacked marketing cards
- repeated explainer copy
- decorative gradients behind routine product UI
- multiple unrelated accent colors

## Information Architecture

The redesign keeps the current route skeleton where practical, but changes how each route behaves.

### Public routes

- `/`
  - Minimal landing page
  - One headline
  - One short supporting line
  - Primary CTA to login or open dashboard
  - One restrained product preview

### Authenticated routes

- `/app`
  - Main command deck
  - Single upload is the default mode
  - `A/B test` is a deliberate secondary mode switch
  - Recent scans remain visible but secondary

- `/app/library`
  - Saved scans list
  - Cleaner, denser, darker treatment
  - Single scans and compare scans appear in one unified library

- `/app/scans/[scanId]`
  - Single-scan workspace
  - Hybrid presentation: strong summary first, deeper controls below

- `/app/compare/[compareScanId]`
  - Dedicated compare results page
  - Represents one saved compare scan
  - Links back to the underlying source analyses only as secondary controls

### Transitional route handling

The current `/compare?a=...&b=...` page is an implementation artifact. The redesign should treat it as legacy routing and move product traffic to a persisted compare-scan route.

## Core User Journeys

### 1. Landing to dashboard

1. User lands on `/`
2. User sees `Twine` branding immediately
3. User reads one short statement of value
4. User clicks `Login` or `Open dashboard`
5. User enters the authenticated workspace

The landing page should not try to explain every subsystem. Its job is to establish brand, product category, and action.

### 2. Single upload flow

1. User lands on `/app`
2. Default mode is single upload
3. User drags in or uploads one file
4. The app creates the saved scan and starts analysis
5. User is routed directly into the single scan workspace

The dashboard should make this flow feel immediate and obvious. The upload zone is the center of gravity.

### 3. A/B upload flow

1. User lands on `/app`
2. User switches to `A/B test`
3. User uploads two files
4. The app creates one compare scan record
5. The app routes to the dedicated compare results page

This is an important product change: the compare experience should count as one saved scan, not two separate scans plus an ad hoc compare view.

### 4. Scan review flow

1. User lands on a scan page
2. User immediately sees verdict, key scores, and next actions
3. User reviews the video or compare result
4. User opens deeper detail only when needed
5. User exports or returns to the library

The page should answer “what happened, why, and what do I do next?” before showing supporting detail.

## Screen-Level Design

## Landing Page

The landing page should be full-bleed and dark, with `Twine` as the loudest text on screen.

### Content

- Brand first
- Headline second
- One sentence of support
- One primary CTA
- One secondary CTA only if needed
- One product preview visual

### Remove from landing

- feature triplets that restate the same value
- repeated “brain scan” explanations
- long workflow descriptions
- multiple proof blocks
- library/history promotional sections

### Keep on landing

- strong brand presence
- product category clarity
- direct route into the app
- enough preview to imply the product is real

## App Shell

The shell should shift from a bright, padded SaaS layout to a darker, more compact navigation frame.

### Changes

- Rename all product branding from `Cortent` to `Twine`
- Replace warm light gradients with dark surfaces and pink-lit accents
- Simplify header copy
- Reduce footer copy or remove it entirely
- Keep navigation compact and utility-first
- Show status or health only when it matters

### Navigation structure

- Dashboard
- Scans
- Compare or Compare scans
- Sign out

If `Library` remains the right label for the stored work, it should still look quieter than the primary upload workspace.

## Dashboard Command Deck

The dashboard should center one primary action: start a scan.

### Primary layout

- Left or top navigation frame
- One main content area
- Upload module at the top of the workspace
- Secondary recent-scan list below or beside it

### Upload module

- Default mode: single upload
- Secondary mode: `A/B test`
- Large drag-and-drop target
- Clear selected file state
- Minimal helper text
- Strong primary action button

### Information pruning

Remove or demote:

- repeated “how the backend works” copy
- large fact grids that repeat what the upload module already implies
- health explainer blocks when the system is healthy

Retain:

- meaningful blockers
- upload readiness
- recent scans

## Single Scan Workspace

The single scan page should be a restrained hybrid: premium in feel, but still operational.

### Top section

The first screen should establish:

- filename or scan name
- top-line verdict
- 3 to 4 key scores
- status
- last export if present
- one clear next action

### Primary workspace below

The main analysis area should prioritize:

- video review
- scan visualization
- concise action board
- export controls
- cut selection

### Secondary information

Move low-priority detail down the page or collapse it behind toggles:

- artifact download links
- raw diagnostics
- verbose summaries
- dense repeated badges
- anything that exists mainly for debugging

### Copy style

Use utility copy, not marketing copy.

Good examples:

- `Top signal`
- `Why this scored lower`
- `Selected cuts`
- `Latest export`

Avoid:

- long mood statements
- explanations of internal pipeline mechanics
- repeated descriptions of the same recommendation

## Compare Scan Workspace

The compare page should feel distinct from the single scan page while still belonging to the same system.

### Purpose

It should answer:

- which version won
- why it won
- where the difference came from
- what to ship next

### Top section

- winner
- short reason
- top deltas
- confidence indicator if meaningful
- CTA to save or return

### Main layout

- aligned compare summary
- side-by-side or stacked metrics
- strongest moments or slices
- concise recommendation

### Data model requirement

This page needs a persisted compare-scan concept, not only query params.

Recommended data contract:

- `scanType`: `single` or `compare`
- compare scan stores both source uploads
- compare scan stores both analysis ids
- compare scan stores winner, summary, and compare slices
- compare scan appears once in the saved library

This is a product requirement, not merely a visual treatment.

## Shared Component and Styling Strategy

The redesign should consolidate the visual system in shared primitives instead of scattering one-off classes across each page.

### Shared styling work

- replace the current light token set in `globals.css` with a dark token system
- define a sakura-pink accent scale
- create a smaller set of surface treatments
- reduce heavy border use
- use glow and contrast sparingly and consistently

### Shared component work

- upload dropzone
- mode switch
- metric cluster
- scan summary header
- compare summary header
- artifact drawer or secondary details panel
- simplified scan list item

## Motion

Motion should support hierarchy and mode changes.

### Required motions

- landing hero entrance sequence
- soft glow or depth response on the hero visual
- smooth state transition when switching between single upload and `A/B test`
- restrained reveal for scan summary content after load

### Motion constraints

- smooth on mobile
- fast
- not decorative for its own sake
- no generic floating-card choreography

## Content Cleanup Rules

The redesign should aggressively cut copy.

Rules:

- if a sentence repeats something already clear from the heading or UI, delete it
- if a section does not help convert, orient, or decide, remove it
- if the interface still works without a box, remove the box
- if a page starts feeling like a feature list, compress it

## Technical Implications

This is mostly a frontend redesign, but one requirement changes data behavior:

- `A/B test` must count as one saved scan

That means the current flow of creating two separate scan records and navigating to `/compare?a=...&b=...` is not enough. The implementation plan should include the minimum backend and contract work needed to support one persisted compare scan in Convex and the corresponding route in the web app.

Everything else can largely build on the current route and component structure:

- `landing-client.tsx`
- `app-shell.tsx`
- `dashboard-home.tsx`
- `upload-workbench.tsx`
- `scan-detail-client.tsx`
- `analysis-view.tsx`
- `compare-view.tsx`
- `globals.css`
- route files under `src/app`

## Testing Strategy

The redesign plan should verify both presentation and behavior.

### Route and state coverage

- landing page renders new brand and minimal CTA structure
- dashboard defaults to single upload mode
- switching to `A/B test` changes the upload surface correctly
- single upload routes into a single scan workspace
- compare upload routes into a dedicated compare scan page
- compare scan is represented as one saved record in the UI

### Component coverage

- upload dropzone states
- mode switch states
- summary header rendering
- compare winner rendering
- collapsed secondary details

### Regression coverage

- auth gate still works
- existing scan loading and empty states still work
- responsive layout remains usable on mobile

## Final Design Summary

`Twine` should feel sharper, darker, quieter, and more intentional than the current product.

- The landing page sells one idea.
- The dashboard centers one action.
- The scan page shows the answer before the evidence.
- The compare flow becomes a real saved product flow, not a temporary utility page.

That is the design target the implementation plan should execute.
