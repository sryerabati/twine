# Scan Page Next Pass Design

## Summary

The current scan page is more organized than before, but it still behaves like a report. It asks the user to read analysis instead of helping them make one editing decision quickly.

The next pass should turn the scan page into an editor console with one clear interaction model:

1. See the verdict immediately.
2. Inspect the video immediately.
3. Make one or two editing decisions immediately.
4. Open evidence only when needed.

This pass should remove duplicated summary layers, compress the top of the page aggressively, and make the portrait video the visual anchor. The evidence layer should feel like a utility workspace, not a second product page embedded below the player.

## Core Diagnosis

The current page still fails in four ways:

- The player is not the hero.
- The verdict area is too tall and repetitive.
- The right rail reads like another report column instead of a decision rail.
- The evidence section is still too heavy, even with tabs.

The result is a page that looks premium but still feels slow to use.

## Product Goal

The scan page should feel like a hybrid of:

- a short-form video review tool
- a trim-and-inspect workspace
- a collapsible audience evidence console

It should not feel like:

- a long AI report
- a dashboard with equal-weight cards
- a second landing page living below the fold

## Design Principles

### 1. Player-first

The most important object on the page is the video. The page should be visually arranged around inspecting the clip, not reading analysis cards.

### 2. Decision compression

The first screen should answer the user's core question with the fewest possible modules:

- verdict
- top action
- player
- export / trim action

Everything else is secondary.

### 3. Evidence on demand

Threads, cohorts, interviews, and moments should exist behind a lighter utility layer. They should support the decision, not compete with it.

### 4. Portrait-native layout

Most uploaded clips are vertical. The player stage and surrounding layout should be designed for portrait media instead of forcing a wide black letterboxed box.

### 5. One message once

Each key idea should appear only once in the page hierarchy. If a point already exists in the verdict or action strip, it should not be repeated again in world pulse or a second summary card.

## New Page Architecture

### Above the fold

The first screen should contain exactly three zones:

1. Compact verdict bar
2. Main inspection stage
3. Compact right rail

### Page order

1. Compact verdict bar
2. Main inspection stage
3. Edit actions strip
4. Evidence drawer

The current large header block, large top-actions band, and long summary lead-in should be removed.

## Zone 1: Compact Verdict Bar

This replaces the current tall title and intro area.

### Content

- mode label: `Read the room`
- filename
- one verdict sentence
- one status pill for active trims

### Layout

- single horizontal band on desktop
- stacked compactly on mobile
- no large subheading paragraph
- no second explanatory line about what read-the-room means

### Rules

- max height should be roughly one-third of the current header area
- no secondary support text below the verdict
- no separate summary card elsewhere above the player

## Zone 2: Main Inspection Stage

This becomes the true focal area of the page.

### Layout

Desktop:

- left: portrait player stage plus timeline directly beneath it
- right: compact decision rail

Mobile:

- verdict bar
- player stage
- timeline
- right-rail content stacked beneath

### Player stage changes

- Build the stage for portrait clips first.
- The video should sit in a portrait-first frame with much less dead horizontal space.
- The timeline should feel physically attached to the player, not like a separate report card.
- The player container should be the largest element above the fold.

### Timeline changes

- Keep the current seek behavior.
- Reduce visual ornament and badge noise.
- Emphasize edit markers over decorative note count treatment.
- Treat the timeline as an editing instrument, not a storytelling block.

## Zone 3: Compact Decision Rail

The right rail must stop behaving like a vertical report.

### Keep only three modules

1. `What to do`
2. `What the room liked / doubted`
3. `Export`

### Module 1: What to do

This replaces the current combination of top-action cards and overall verdict card.

Content:

- one primary recommended action
- one secondary watch-out
- optional linked moment range

This should be a dense decision module, not three large cards.

### Module 2: What the room liked / doubted

This replaces separate `Likely praise` and `Likely pushback` cards.

Use a split module with:

- left column or top block: `What landed`
- right column or bottom block: `What lost trust`

Cap each side to two short bullets.

### Module 3: Export

Keep:

- trim mode toggle
- export button
- latest export access if present

Move this near the decision content so the action is obvious without scrolling.

### Brain signal placement

The compact brain summary should move out of the primary right rail. It should become a collapsed utility detail beneath export or a footer strip under the main stage.

It should never compete with the main verdict or actions.

## Top Actions Change

The current three-card `Top actions` row should be removed.

It creates too much vertical cost and repeats information already present elsewhere.

Replace it with a narrow action strip directly below the player stage:

- one primary action chip
- one supporting action chip
- one optional test idea

