# Twine Landing Page Dual-Lane Design

**Goal:** Redesign the public landing page so it amplifies the site's existing cartoony feel while presenting Twine's analysis and AI editor workflows as equal parts of the product. The page should feel like a playful poster with disciplined component boundaries, not a generic SaaS homepage.

## Product Direction

The chosen direction is **Dual-Lane Poster**.

- The landing page sells two equal verbs:
  - scan the cut
  - build the cut
- The page keeps the existing 3D brain model as a core hero asset rather than demoting it to a secondary graphic.
- The AI editor gets equal narrative weight through its own dedicated hero-side visual and section-level story.
- The overall page becomes louder, more playful, and more obviously branded than the current implementation, but it should still feel compatible with the in-app product surfaces.

This direction is intentionally not a full site redesign. It applies to the public landing page only.

## Visual Thesis

`Twine` should feel like a cartoon poster for a creative tool that helps teams decide what to post and shape a stronger cut fast.

- Mood: playful, bold, tactile, slightly exaggerated
- Material language: chunky borders, sticker labels, offset shadows, rounded planes, layered shapes
- Color system: preserve the current dark green foundation, then push contrast and layering instead of introducing a new palette
- Typography: keep the existing display personality, but use larger, more theatrical scale changes on the landing page
- Motion: buoyant and intentional, with wobble, float, and small depth shifts that make the page feel alive without becoming noisy

The page should avoid:

- flattening into a minimal SaaS layout
- replacing the existing visual language with a different design system
- equal-weight card grids as the dominant composition
- long explanatory copy blocks that drain energy from the poster feel
- making the analysis workflow feel primary and the editor workflow feel bolted on

## Core Message

The current landing page is too linear: it frames Twine mainly as an analysis tool with editing attached later in the story.

The redesigned page should communicate:

- Twine helps you understand which cut works
- Twine also helps you assemble the next cut faster
- these are two connected parts of one workflow

The page should read as:

1. understand the signal
2. shape the stronger version
3. ship with more confidence

## Information Architecture

The landing page should be restructured into five sections.

### 1. Hero

Job: establish Twine's brand, product category, and dual-lane promise in one glance.

Required content:

- prominent brand presence
- short headline
- short support copy
- primary CTA
- optional secondary CTA
- two equal visual anchors:
  - the existing 3D brain model for analysis
  - a new AI editor visual for rough-cut creation

### 2. Shared Bridge Section

Job: explain the combined workflow in one short beat before splitting into deeper lanes.

Required content:

- a compact explanation that Twine is both a decision tool and a rough-cut tool
- 2 to 3 short workflow markers that connect the two product verbs

### 3. Analysis Lane

Job: show how Twine helps teams read an edit before it goes live.

Required content:

- hook, pacing, clarity, and comparison framing
- continued use of the brain/scan language
- one clear CTA or continuation prompt

### 4. Editor Lane

Job: show how Twine helps teams move from raw clips to a usable first pass.

Required content:

- transcript-guided rough cut framing
- story ordering, trimming deadspace, and first-draft generation
- one clear CTA or continuation prompt

### 5. Final CTA

Job: collapse the two lanes back into one decisive action.

Required content:

- short reminder of the combined value
- one strong CTA

## Layout Strategy

### Hero composition

The hero should behave like a full-bleed poster rather than a centered brochure block.

- The main content should still align to a readable inner grid.
- The text column should stay concise and easy to scan.
- The hero visual area should feel staged, with the brain model and editor visual sharing the scene.
- The composition should look intentionally asymmetrical rather than evenly split down the middle.

Recommended layout behavior:

- text and CTA stack on one side or upper-left anchor
- 3D brain remains clearly visible and prominent
- editor visual occupies the opposing visual field
- sticker labels and background shapes help tie both lanes together

### Section rhythm

The sections below the hero should alternate emphasis so the page feels paced, not repetitive.

- Shared bridge: broad and connective
- Analysis lane: one dominant visual story
- Editor lane: one dominant visual story
- Final CTA: simpler and cleaner than the middle sections

## Component Architecture

The landing page should be broken into focused presentational units.

### Keep

- `apps/web/src/components/landing-client.tsx` as the page-level composer
- `apps/web/src/components/landing-brain-model.tsx` as the analysis hero anchor

### Add

- `LandingHero`
- `LandingBridge`
- `LandingFeatureLane`
- `LandingEditorVisual`
- optional small shared primitives for sticker labels or section badges if repetition justifies them

### Responsibilities

`LandingClient`

- owns section ordering
- owns content arrays or section data
- stays mostly declarative

`LandingHero`

- renders brand statement, headline, CTA group, and two-lane hero stage

`LandingBridge`

- renders the compact combined workflow story

`LandingFeatureLane`

- renders either the analysis lane or editor lane from props
- prevents duplicated layout logic while still allowing art-direction differences through props

`LandingEditorVisual`

- gives the editor workflow a hero-quality graphic with the same stylized, chunky, cartoon-adjacent language as the brain model framing

The architecture should avoid creating a single oversized landing component with repeated utility class blocks and inline copy everywhere.

## Visual System Rules

The redesign should amplify the existing site language, not replace it.

### Reuse and extend

- rounded geometry
- chunky 2px borders
- offset shadows
- sticker chips
- dark green surfaces
- animated hero elements

### Amplify

- larger type scale in the hero
- more visible background shapes and layered planes
- more exaggerated section framing
- stronger silhouette separation between major content blocks

### Preserve discipline

- use one accent family
- keep sections readable on mobile
- avoid turning every subsection into a separate card
- keep decorative elements subordinate to message and action

## Motion Direction

Motion should increase personality without adding confusion.

Required motion ideas:

- hero sticker wobble or float
- subtle staged movement between the brain side and editor side
- restrained reveal or lift on lower sections

Motion should not:

- delay understanding
- make CTA targets unstable
- create heavy scroll choreography

## Copy Direction

Copy should be short, product-facing, and energetic.

- keep headlines tight
- keep supporting copy to one short paragraph per section at most
- use verbs and concrete workflow language
- avoid repeated explanations of what the AI is doing internally

The copy should frame Twine as one tool with two co-equal capabilities, not as an analysis product with an editor add-on.

## Responsive Behavior

The poster energy must survive on mobile.

- The hero should collapse into a stacked composition without hiding the 3D brain.
- The editor visual should remain legible when compressed.
- Sticker and decorative elements should reduce in count or reposition on smaller breakpoints.
- Text should remain scannable in the first screen on common phone sizes.

## Implementation Constraints

- Preserve the existing `BrandShell` header structure unless a very small adjustment improves landing-page composition.
- Keep the existing authentication CTA behavior through `PublicAuthLink`.
- Reuse the current `LandingBrainModel` logic unless a change is needed only for framing or presentation.
- Prefer small reusable presentational components over adding more complexity to shared app UI primitives.

## Verification Criteria

The redesign is successful if:

- the first screen clearly presents both analysis and editing as co-equal capabilities
- the 3D brain remains a prominent branded asset
- the landing page feels more cartoony and memorable than the current version
- the component structure is cleaner than the current single-file landing body
- the page remains readable and functional on mobile and desktop
- CTA behavior remains correct for authenticated and unauthenticated users

## Out of Scope

- changing authenticated app routes or dashboard layout
- redesigning the underlying brain visualization implementation
- changing auth flows
- changing Convex data models or backend behavior
