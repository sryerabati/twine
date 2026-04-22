# Repurpose V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `Repurpose` product path that accepts one uploaded video and produces three alternate exports from the original footage only.

**Architecture:** Add a dedicated repurpose domain across Convex, FastAPI, and the web app. Reuse existing upload, storage, and render primitives, but keep repurpose data, routes, and UI separate from AI Editor because the shape is one source video to many variant exports.

**Tech Stack:** Convex, FastAPI, Python, Next.js, React, TypeScript, Vitest, Testing Library

---

### Task 1: Lock the API contract with failing repurpose tests

**Files:**
- Modify: `apps/api/tests/test_editor_api.py`

- [ ] **Step 1: Add failing repurpose generation coverage**

```python
def test_repurpose_generate_creates_three_completed_variants(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key="test-gemini-key")
    uploaded = upload_clip(client, "source.mp4")

    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "source-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 202
    latest = client.get("/api/repurpose/projects/repurpose-123/latest-result")
    assert latest.status_code == 200
    payload = latest.json()
    assert payload["status"] == "completed"
    assert len(payload["payload"]["variants"]) == 3
```

- [ ] **Step 2: Add failing provider-required coverage**

```python
def test_repurpose_generate_requires_configured_ai_provider(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key=None)
    uploaded = upload_clip(client, "source.mp4")

    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "source-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 503
```

- [ ] **Step 3: Run the focused API test file**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && python -m pytest apps/api/tests/test_editor_api.py -q`
Expected: FAIL because the repurpose routes and payload do not exist yet.

### Task 2: Add repurpose models, storage records, and worker implementation

**Files:**
- Modify: `apps/api/app/models/contracts.py`
- Modify: `apps/api/app/services/storage.py`
- Modify: `apps/api/app/core/context.py`
- Modify: `apps/api/app/services/gemini_runner.py`
- Modify: `apps/api/app/services/nvidia_editor_ai.py`
- Modify: `apps/api/app/services/jobs.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/routers/api.py`
- Test: `apps/api/tests/test_editor_api.py`

- [ ] **Step 1: Add repurpose request/response models**
- [ ] **Step 2: Add storage paths, record readers/writers, and latest-result lookup**
- [ ] **Step 3: Extend the editor AI provider protocol with repurpose planning**
- [ ] **Step 4: Implement the repurpose job service using transcript-derived source segments and `assemble_sequence`**
- [ ] **Step 5: Add `/api/repurpose/generate` and `/api/repurpose/projects/{projectId}/latest-result`**
- [ ] **Step 6: Re-run the focused API tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && python -m pytest apps/api/tests/test_editor_api.py -q`
Expected: PASS

### Task 3: Add Convex repurpose tables and service-bridge sync

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/repurposeProjects.ts`
- Create: `convex/repurposeService.ts`
- Modify: `convex/http.ts`

- [ ] **Step 1: Add `repurposeProjects` and `repurposeVariants` schema tables**
- [ ] **Step 2: Add public repurpose project queries and mutations**
- [ ] **Step 3: Add internal service mutations for status and variant summary sync**
- [ ] **Step 4: Add authenticated HTTP service routes for the repurpose bridge**

### Task 4: Add web contracts, routes, and UI for the new lane

**Files:**
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/repurpose-home.tsx`
- Create: `apps/web/src/components/repurpose-project-client.tsx`
- Create: `apps/web/src/app/app/repurpose/page.tsx`
- Create: `apps/web/src/app/app/repurpose/[projectId]/page.tsx`
- Create: `apps/web/src/components/__tests__/repurpose-home.test.tsx`
- Create: `apps/web/src/components/__tests__/repurpose-project-client.test.tsx`

- [ ] **Step 1: Write failing home and project component tests**
- [ ] **Step 2: Add web API helpers and contracts**
- [ ] **Step 3: Add the new navigation item and route files**
- [ ] **Step 4: Build the repurpose home screen**
- [ ] **Step 5: Build the repurpose project screen with upload, generate, polling, and completed variants**
- [ ] **Step 6: Run the focused web tests**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/repurpose-home.test.tsx src/components/__tests__/repurpose-project-client.test.tsx`
Expected: PASS

### Task 5: Verify the integrated feature

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README product-surface summary for Repurpose**
- [ ] **Step 2: Run targeted API and web verification**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && python -m pytest apps/api/tests/test_editor_api.py -q && npm run test:web -- --run src/components/__tests__/repurpose-home.test.tsx src/components/__tests__/repurpose-project-client.test.tsx`
Expected: PASS

- [ ] **Step 3: Run one broader sanity check**

Run: `cd /Users/shreyas/Desktop/projects/claudehackosu26 && npm run test:web -- --run src/components/__tests__/editor-project-client.test.tsx src/components/__tests__/repurpose-home.test.tsx src/components/__tests__/repurpose-project-client.test.tsx`
Expected: PASS
