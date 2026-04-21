# Read The Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Read the room` the primary Gemini-backed analysis experience, keep brain scan as a compact side summary, and update UI copy to position the product as audience simulation plus lightweight signal context.

**Architecture:** Extend the shared analysis payload with mode-aware audience-outlook and compact brain-summary fields, populate them in the proxy analysis path, and branch the analysis screen to render audience sentiment as the primary surface while shrinking the brain section. Preserve existing TRIBE behavior and old saved-scan compatibility.

**Tech Stack:** FastAPI, Pydantic, Python services, Next.js, React, TypeScript, Vitest, Pytest

---

### Task 1: Add backend contract coverage for audience outlook

**Files:**
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/app/models/contracts.py`

- [ ] **Step 1: Write the failing API contract test**

```python
def test_analyze_and_compare_complete_with_stubbed_runner(client: TestClient) -> None:
    ...
    assert loaded_a["payload"]["analysisMode"] == "read_the_room"
    assert loaded_a["payload"]["audienceOutlook"]["timeline"]
    assert loaded_a["payload"]["brainSummary"]["averageActivation"] >= 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_api.py::test_analyze_and_compare_complete_with_stubbed_runner -v`
Expected: FAIL because `analysisMode`, `audienceOutlook`, and `brainSummary` are missing.

- [ ] **Step 3: Add the minimal Pydantic contract**

```python
class BrainSignalSummary(BaseModel):
    averageActivation: float
    averageMotion: float
    averageAudioEnergy: float
    averageTranscriptDensity: float


class AudienceTimelinePoint(BaseModel):
    startSec: float
    endSec: float
    sentiment: float
    interest: float
    clarity: float
    trust: float
    shareIntent: float
    dropoffRisk: float
    primaryReaction: str
    note: str


class AudienceOutlook(BaseModel):
    headline: str
    summary: str
    likelyPraise: list[str]
    likelyPushback: list[str]
    timeline: list[AudienceTimelinePoint]


class AnalysisPayload(BaseModel):
    analysisMode: Literal["brain_scan", "read_the_room"] = "brain_scan"
    audienceOutlook: AudienceOutlook | None = None
    brainSummary: BrainSignalSummary | None = None
```

- [ ] **Step 4: Run test to verify the contract still fails deeper**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_api.py::test_analyze_and_compare_complete_with_stubbed_runner -v`
Expected: FAIL because the payload builder still does not populate the new fields.

### Task 2: Populate read-the-room payload in proxy analysis

**Files:**
- Modify: `apps/api/app/services/analysis_engine.py`
- Test: `apps/api/tests/test_engine.py`

- [ ] **Step 1: Write the failing engine test**

```python
def test_build_payload_uses_read_the_room_for_proxy_analysis(...):
    artifacts = engine.build_payload(...)
    assert artifacts.payload.analysisMode == "read_the_room"
    assert artifacts.payload.audienceOutlook is not None
    assert artifacts.payload.brainSummary is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_engine.py -k proxy -v`
Expected: FAIL because proxy payloads still only fill `brainResponse`.

- [ ] **Step 3: Write the minimal proxy payload implementation**

```python
payload = AnalysisPayload(
    analysisId=analysis_id,
    analysisMode="read_the_room",
    audienceOutlook=self._audience_outlook_from_proxy(proxy, points),
    brainSummary=self._brain_signal_summary(points),
    ...
)
```

Add small helpers that:
- map proxy timeline windows into audience sentiment timeline points
- derive `headline`, `summary`, `likelyPraise`, and `likelyPushback`
- compute average activation, motion, audio, and transcript density from proxy points

- [ ] **Step 4: Run engine tests to verify they pass**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_engine.py -v`
Expected: PASS

- [ ] **Step 5: Run API contract test to verify it now passes**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_api.py::test_analyze_and_compare_complete_with_stubbed_runner -v`
Expected: PASS

### Task 3: Extend frontend contracts and render read-the-room as primary

