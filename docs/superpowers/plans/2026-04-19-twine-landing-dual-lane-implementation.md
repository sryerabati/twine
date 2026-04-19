# Twine Landing Dual-Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page into a cartoony dual-lane poster that presents Twine's scan and AI editor flows as co-equal product stories while keeping the 3D brain prominent.

**Architecture:** Keep `BrandShell`, `PublicAuthLink`, and `LandingBrainModel` as existing anchors, then split the landing page into focused presentational components. Drive the page from small content arrays in `landing-client.tsx`, add one dedicated editor visual component, and verify the new story through Testing Library assertions on the public page structure and CTA behavior.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, Vitest, Testing Library

---

## File Structure

### Create

- `apps/web/src/components/landing-hero.tsx`
- `apps/web/src/components/landing-bridge.tsx`
- `apps/web/src/components/landing-feature-lane.tsx`
- `apps/web/src/components/landing-editor-visual.tsx`

### Modify

- `apps/web/src/components/landing-client.tsx`
- `apps/web/src/components/__tests__/landing-client.test.tsx`
- `apps/web/src/app/globals.css`

## Task 1: Lock the new landing story with tests

**Files:**
- Modify: `apps/web/src/components/__tests__/landing-client.test.tsx`

- [ ] **Step 1: Write the failing test assertions for the new dual-lane story**

```tsx
it("renders a dual-lane poster for signed-out visitors", () => {
  render(<LandingClient />);

  expect(screen.getByText(/Scan what works\. Build what ships\./i)).toBeInTheDocument();
  expect(screen.getByText(/Read the signal before you post and rough-cut the next version fast\./i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Two lanes\. One stronger post\./i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Scan the cut before it goes live\./i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Build the first pass while the footage is still fresh\./i })).toBeInTheDocument();
  expect(screen.getByText(/Hook pressure/i)).toBeInTheDocument();
  expect(screen.getByText(/Transcript-led rough cut/i)).toBeInTheDocument();
  expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
  expect(screen.getByText(/Rough cut engine/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Log in/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /See the workflow/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the landing test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
```

Expected: FAIL because the new headings, labels, and CTA copy do not exist yet.

- [ ] **Step 3: Adjust the authenticated assertion to the new CTA count**

```tsx
it("renders open dashboard CTAs for authenticated visitors", () => {
  authState = "authenticated";

  render(<LandingClient />);

  expect(screen.getAllByRole("link", { name: /Open dashboard/i })).toHaveLength(2);
  expect(screen.queryByRole("link", { name: /Log in/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Re-run the landing test and confirm the new failures are only missing UI text**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
```

Expected: FAIL on missing content assertions, not test setup errors.

## Task 2: Split the landing page into focused presentational components

**Files:**
- Create: `apps/web/src/components/landing-hero.tsx`
- Create: `apps/web/src/components/landing-bridge.tsx`
- Create: `apps/web/src/components/landing-feature-lane.tsx`
- Create: `apps/web/src/components/landing-editor-visual.tsx`
- Modify: `apps/web/src/components/landing-client.tsx`

- [ ] **Step 1: Add the editor-side hero visual component**

```tsx
export function LandingEditorVisual() {
  return (
    <div className="surface relative overflow-hidden rounded-[2rem] p-5">
      <div className="sticker absolute right-4 top-4 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary-foreground">
        Rough cut engine
      </div>
      <div className="grid gap-4 pt-10">
        <div className="surface-soft rounded-[1.5rem] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">
            Transcript-led rough cut
          </p>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-11/12 rounded-full bg-primary/30" />
            <div className="h-3 w-4/5 rounded-full bg-primary/20" />
            <div className="h-3 w-3/5 rounded-full bg-primary/25" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the hero component that stages both product lanes**

```tsx
export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[calc(100svh-73px)] max-w-[92rem] gap-10 px-6 py-10 lg:grid-cols-[0.78fr_1.22fr] lg:px-16 lg:py-14">
        {/* headline + CTA column */}
        {/* dual-lane visual stage with LandingBrainModel + LandingEditorVisual */}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add the bridge and shared feature-lane components**

```tsx
type LandingFeatureLaneProps = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: { label: string; description: string }[];
  tone: "analysis" | "editor";
  visual: ReactNode;
};
```

```tsx
export function LandingBridge() {
  return (
    <section>
      <h2>Two lanes. One stronger post.</h2>
    </section>
  );
}
```

- [ ] **Step 4: Refactor `LandingClient` into data-driven section composition**

```tsx
const analysisPoints = [
  { label: "Hook pressure", description: "..." },
  { label: "A/B judgment", description: "..." },
  { label: "Clarity drift", description: "..." },
];

const editorPoints = [
  { label: "Transcript-led rough cut", description: "..." },
  { label: "Deadspace trim", description: "..." },
  { label: "Story order", description: "..." },
];
```

```tsx
export function LandingClient() {
  return (
    <main className="overflow-x-hidden bg-background">
      <LandingHero />
      <LandingBridge />
      <LandingFeatureLane ... />
      <LandingFeatureLane ... />
      <section>{/* final CTA */}</section>
    </main>
  );
}
```

- [ ] **Step 5: Re-run the landing test and verify the component split passes**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
```

Expected: PASS

## Task 3: Amplify the cartoony visual system in shared landing styles

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add reusable landing-specific utility classes and motion**

```css
.poster-grid {
  background-image:
    linear-gradient(rgba(134, 216, 158, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(134, 216, 158, 0.08) 1px, transparent 1px);
  background-size: 34px 34px;
}

.hero-blob {
  border-radius: 42% 58% 63% 37% / 36% 42% 58% 64%;
}
```

```css
@keyframes float-card {
  0%, 100% { transform: translateY(0px) rotate(var(--float-rotate, 0deg)); }
  50% { transform: translateY(-10px) rotate(calc(var(--float-rotate, 0deg) + 1.5deg)); }
}
```

- [ ] **Step 2: Apply those classes only where the landing page needs them**

Use the new utilities from `LandingHero` and `LandingEditorVisual`, not as global app-shell defaults.

- [ ] **Step 3: Re-run the landing test after the style changes**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
```

Expected: PASS

## Task 4: Run broader verification for the landing refactor

**Files:**
- Modify: none
- Test: `apps/web/src/components/__tests__/landing-client.test.tsx`
- Test: `apps/web/src/components/__tests__/brand-shell.test.tsx`
- Test: `apps/web/src/components/__tests__/auth-gate.test.tsx`

- [ ] **Step 1: Run the focused public-page tests**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx src/components/__tests__/brand-shell.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the broader web test suite if the focused tests stay green**

Run:

```bash
npm run test --workspace web
```

Expected: PASS

- [ ] **Step 3: Inspect the final diff for component boundary sanity**

Run:

```bash
git diff -- apps/web/src/components/landing-client.tsx apps/web/src/components/landing-hero.tsx apps/web/src/components/landing-bridge.tsx apps/web/src/components/landing-feature-lane.tsx apps/web/src/components/landing-editor-visual.tsx apps/web/src/app/globals.css apps/web/src/components/__tests__/landing-client.test.tsx
```

Expected: the landing page is split into focused components, the test reflects the new dual-lane story, and styles are scoped to the landing presentation.
