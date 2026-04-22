# Scan Page Next Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the scan page into a player-first editor console with a compact verdict bar, dense decision rail, compact action strip, collapsed evidence drawer, and lighter evidence/feed patterns.

**Architecture:** Keep the current analysis payload and move the redesign entirely into the frontend. `analysis-view.tsx` becomes the layout orchestrator for the compact verdict bar, portrait-first stage, dense right rail, and action strip. `audience-world-panel.tsx` becomes a collapsible evidence drawer with lighter tab content. `scan-secondary-details.tsx` becomes a denser edit-opportunities list with fewer default rows.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Vitest, Testing Library

---

### Task 1: Lock the next-pass behavior in failing tests

**Files:**
- Modify: `apps/web/src/components/__tests__/analysis-view.test.tsx`
- Modify: `apps/web/src/components/__tests__/audience-world-panel.test.tsx`

- [ ] **Step 1: Write the failing layout tests**

```tsx
it("compresses read-the-room into a compact verdict bar and action strip", async () => {
  ...
  expect(screen.getByTestId("scan-verdict-bar")).toBeInTheDocument();
  expect(screen.getByTestId("scan-action-strip")).toBeInTheDocument();
  expect(screen.queryByText(/Top actions/i)).not.toBeInTheDocument();
});

it("renders room evidence as a collapsed drawer before expansion", async () => {
  ...
  expect(screen.getByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Threads" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/analysis-view.test.tsx src/components/__tests__/audience-world-panel.test.tsx`
Expected: FAIL because the current page still renders the large header, exposed evidence panel, and taller edit-opportunity cards.

- [ ] **Step 3: Add failing tests for denser evidence and edit opportunities**

```tsx
it("shows two compact edit opportunities before expansion", async () => {
  ...
  expect(screen.getAllByTestId("edit-opportunity-row")).toHaveLength(2);
});

it("shows two threads first inside the expanded evidence drawer", async () => {
  ...
  await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
  expect(screen.getAllByTestId("audience-world-thread")).toHaveLength(2);
});
```

- [ ] **Step 4: Re-run the focused tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/analysis-view.test.tsx src/components/__tests__/audience-world-panel.test.tsx`
Expected: FAIL with assertion mismatches that confirm the tests are exercising missing next-pass behavior.

### Task 2: Refactor the scan layout into a compact editor console

**Files:**
- Modify: `apps/web/src/components/analysis-view.tsx`
- Test: `apps/web/src/components/__tests__/analysis-view.test.tsx`

- [ ] **Step 1: Implement the compact verdict bar and action strip**

```tsx
<section data-testid="scan-verdict-bar" className="...">
  <p>Read the room</p>
  <h1>{payload.video.filename}</h1>
  <p>{payload.audienceOutlook?.headline ?? payload.summary.overallRecommendation}</p>
  <Badge ...>{describeTrimBadge(trimMode, activeCutIds.length)}</Badge>
</section>

<section data-testid="scan-action-strip" className="...">
  {actionStripItems.map((item) => (
    <button key={item.id} type="button" className="...">
      <span>{item.label}</span>
      <span>{item.timeLabel}</span>
    </button>
  ))}
</section>
```

- [ ] **Step 2: Make the player stage portrait-first**

```tsx
<section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_22rem]">
  <div className="rounded-[1.5rem] border ...">
    <div className="mx-auto w-full max-w-[26rem]">
      <video className="aspect-[9/16] w-full rounded-[1.35rem] ..." ... />
      <RecommendationTimeline ... />
    </div>
  </div>
  <DecisionRailCompact ... />
</section>
```

- [ ] **Step 3: Collapse the right rail into three dense modules**

```tsx
<aside className="space-y-3 xl:sticky xl:top-6">
  <CompactWhatToDo ... />
  <CompactRoomSignal ... />
  <CompactExportPanel ... />
</aside>
```

Remove:
- the large top-action card row
- the separate overall verdict card
- the standalone likely praise and likely pushback cards
- the brain summary as a major rail card

- [ ] **Step 4: Run the analysis-view tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/analysis-view.test.tsx`
Expected: PASS

### Task 3: Turn room evidence into a collapsed drawer with lighter tab content