**Files:**
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/scan-secondary-details.tsx`
- Test: `apps/web/src/components/__tests__/analysis-view.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
it("prioritizes read the room copy and hides the large brain viewer for audience-mode scans", async () => {
  ...
  expect(screen.getByText(/Read the room/i)).toBeInTheDocument();
  expect(screen.queryByTestId("brain-viewport")).not.toBeInTheDocument();
  expect(screen.getByText(/simulating audience reaction alongside a compact brain scan summary/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/analysis-view.test.tsx`
Expected: FAIL because the old brain-scan-first UI still renders.

- [ ] **Step 3: Update frontend contracts and UI**

```ts
export type AnalysisMode = "brain_scan" | "read_the_room";

export type AudienceOutlook = { ... };
export type BrainSignalSummary = { ... };

export type AnalysisPayload = {
  analysisMode?: AnalysisMode;
  audienceOutlook?: AudienceOutlook | null;
  brainSummary?: BrainSignalSummary | null;
  ...
};
```

In `analysis-view.tsx`:
- branch on `payload.analysisMode === "read_the_room"`
- render audience timeline chart and copy first
- replace the big brain viewer with a compact average summary card for read-the-room scans
- keep the existing brain viewer for true `brain_scan` payloads

In `scan-secondary-details.tsx`:
- tune secondary copy to describe trim decisions in the context of the audience simulation workflow

- [ ] **Step 4: Run the analysis view tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/analysis-view.test.tsx`
Expected: PASS

### Task 4: Update health/config copy and compatibility edges

**Files:**
- Modify: `apps/web/src/components/health-banner.tsx`
- Modify: `apps/api/app/models/contracts.py`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/api/tests/test_context.py`

- [ ] **Step 1: Write the failing compatibility test**

```python
def test_build_context_selects_gemini_runner(...):
    ...
    assert context.settings.analysis_backend == "gemini"
```

and add frontend assertions that the health banner no longer calls Gemini the main product story.

- [ ] **Step 2: Run the focused tests to verify failures**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_context.py -v`
Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/upload-workbench.test.tsx`
Expected: any copy mismatch failures exposed.

- [ ] **Step 3: Apply the compatibility updates**

```tsx
const backendLabel =
  health.analysisBackend === "gemini"
    ? "audience simulation + compact brain summary"
    : "brain-response model";
```

Keep backend wiring intact for now so Gemini remains the provider for the fallback path, but update product copy to reflect the new positioning.

- [ ] **Step 4: Re-run the focused tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_context.py -v`
Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/upload-workbench.test.tsx`
Expected: PASS

### Task 5: Full verification

**Files:**
- Modify: `apps/api/app/models/contracts.py`
- Modify: `apps/api/app/services/analysis_engine.py`
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/web/src/components/analysis-view.tsx`
- Modify: `apps/web/src/components/scan-secondary-details.tsx`
- Modify: `apps/web/src/components/health-banner.tsx`
- Modify: `apps/web/src/components/__tests__/analysis-view.test.tsx`

- [ ] **Step 1: Run backend verification**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && pytest apps/api/tests/test_api.py apps/api/tests/test_engine.py apps/api/tests/test_context.py -v`
Expected: PASS

- [ ] **Step 2: Run frontend verification**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/analysis-view.test.tsx apps/web/src/components/__tests__/upload-workbench.test.tsx`
Expected: PASS

- [ ] **Step 3: Run a broader safety check**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm test -- --run apps/web/src/components/__tests__/compare-view.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/models/contracts.py apps/api/app/services/analysis_engine.py apps/api/tests/test_api.py apps/api/tests/test_engine.py apps/api/tests/test_context.py apps/web/src/lib/contracts.ts apps/web/src/components/analysis-view.tsx apps/web/src/components/scan-secondary-details.tsx apps/web/src/components/health-banner.tsx apps/web/src/components/__tests__/analysis-view.test.tsx docs/superpowers/plans/2026-04-19-read-the-room-inline-implementation.md
git commit -m "Prioritize read the room analysis experience"
```