This should feel like an editor toolbar, not a card deck.

## Edit Opportunities Block

This section should remain, but it needs to be tighter and more obviously actionable.

### New behavior

- Show two opportunities by default, not three.
- Each row should fit in a compact list, not a tall card.
- Use left-aligned time range, short title, one-line reason, and action status.
- Keep `Show all cuts`.

### Content structure

Each item should be formatted like:

- time range
- cut type
- short reason
- included now / optional

The recommendation sentence should be visually secondary.

## Evidence Drawer

The evidence workspace should still exist, but it should read like a tool tray opened after the main decision is understood.

### Structural change

The full-width evidence section should become a collapsible `Evidence drawer` with a compact header:

- title
- hydration status
- thread count
- open / collapse control

Default state:

- collapsed to a short summary preview

Expanded state:

- tabs plus active evidence content

This immediately lowers the page's perceived heaviness.

## Evidence Tab Redesign

### Threads

Threads should look like a comment feed, not premium cards.

#### Rules

- show 2 threads by default
- use denser rows
- root post first, replies tucked beneath
- keep platform and stance as the only prominent badges
- metadata like engagement should be quiet inline text

#### Layout

- avatar / name / role
- compact root post bubble
- up to 1 visible reply
- `Expand thread` reveals more

### Cohorts

Cohorts should be small strategic summaries, not content blocks.

#### Layout

- simple 2-column grid on desktop
- each card should only include:
  - cohort name
  - leaning
  - what landed
  - blocker

Representative agents should be reduced to a short inline line, not a featured content region.

### Interviews

Interviews should feel like querying one persona at a time.

#### Layout

- left: list of agents
- top right: prompt chips
- main right: one response panel

#### Rules

- default to one selected agent
- one response visible at a time
- no giant prose blocks by default
- use a preview with `Read full response`

### Moments

Moments should stop rendering as equal-weight cards.

#### Replace with

- a narrow vertical log
- each row contains:
  - time range
  - moment label
  - short reason
  - linked cohort or thread

This tab should feel like an annotation log, not a gallery.

## Visual Hierarchy Rules

### Reduce green dominance

Bright green should be reserved for:

- the primary CTA
- active timeline / active trim states
- live status

Everything else should use quieter text and borders.

### Reduce card count

The current page still has too many bordered blocks competing for attention.

The next pass should:

- merge modules where possible
- replace some cards with lists
- replace some lists with inline rows

### Tighten text density

Default line limits:

- verdict: 1 sentence
- action strip item: 1 line
- thread root: 3 lines
- reply: 2 lines
- interview preview: 6 lines
- moment row: 2 lines

## Content Deduplication Rules

The next pass must remove these duplicates:

- headline + overall verdict duplication
- top actions + edit opportunities overlap
- likely praise / pushback + world pulse overlap
- decision rail summary + evidence header summary overlap

One message should appear once, in the place where it is most useful.

## Component Changes

### `analysis-view.tsx`

Refactor into these responsibilities:

- compact verdict bar
- main inspection stage
- compact decision rail
- action strip
- evidence drawer host

This file should orchestrate layout, not hold repeated summary blocks.

### `scan-secondary-details.tsx`

Refactor into a denser edit-opportunities list.

### `audience-world-panel.tsx`

Refactor from a full exposed report into:

- collapsible drawer shell
- tabbed evidence utility
- lighter thread feed
- lighter moment log

If needed, split this file into smaller subcomponents because it is taking on too many jobs.

## Success Criteria

The next pass is successful if a user can do all of these within one screen:

1. Understand whether the video is working.
2. See the video itself as the page anchor.
3. Know the first edit to make.
4. Export without needing to read the evidence layer.

The evidence layer is successful only if it feels optional and fast to inspect.

## Explicit Kill List

Remove or demote these behaviors:

- large top action cards
- duplicate summary blocks
- full-width evidence section opened by default
- oversized thread cards
- moments as a grid of large equal-weight cards
- brain signal as a major mid-page block
- portrait video sitting in a wide stage with too much dead space

## Recommended Implementation Order

1. Compress the header into a verdict bar.
2. Rebuild the player area for portrait-first media.
3. Collapse the right rail into three dense modules.
4. Replace top-action cards with a compact action strip.
5. Turn evidence into a collapsed drawer.
6. Simplify each evidence tab to feed/list patterns instead of stacked cards.

## Non-Goals

This pass should not:

- add new backend payload fields
- change simulation behavior
- redesign unrelated app pages
- add decorative motion for its own sake

This is a hierarchy and interaction-cost pass, not a feature expansion pass.
