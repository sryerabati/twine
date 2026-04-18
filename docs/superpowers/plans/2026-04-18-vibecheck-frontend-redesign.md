# VibeCheck Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `VibeCheck` rebrand and full frontend redesign across the public landing page, authenticated app shell, upload-first dashboard, single scan workspace, and a persisted compare-scan flow where `A/B test` counts as one saved scan.

**Architecture:** Keep the current Next.js + Convex app structure, but widen the existing `scans` record to support both `single` and `compare` scan rows, then refactor the UI around a dark token system, smaller presentation components, and route helpers that send compare scans to a dedicated `/app/compare/[scanId]` page. Preserve the existing single-scan pipeline and treat `/compare?a=...&b=...` as a legacy compatibility surface during the transition.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui primitives, Convex auth/data, Vitest + Testing Library

---

## File Structure

### Create

- `apps/web/src/app/app/compare/[scanId]/page.tsx`
- `apps/web/src/components/compare-scan-detail-client.tsx`
- `apps/web/src/components/scan-summary-header.tsx`
- `apps/web/src/components/scan-secondary-details.tsx`
- `apps/web/src/components/upload-dropzone.tsx`
- `apps/web/src/lib/scan-presenter.ts`
- `apps/web/src/lib/__tests__/scan-presenter.test.ts`
- `apps/web/src/components/__tests__/landing-client.test.tsx`
- `apps/web/src/components/__tests__/scan-cards.test.tsx`
- `apps/web/src/components/__tests__/compare-scan-detail-client.test.tsx`

### Modify

- `.gitignore`
- `convex/schema.ts`
- `convex/scans.ts`
- `apps/web/src/lib/contracts.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/compare/page.tsx`
- `apps/web/src/components/brand-shell.tsx`
- `apps/web/src/components/landing-client.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/auth/auth-gate.tsx`
- `apps/web/src/components/auth/login-panel.tsx`
- `apps/web/src/components/dashboard-home.tsx`
- `apps/web/src/components/upload-workbench.tsx`
- `apps/web/src/components/scan-cards.tsx`
- `apps/web/src/components/scan-library.tsx`
- `apps/web/src/components/scan-detail-client.tsx`
- `apps/web/src/components/analysis-view.tsx`
- `apps/web/src/components/compare-view.tsx`
- `apps/web/src/components/__tests__/auth-gate.test.tsx`
- `apps/web/src/components/__tests__/upload-workbench.test.tsx`
- `apps/web/src/components/__tests__/analysis-view.test.tsx`
- `apps/web/src/components/__tests__/compare-view.test.tsx`

## Task 1: Add A Unified Scan Model And Persisted Compare-Scan Support

**Files:**
- Create: `apps/web/src/lib/scan-presenter.ts`
- Test: `apps/web/src/lib/__tests__/scan-presenter.test.ts`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/scans.ts`

- [ ] **Step 1: Write the failing scan routing helper test**

```ts
import { describe, expect, it } from "vitest";

import {
  getScanHref,
  getScanTitle,
  isCompareScan,
} from "@/lib/scan-presenter";