**Files:**
- Modify: `apps/web/src/components/audience-world-panel.tsx`
- Test: `apps/web/src/components/__tests__/audience-world-panel.test.tsx`

- [ ] **Step 1: Add the drawer shell and collapsed default state**

```tsx
const [isOpen, setIsOpen] = useState(false);

<section className="...">
  <button
    type="button"
    aria-expanded={isOpen}
    aria-controls="room-evidence-panel"
    onClick={() => setIsOpen((current) => !current)}
  >
    {isOpen ? "Collapse evidence drawer" : "Open evidence drawer"}
  </button>
  {!isOpen ? <p>{audienceOutlook.headline}</p> : null}
  {isOpen ? <div id="room-evidence-panel">...</div> : null}
</section>
```

- [ ] **Step 2: Make threads read like a compact feed**

```tsx
const DEFAULT_VISIBLE_THREADS = 2;

<article data-testid="audience-world-thread" className="rounded-[1rem] border ... p-3">
  <div className="flex items-center gap-2">
    <p>{thread.rootPost.speaker}</p>
    <p>{thread.rootPost.handle}</p>
  </div>
  <p className="line-clamp-3">{thread.rootPost.content}</p>
  {visibleReplies.slice(0, 1).map(...)}
</article>
```

- [ ] **Step 3: Make moments a vertical log and keep interviews single-panel**

```tsx
const DEFAULT_VISIBLE_MOMENTS = 6;

<article data-testid="audience-world-moment-row" className="border-l border-primary/25 pl-4">
  <p>{formatMomentTime(...)}</p>
  <p>{moment.headline}</p>
  <p>{moment.reason}</p>
</article>
```

Keep interviews as one selected response at a time, but reduce surrounding card treatment and badge noise.

- [ ] **Step 4: Run the audience-world-panel tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/audience-world-panel.test.tsx`
Expected: PASS

### Task 4: Compress edit opportunities and demote the brain signal

**Files:**
- Modify: `apps/web/src/components/scan-secondary-details.tsx`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Test: `apps/web/src/components/__tests__/analysis-view.test.tsx`

- [ ] **Step 1: Reduce edit opportunities to a denser list**

```tsx
const DEFAULT_VISIBLE_OPPORTUNITIES = 2;

<article data-testid="edit-opportunity-row" className="border-b border-border/70 py-3 last:border-b-0">
  <div className="flex items-center justify-between gap-3">
    <p>{formatSeconds(cut.start)} to {formatSeconds(cut.end)}</p>
    <Badge ...>{active ? "Included now" : "Optional"}</Badge>
  </div>
  <p>{labelForCutType(cut)}</p>
  <p className="truncate">{cut.reason}</p>
</article>
```

- [ ] **Step 2: Move the brain summary out of the primary rail**

```tsx
{isReadTheRoom ? (
  <section className="rounded-[1.25rem] border ... p-4">
    <button type="button" ...>
      Brain signal
    </button>
    {brainOpen ? <CompactBrainSummary ... /> : null}
  </section>
) : null}
```

Use a collapsed utility pattern so the brain metrics no longer compete with the main decision blocks.

- [ ] **Step 3: Re-run the analysis-view tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/analysis-view.test.tsx`
Expected: PASS

### Task 5: Full verification

**Files:**
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/audience-world-panel.tsx`
- Modify: `apps/web/src/components/scan-secondary-details.tsx`
- Modify: `apps/web/src/components/__tests__/analysis-view.test.tsx`
- Create: `apps/web/src/components/__tests__/audience-world-panel.test.tsx`

- [ ] **Step 1: Run the focused redesign tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/analysis-view.test.tsx src/components/__tests__/audience-world-panel.test.tsx`
Expected: PASS

- [ ] **Step 2: Run adjacent UI regressions**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/compare-view.test.tsx src/components/__tests__/upload-workbench.test.tsx`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run build --workspace web`
Expected: PASS with a successful Next.js production build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/analysis-view.tsx apps/web/src/components/audience-world-panel.tsx apps/web/src/components/scan-secondary-details.tsx apps/web/src/components/__tests__/analysis-view.test.tsx apps/web/src/components/__tests__/audience-world-panel.test.tsx docs/superpowers/plans/2026-04-21-scan-page-next-pass-implementation.md
git commit -m "Refactor scan page into a player-first editor console"
```