describe("scan-presenter", () => {
  it("routes compare scans to the dedicated compare page", () => {
    expect(
      getScanHref({
        _id: "scan_compare_1",
        scanType: "compare",
      } as never),
    ).toBe("/app/compare/scan_compare_1");
  });

  it("treats legacy rows as single scans", () => {
    expect(
      getScanTitle({
        title: null,
        filename: "clip.mp4",
      } as never),
    ).toBe("clip.mp4");

    expect(isCompareScan({ scanType: undefined } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/lib/__tests__/scan-presenter.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/scan-presenter'` or missing export errors.

- [ ] **Step 3: Implement the shared scan model, Convex fields, and routing helper**

```ts
// apps/web/src/lib/contracts.ts
export type ScanType = "single" | "compare";

export type SavedCompareResult = {
  winner: "A" | "B" | "tie";
  winnerReason: string;
  recommendation: string;
  summary: string[];
  slices: Array<{
    label: string;
    winner: "A" | "B" | "tie";
    aScore: number;
    bScore: number;
  }>;
};

export type SavedScanSummary = {
  _id: string;
  scanType?: ScanType;
  title: string | null;
  filename: string;
  secondaryFilename: string | null;
  uploadId: string;
  secondaryUploadId: string | null;
  localUploadId: string | null;
  status: AnalysisStatus;
  localAnalysisId: string | null;
  secondaryLocalAnalysisId: string | null;
  compareResult: SavedCompareResult | null;
  viralPotential: number | null;
  hookScore: number | null;
  pacingScore: number | null;
  retentionEstimate: number | null;
  deadspaceSeconds: number | null;
  trimmedDurationSec: number | null;
  analysisUrl: string | null;
  overviewRecommendation: string | null;
  selectedCutIds: string[];
  latestExportUrl: string | null;
  lastExportedAt: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};
```

```ts
// apps/web/src/lib/scan-presenter.ts
import type { SavedScanSummary } from "@/lib/contracts";

export function isCompareScan(
  scan: Pick<SavedScanSummary, "scanType">,
): boolean {
  return scan.scanType === "compare";
}

export function getScanHref(
  scan: Pick<SavedScanSummary, "_id" | "scanType">,
): string {
  return isCompareScan(scan)
    ? `/app/compare/${scan._id}`
    : `/app/scans/${scan._id}`;
}

export function getScanTitle(
  scan: Pick<SavedScanSummary, "title" | "filename">,
): string {
  return scan.title ?? scan.filename;
}
```

```ts
// convex/schema.ts
scans: defineTable({
  userId: v.id("users"),
  uploadId: v.id("uploads"),
  scanType: v.optional(v.union(v.literal("single"), v.literal("compare"))),
  displayName: v.optional(v.string()),
  secondaryUploadId: v.optional(v.id("uploads")),
  secondaryLocalAnalysisId: v.optional(v.string()),
  compareResult: v.optional(
    v.object({
      winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
      winnerReason: v.string(),
      recommendation: v.string(),
      summary: v.array(v.string()),
      slices: v.array(
        v.object({
          label: v.string(),
          winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
          aScore: v.number(),
          bScore: v.number(),
        }),
      ),
    }),
  ),
  // existing fields unchanged
})
```

```ts
// convex/scans.ts
export const createPendingCompareScan = mutation({
  args: {
    primaryUploadId: v.id("uploads"),
    secondaryUploadId: v.id("uploads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated.");

    const [primaryUpload, secondaryUpload] = await Promise.all([
      ctx.db.get(args.primaryUploadId),
      ctx.db.get(args.secondaryUploadId),
    ]);

    if (
      primaryUpload === null ||
      secondaryUpload === null ||
      primaryUpload.userId !== userId ||
      secondaryUpload.userId !== userId
    ) {
      throw new Error("Upload not found.");
    }

    const now = Date.now();
    return await ctx.db.insert("scans", {
      userId,
      uploadId: args.primaryUploadId,
      secondaryUploadId: args.secondaryUploadId,
      scanType: "compare",
      displayName: args.title,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const attachCompareAnalysisIds = mutation({
  args: {
    scanId: v.id("scans"),
    analysisIdA: v.string(),
    analysisIdB: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated.");
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) throw new Error("Scan not found.");

    await ctx.db.patch(args.scanId, {
      localAnalysisId: args.analysisIdA,
      secondaryLocalAnalysisId: args.analysisIdB,
      status: "running",
      updatedAt: Date.now(),
    });
  },
});

export const saveCompareResult = mutation({
  args: {
    scanId: v.id("scans"),
    winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
    winnerReason: v.string(),
    recommendation: v.string(),
    summary: v.array(v.string()),
    slices: v.array(
      v.object({
        label: v.string(),
        winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
        aScore: v.number(),
        bScore: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated.");
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) throw new Error("Scan not found.");

    await ctx.db.patch(args.scanId, {
      status: "completed",
      compareResult: {
        winner: args.winner,
        winnerReason: args.winnerReason,
        recommendation: args.recommendation,
        summary: args.summary,
        slices: args.slices,
      },
      overviewRecommendation: args.recommendation,
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Regenerate Convex types and rerun the targeted test**

Run:

```bash
npx convex codegen
npm run test --workspace web -- src/lib/__tests__/scan-presenter.test.ts
```

Expected: PASS with both scan helper assertions green and no Convex schema/type errors.

- [ ] **Step 5: Commit the unified scan model**

```bash
git add convex/schema.ts convex/scans.ts apps/web/src/lib/contracts.ts apps/web/src/lib/scan-presenter.ts apps/web/src/lib/__tests__/scan-presenter.test.ts convex/_generated
git commit -m "feat: add persisted compare scan model"
```

## Task 2: Rebuild The Public Shell And Landing Poster

**Files:**
- Test: `apps/web/src/components/__tests__/landing-client.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/brand-shell.tsx`
- Modify: `apps/web/src/components/landing-client.tsx`

- [ ] **Step 1: Write the failing landing-page test**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingClient } from "@/components/landing-client";

describe("LandingClient", () => {
  it("renders the VibeCheck poster hero and direct dashboard CTA", () => {
    render(<LandingClient />);

    expect(screen.getByText(/^VibeCheck$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View scan library/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the landing test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
```

Expected: FAIL because the current page still renders `Cortent`, extra feature grids, and the old CTA set.

- [ ] **Step 3: Implement dark tokens, metadata, and the poster landing**

```ts
// apps/web/src/app/layout.tsx
export const metadata: Metadata = {
  title: "VibeCheck",
  description:
    "VibeCheck scans creative signal, compares cuts, and tells you what to ship next.",
};
```

```css
/* apps/web/src/app/globals.css */
:root {
  --background: oklch(0.13 0.015 328);
  --foreground: oklch(0.96 0.015 350);
  --card: oklch(0.17 0.018 328);
  --card-foreground: oklch(0.96 0.015 350);
  --primary: oklch(0.86 0.07 356);
  --primary-foreground: oklch(0.2 0.03 332);
  --secondary: oklch(0.22 0.015 328);
  --secondary-foreground: oklch(0.9 0.012 350);
  --muted: oklch(0.19 0.015 328);
  --muted-foreground: oklch(0.73 0.018 342);
  --accent: oklch(0.73 0.08 350);
  --accent-foreground: oklch(0.16 0.02 328);
  --border: oklch(0.28 0.015 332);
  --ring: oklch(0.82 0.08 355);
}

body {
  background:
    radial-gradient(circle at 72% 18%, rgba(255, 194, 214, 0.18), transparent 20%),
    radial-gradient(circle at 18% 88%, rgba(198, 108, 149, 0.16), transparent 26%),
    linear-gradient(180deg, #07070c 0%, #0d0b14 52%, #130f18 100%);
}
```

```tsx
// apps/web/src/components/brand-shell.tsx
<header className="sticky top-0 z-20 border-b border-white/8 bg-black/30 backdrop-blur-2xl">
  <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
    <Link href="/" className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">
      VibeCheck
    </Link>
    <nav className="flex items-center gap-3">
      <Link href="/app" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        Login
      </Link>
      <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
        Open dashboard
      </Link>
    </nav>
  </div>
</header>
```

```tsx
// apps/web/src/components/landing-client.tsx
<main className="flex min-h-[calc(100svh-72px)] flex-col justify-end px-6 py-10 lg:px-10 lg:py-14">
  <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
        VibeCheck
      </p>
      <h1 className="mt-6 text-6xl font-semibold leading-[0.9] tracking-tight text-white md:text-7xl">
        Know what hits before you ship.
      </h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
        Upload one cut or run an A/B test. VibeCheck gives you the verdict, the moments that matter, and the next move.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
          Open dashboard
        </Link>
      </div>
    </div>
    <div className="rounded-[2rem] border border-white/8 bg-white/5 p-6 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Product preview</p>
      <p className="mt-3 text-lg text-white">Winner, top signal, and next action all above the fold.</p>
    </div>
  </section>
</main>
```

- [ ] **Step 4: Run the landing test and a web lint pass**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/landing-client.test.tsx
npm run lint --workspace web
```

Expected: PASS for the landing test and no new lint issues.

- [ ] **Step 5: Commit the public redesign**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css apps/web/src/components/brand-shell.tsx apps/web/src/components/landing-client.tsx apps/web/src/components/__tests__/landing-client.test.tsx
git commit -m "feat: redesign public VibeCheck landing"
```

## Task 3: Refactor The Authenticated Shell, Login Surface, And Saved Scan Cards

**Files:**
- Test: `apps/web/src/components/__tests__/auth-gate.test.tsx`
- Test: `apps/web/src/components/__tests__/scan-cards.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/auth/auth-gate.tsx`
- Modify: `apps/web/src/components/auth/login-panel.tsx`
- Modify: `apps/web/src/components/scan-cards.tsx`
- Modify: `apps/web/src/components/scan-library.tsx`

- [ ] **Step 1: Write the failing auth and scan-card tests**

```ts
// apps/web/src/components/__tests__/auth-gate.test.tsx
it("renders the login panel when the user is signed out", () => {
  authState = "unauthenticated";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
  render(
    <AuthGate>
      <div>private area</div>
    </AuthGate>,
  );
  expect(screen.getByText(/Sign in to VibeCheck/i)).toBeInTheDocument();
  expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
});
```

```ts
// apps/web/src/components/__tests__/scan-cards.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SavedScanCards } from "@/components/scan-cards";

describe("SavedScanCards", () => {
  it("routes compare rows to the compare workspace", () => {
    render(
      <SavedScanCards
        scans={[
          {
            _id: "scan_compare_1",
            scanType: "compare",
            title: "Clip A vs Clip B",
            filename: "clip-a.mp4",
            secondaryFilename: "clip-b.mp4",
            uploadId: "upload-a",
            secondaryUploadId: "upload-b",
            localUploadId: null,
            status: "completed",
            localAnalysisId: "analysis-a",
            secondaryLocalAnalysisId: "analysis-b",
            compareResult: {
              winner: "B",
              winnerReason: "B opens stronger.",
              recommendation: "Ship B.",
              summary: ["B wins opening"],
              slices: [],
            },
            viralPotential: null,
            hookScore: null,
            pacingScore: null,
            retentionEstimate: null,
            deadspaceSeconds: null,
            trimmedDurationSec: null,
            analysisUrl: null,
            overviewRecommendation: "Ship B.",
            selectedCutIds: [],
            latestExportUrl: null,
            lastExportedAt: null,
            errorMessage: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /Open scan/i })).toHaveAttribute(
      "href",
      "/app/compare/scan_compare_1",
    );
  });
});
```

- [ ] **Step 2: Run the auth and card tests to verify they fail**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/auth-gate.test.tsx src/components/__tests__/scan-cards.test.tsx
```

Expected: FAIL because the current shell still says `Cortent` and `SavedScanCards` always links to `/app/scans/...`.

- [ ] **Step 3: Implement the dark authenticated shell and helper-driven scan cards**

```tsx
// apps/web/src/components/app-shell.tsx
const navigation = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/library", label: "Scans" },
];

<div className="min-h-screen bg-[linear-gradient(180deg,#07070c_0%,#0d0b14_52%,#120f18_100%)] text-foreground">
  <header className="sticky top-0 z-30 border-b border-white/8 bg-black/30 backdrop-blur-2xl">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
      <Link href="/" className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">
        VibeCheck
      </Link>
      <nav className="hidden items-center gap-2 md:flex">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className={cn(buttonVariants({ variant: pathname === item.href ? "default" : "ghost", size: "sm" }))}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  </header>
</div>
```

```tsx
// apps/web/src/components/auth/login-panel.tsx
<h1 className="text-3xl font-semibold tracking-tight">
  {mode === "signIn" ? "Sign in to VibeCheck" : "Create your VibeCheck workspace"}
</h1>
<p className="mt-2 text-sm leading-6 text-muted-foreground">
  Your scans, compare runs, and exports stay attached to your account.
</p>
```

```tsx
// apps/web/src/components/scan-cards.tsx
import { getScanHref, getScanTitle, isCompareScan } from "@/lib/scan-presenter";

<h3 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
  {getScanTitle(scan)}
</h3>

{isCompareScan(scan) ? (
  <Badge variant="secondary" className="bg-primary/10 text-primary">
    Compare scan
  </Badge>
) : null}

<Link href={getScanHref(scan)} className={cn(buttonVariants({ variant: "default" }))}>
  Open scan
</Link>
```

- [ ] **Step 4: Rerun the auth and card tests**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/auth-gate.test.tsx src/components/__tests__/scan-cards.test.tsx
```

Expected: PASS, with the login copy rebranded and compare rows using the compare route.

- [ ] **Step 5: Commit the authenticated shell and card refactor**

```bash
git add apps/web/src/components/app-shell.tsx apps/web/src/components/auth/auth-gate.tsx apps/web/src/components/auth/login-panel.tsx apps/web/src/components/scan-cards.tsx apps/web/src/components/scan-library.tsx apps/web/src/components/__tests__/auth-gate.test.tsx apps/web/src/components/__tests__/scan-cards.test.tsx
git commit -m "feat: redesign authenticated shell and saved scan cards"
```

## Task 4: Make The Dashboard Upload-First And Persist A/B As One Compare Scan

**Files:**
- Create: `apps/web/src/components/upload-dropzone.tsx`
- Test: `apps/web/src/components/__tests__/upload-workbench.test.tsx`
- Modify: `apps/web/src/components/dashboard-home.tsx`
- Modify: `apps/web/src/components/upload-workbench.tsx`

- [ ] **Step 1: Extend the upload workbench test for the compare-scan flow**

```ts
const createPendingCompareScan = vi.fn();
const attachCompareAnalysisIds = vi.fn();
const saveCompareResult = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: vi.fn((name: string) => {
    if (name === "uploads:createPendingUpload") return createPendingUpload;
    if (name === "scans:createPendingScan") return createPendingScan;
    if (name === "scans:createPendingCompareScan") return createPendingCompareScan;
    if (name === "scans:attachCompareAnalysisIds") return attachCompareAnalysisIds;
    if (name === "scans:saveCompareResult") return saveCompareResult;
    return vi.fn();
  }),
}));

it("creates one persisted compare scan and routes to it", async () => {
  createPendingUpload
    .mockResolvedValueOnce("convex-upload-a")
    .mockResolvedValueOnce("convex-upload-b");
  createPendingCompareScan.mockResolvedValue("scan-compare-1");
  vi.mocked(api.startAnalysis)
    .mockResolvedValueOnce({ analysisId: "analysis-a", status: "queued", createdAt: now, updatedAt: now, error: null, payload: null })
    .mockResolvedValueOnce({ analysisId: "analysis-b", status: "queued", createdAt: now, updatedAt: now, error: null, payload: null });
  vi.mocked(api.compareAnalyses).mockResolvedValue({
    analysisIdA: "analysis-a",
    analysisIdB: "analysis-b",
    winner: "B",
    winnerReason: "B starts stronger.",
    recommendation: "Ship B.",
    summary: ["B wins opening"],
    slices: [],
  });

  render(<UploadWorkbench onSingleReady={onSingleReady} onCompareReady={onCompareReady} />);

  await user.click(screen.getByRole("tab", { name: /A\/B test/i }));
  await user.upload(screen.getAllByLabelText(/Select an MP4/i)[0], new File(["a"], "a.mp4", { type: "video/mp4" }));
  await user.upload(screen.getAllByLabelText(/Select an MP4/i)[1], new File(["b"], "b.mp4", { type: "video/mp4" }));
  await user.click(screen.getByRole("button", { name: /Analyze A\/B test/i }));

  await waitFor(() => {
    expect(createPendingCompareScan).toHaveBeenCalled();
    expect(onCompareReady).toHaveBeenCalledWith({ scanId: "scan-compare-1" });
  });
});
```

- [ ] **Step 2: Run the upload workbench test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/upload-workbench.test.tsx
```

Expected: FAIL because the current workbench creates two independent scans and returns `analysisIdA` / `analysisIdB` instead of one compare scan id.

- [ ] **Step 3: Implement the command-deck dashboard and compare-scan write flow**

```tsx
// apps/web/src/components/upload-workbench.tsx
type UploadWorkbenchProps = {
  onSingleReady: (result: { scanId: string }) => void;
  onCompareReady: (result: { scanId: string }) => void;
};

const createPendingCompareScan = useMutation("scans:createPendingCompareScan" as never);
const attachCompareAnalysisIds = useMutation("scans:attachCompareAnalysisIds" as never);
const saveCompareResult = useMutation("scans:saveCompareResult" as never);

async function createDurableScan(file: File) {
  const convexUploadId = (await createPendingUpload({
    filename: file.name,
    contentType: file.type || "video/mp4",
    sizeBytes: file.size,
  } as never)) as string;

  const upload = await uploadVideo(file, convexUploadId);
  const scanId = (await createPendingScan({ uploadId: convexUploadId } as never)) as string;
  const analysis = await startAnalysis(upload.uploadId, scanId);

  return {
    uploadId: convexUploadId,
    scanId,
    analysisId: analysis.analysisId,
  };
}

async function handleCompare() {
  if (!compareA.file || !compareB.file) return;

  const [scanA, scanB] = await Promise.all([
    createDurableScan(compareA.file),
    createDurableScan(compareB.file),
  ]);

  const compareScanId = (await createPendingCompareScan({
    primaryUploadId: scanA.uploadId,
    secondaryUploadId: scanB.uploadId,
    title: `${compareA.file.name} vs ${compareB.file.name}`,
  } as never)) as string;

  await attachCompareAnalysisIds({
    scanId: compareScanId,
    analysisIdA: scanA.analysisId,
    analysisIdB: scanB.analysisId,
  } as never);

  const compare = await compareAnalyses(scanA.analysisId, scanB.analysisId);

  await saveCompareResult({
    scanId: compareScanId,
    winner: compare.winner,
    winnerReason: compare.winnerReason,
    recommendation: compare.recommendation,
    summary: compare.summary,
    slices: compare.slices,
  } as never);

  startTransition(() => onCompareReady({ scanId: compareScanId }));
}
```

```tsx
// apps/web/src/components/dashboard-home.tsx
<UploadWorkbench
  onSingleReady={({ scanId }) => {
    startTransition(() => router.push(`/app/scans/${scanId}`));
  }}
  onCompareReady={({ scanId }) => {
    startTransition(() => router.push(`/app/compare/${scanId}`));
  }}
/>
```

- [ ] **Step 4: Rerun the targeted upload test**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/upload-workbench.test.tsx
```

Expected: PASS, with compare mode creating one persisted compare scan and routing to `/app/compare/<scanId>`.

- [ ] **Step 5: Commit the dashboard compare-flow rewrite**

```bash
git add apps/web/src/components/dashboard-home.tsx apps/web/src/components/upload-workbench.tsx apps/web/src/components/upload-dropzone.tsx apps/web/src/components/__tests__/upload-workbench.test.tsx
git commit -m "feat: make dashboard upload-first and persist compare scans"
```

## Task 5: Condense The Single Scan Workspace Around The Top Verdict

**Files:**
- Create: `apps/web/src/components/scan-summary-header.tsx`
- Create: `apps/web/src/components/scan-secondary-details.tsx`
- Test: `apps/web/src/components/__tests__/analysis-view.test.tsx`
- Modify: `apps/web/src/components/scan-detail-client.tsx`
- Modify: `apps/web/src/components/analysis-view.tsx`

- [ ] **Step 1: Tighten the single-scan workspace test around the new summary hierarchy**

```ts
it("renders the top verdict first and moves low-priority downloads into secondary details", async () => {
  render(<AnalysisView analysisId="analysis-1" pollIntervalMs={5} />);

  expect(await screen.findByText(/Top signal/i)).toBeInTheDocument();
  expect(screen.getByText(/Selected cuts/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Files and diagnostics/i }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Download provider response JSON/i }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the single-scan test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/analysis-view.test.tsx
```

Expected: FAIL because the current `AnalysisView` renders the older card-heavy layout and leaves artifact links visible in the main export section.

- [ ] **Step 3: Implement the compact summary header and secondary details panel**

```tsx
// apps/web/src/components/scan-summary-header.tsx
export function ScanSummaryHeader({
  title,
  recommendation,
  status,
  scores,
  latestExportUrl,
}: {
  title: string;
  recommendation: string;
  status: React.ReactNode;
  scores: React.ReactNode;
  latestExportUrl: string | null;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Top signal</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          {recommendation}
        </p>
      </div>
      <aside className="rounded-[1.8rem] border border-white/8 bg-white/5 p-5">
        {status}
        <div className="mt-4">{scores}</div>
        {latestExportUrl ? (
          <a href={latestExportUrl} className={cn(buttonVariants({ variant: "outline" }), "mt-5 w-full")}>
            Latest export
          </a>
        ) : null}
      </aside>
    </section>
  );
}
```

```tsx
// apps/web/src/components/scan-secondary-details.tsx
export function ScanSecondaryDetails({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded-[1.6rem] border border-white/8 bg-white/5 p-5">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
        Files and diagnostics
      </summary>
      <div className="mt-5 space-y-3">{children}</div>
    </details>
  );
}
```

```tsx
// apps/web/src/components/analysis-view.tsx
<ScanSummaryHeader
  title={payload.video.filename}
  recommendation={payload.summary.overallRecommendation}
  status={<ScanStatusBadge status="completed" />}
  latestExportUrl={latestExport?.trimmedVideoUrl ?? null}
  scores={
    <div className="grid grid-cols-2 gap-3">
      <ScoreChip label="Hook" value={payload.scores.hookScore} />
      <ScoreChip label="Pacing" value={payload.scores.pacingScore} />
      <ScoreChip label="Retention" value={payload.scores.retentionEstimate} />
      <ScoreChip label="Viral" value={payload.scores.viralPotential} />
    </div>
  }
/>;

<section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
  <div className="space-y-6">{/* video + visualization */}</div>
  <div className="space-y-6">
    {/* action board + cut selection + export controls */}
    <ScanSecondaryDetails>
      <ExportLink href={payload.artifacts.processedJsonUrl} label="Download analysis JSON" />
      <ExportLink href={payload.artifacts.cutListJsonUrl} label="Download cut list JSON" />
      <ExportLink href={payload.artifacts.eventsCsvUrl} label="Download event CSV" />
      {payload.artifacts.providerRawJsonUrl ? (
        <ExportLink href={payload.artifacts.providerRawJsonUrl} label="Download provider response JSON" />
      ) : null}
    </ScanSecondaryDetails>
  </div>
</section>
```

- [ ] **Step 4: Rerun the single-scan workspace test**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/analysis-view.test.tsx
```

Expected: PASS, with the verdict-led summary in place and artifacts moved behind the secondary details control.

- [ ] **Step 5: Commit the single-scan workspace refactor**

```bash
git add apps/web/src/components/scan-summary-header.tsx apps/web/src/components/scan-secondary-details.tsx apps/web/src/components/scan-detail-client.tsx apps/web/src/components/analysis-view.tsx apps/web/src/components/__tests__/analysis-view.test.tsx
git commit -m "feat: condense single scan workspace around verdict summary"
```

## Task 6: Build The Persisted Compare Scan Page And Legacy Route Bridge

**Files:**
- Create: `apps/web/src/app/app/compare/[scanId]/page.tsx`
- Create: `apps/web/src/components/compare-scan-detail-client.tsx`
- Test: `apps/web/src/components/__tests__/compare-scan-detail-client.test.tsx`
- Modify: `apps/web/src/components/compare-view.tsx`
- Modify: `apps/web/src/app/compare/page.tsx`
- Modify: `apps/web/src/components/__tests__/compare-view.test.tsx`

- [ ] **Step 1: Write the failing persisted-compare detail test**

```ts
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompareScanDetailClient } from "@/components/compare-scan-detail-client";

const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

describe("CompareScanDetailClient", () => {
  beforeEach(() => {
    useQuery.mockReset();
  });

  it("renders the persisted compare verdict from the saved scan row", () => {
    useQuery.mockReturnValue({
      _id: "scan_compare_1",
      scanType: "compare",
      title: "Clip A vs Clip B",
      filename: "clip-a.mp4",
      secondaryFilename: "clip-b.mp4",
      uploadId: "upload-a",
      secondaryUploadId: "upload-b",
      localUploadId: null,
      status: "completed",
      localAnalysisId: "analysis-a",
      secondaryLocalAnalysisId: "analysis-b",
      compareResult: {
        winner: "B",
        winnerReason: "B wins on the opening beat.",
        recommendation: "Ship B.",
        summary: ["B wins opening"],
        slices: [{ label: "Opening", winner: "B", aScore: 71, bScore: 83 }],
      },
      viralPotential: null,
      hookScore: null,
      pacingScore: null,
      retentionEstimate: null,
      deadspaceSeconds: null,
      trimmedDurationSec: null,
      analysisUrl: null,
      overviewRecommendation: "Ship B.",
      selectedCutIds: [],
      latestExportUrl: null,
      lastExportedAt: null,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    render(<CompareScanDetailClient scanId="scan_compare_1" />);

    expect(screen.getByText(/Winner: Version B/i)).toBeInTheDocument();
    expect(screen.getByText(/Ship B\./i)).toBeInTheDocument();
    expect(screen.getByText(/Opening/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the compare detail test to verify it fails**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/compare-scan-detail-client.test.tsx
```

Expected: FAIL with `Cannot find module '@/components/compare-scan-detail-client'`.

- [ ] **Step 3: Implement the persisted compare page and keep the legacy compare route as fallback**

```tsx
// apps/web/src/app/app/compare/[scanId]/page.tsx
import { CompareScanDetailClient } from "@/components/compare-scan-detail-client";

export default async function CompareScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  return <CompareScanDetailClient scanId={scanId} />;
}
```

```tsx
// apps/web/src/components/compare-scan-detail-client.tsx
import { useQuery } from "convex/react";

import { CompareView } from "@/components/compare-view";
import type { SavedScanRecord } from "@/lib/contracts";

export function CompareScanDetailClient({ scanId }: { scanId: string }) {
  const scan = useQuery("scans:getMineById" as never, { scanId } as never) as
    | SavedScanRecord
    | null
    | undefined;

  if (scan === undefined) return <div>Loading compare scan…</div>;
  if (scan === null || scan.scanType !== "compare" || !scan.compareResult) {
    return <div>Compare scan not found.</div>;
  }

  return (
    <CompareView
      title={scan.title ?? "Compare scan"}
      analysisIdA={scan.localAnalysisId}
      analysisIdB={scan.secondaryLocalAnalysisId}
      persistedCompare={scan.compareResult}
    />
  );
}
```

```tsx
// apps/web/src/app/compare/page.tsx
import { redirect } from "next/navigation";

import { BrandShell } from "@/components/brand-shell";
import { CompareView } from "@/components/compare-view";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;

  if (!a || !b) {
    redirect("/app");
  }

  return (
    <BrandShell compact>
      <CompareView analysisIdA={a} analysisIdB={b} />
    </BrandShell>
  );
}
```

- [ ] **Step 4: Run the compare detail tests**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/compare-scan-detail-client.test.tsx src/components/__tests__/compare-view.test.tsx
```

Expected: PASS, with the new persisted compare-scan wrapper green and the presentational compare view still rendering legacy query-param data.

- [ ] **Step 5: Commit the compare workspace rollout**

```bash
git add apps/web/src/app/app/compare/[scanId]/page.tsx apps/web/src/components/compare-scan-detail-client.tsx apps/web/src/components/compare-view.tsx apps/web/src/app/compare/page.tsx apps/web/src/components/__tests__/compare-scan-detail-client.test.tsx apps/web/src/components/__tests__/compare-view.test.tsx
git commit -m "feat: add persisted compare scan workspace"
```

## Task 7: Finish The Library, Clean Up Repo Artifacts, And Run Full Verification

**Files:**
- Modify: `.gitignore`
- Modify: `apps/web/src/components/dashboard-home.tsx`
- Modify: `apps/web/src/components/scan-library.tsx`
- Modify: `apps/web/src/components/scan-cards.tsx`

- [ ] **Step 1: Add the repo hygiene assertion and library copy check**

```ts
// append to apps/web/src/components/__tests__/scan-cards.test.tsx
it("renders a compare scan label in the library grid", () => {
  render(
    <SavedScanCards
      scans={[
        {
          _id: "scan_compare_1",
          scanType: "compare",
          title: "Clip A vs Clip B",
          filename: "clip-a.mp4",
          secondaryFilename: "clip-b.mp4",
          uploadId: "upload-a",
          secondaryUploadId: "upload-b",
          localUploadId: null,
          status: "completed",
          localAnalysisId: "analysis-a",
          secondaryLocalAnalysisId: "analysis-b",
          compareResult: {
            winner: "B",
            winnerReason: "B wins",
            recommendation: "Ship B",
            summary: ["B wins opening"],
            slices: [],
          },
          viralPotential: null,
          hookScore: null,
          pacingScore: null,
          retentionEstimate: null,
          deadspaceSeconds: null,
          trimmedDurationSec: null,
          analysisUrl: null,
          overviewRecommendation: "Ship B",
          selectedCutIds: [],
          latestExportUrl: null,
          lastExportedAt: null,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]}
    />,
  );

  expect(screen.getByText(/Compare scan/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the library/card test and confirm the `.superpowers/` ignore is still missing**

Run:

```bash
npm run test --workspace web -- src/components/__tests__/scan-cards.test.tsx
git check-ignore .superpowers || true
```

Expected: the test should already pass after Task 3, and `git check-ignore` should print nothing because `.superpowers/` is not ignored yet.

- [ ] **Step 3: Finalize library messaging, recent-scan presentation, and ignore local brainstorm artifacts**

```gitignore
# .gitignore
.superpowers/
```

```tsx
// apps/web/src/components/dashboard-home.tsx
<SavedScanCards
  scans={recentScans ?? []}
  loading={recentScans === undefined}
  title="Recent scans"
  description="Single scans and compare runs you can reopen without digging through raw uploads."
/>
```

```tsx
// apps/web/src/components/scan-library.tsx
<h1 className="mt-3 text-5xl font-semibold tracking-tight">Saved scans</h1>
<p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
  Reopen single analyses and compare runs from one library.
</p>
```

- [ ] **Step 4: Run the full web verification suite**

Run:

```bash
npm run lint --workspace web
npm run test --workspace web
```

Expected: PASS across lint and the full Vitest suite, with `landing-client`, `upload-workbench`, `analysis-view`, `compare-view`, `compare-scan-detail-client`, `scan-cards`, and `auth-gate` all green.

- [ ] **Step 5: Commit the cleanup and full verification pass**

```bash
git add .gitignore apps/web/src/components/dashboard-home.tsx apps/web/src/components/scan-library.tsx apps/web/src/components/scan-cards.tsx apps/web/src/components/__tests__/scan-cards.test.tsx
git commit -m "chore: finalize VibeCheck frontend polish"
```

## Self-Review

### Spec coverage

- Rebrand to `VibeCheck`: covered in Tasks 2 and 3.
- Dark sakura-pink visual system: covered in Task 2.
- Minimal landing page: covered in Task 2.
- Upload-first dashboard: covered in Task 4.
- Single-upload default with `A/B test` as secondary mode: covered in Task 4.
- `A/B test` as one saved compare scan: covered in Tasks 1, 4, and 6.
- Dedicated compare results page: covered in Task 6.
- Restrained hybrid scan page that hides lower-priority detail: covered in Task 5.
- Unified saved-scan library for singles and compare runs: covered in Tasks 3 and 7.
- Remove redundant copy and excessive chrome: covered in Tasks 2, 3, 5, and 7.

### Placeholder scan

No `TODO`, `TBD`, “handle appropriately,” or “similar to above” placeholders remain. Each task lists exact files, concrete code direction, and runnable commands.

### Type consistency

- `scanType` is consistently `single | compare`.
- Compare flow consistently terminates in `onCompareReady({ scanId })`.
- Compare rows consistently route to `/app/compare/[scanId]`.
- Single rows consistently route to `/app/scans/[scanId]`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-vibecheck-frontend-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
