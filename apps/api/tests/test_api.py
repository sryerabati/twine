from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient

from app.core.context import APIContext


def test_upload_endpoint_persists_file_and_metadata(
    client: TestClient,
    test_context: APIContext,
) -> None:
    response = client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
    )

    assert response.status_code == 201
    payload = response.json()
    upload_id = payload["uploadId"]
    paths = test_context.storage.upload_paths(upload_id)
    assert paths.source_path.exists()
    assert paths.thumbnail_path.exists()
    assert paths.metadata_path.exists()


def test_upload_rejects_over_duration(
    client: TestClient,
    test_context: APIContext,
) -> None:
    test_context.media.metadata.duration_sec = 75.0
    response = client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
    )

    assert response.status_code == 400
    assert "Maximum supported duration" in response.json()["detail"]


def test_health_endpoint_reports_missing_token_and_unloaded_model(
    client: TestClient,
) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["analysisBackend"] == "tribe"
    assert payload["huggingFaceTokenPresent"] is False
    assert payload["geminiApiKeyPresent"] is False
    assert any("HUGGINGFACE_HUB_TOKEN" in blocker for blocker in payload["blockers"])
    assert any("tribev2 package" in blocker for blocker in payload["blockers"])


def test_analyze_and_compare_complete_with_stubbed_runner(
    client: TestClient,
) -> None:
    upload_a = client.post(
        "/api/upload",
        files={"file": ("a.mp4", BytesIO(b"video-a"), "video/mp4")},
    ).json()
    upload_b = client.post(
        "/api/upload",
        files={"file": ("b.mp4", BytesIO(b"video-b"), "video/mp4")},
    ).json()

    analysis_a = client.post("/api/analyze", json={"uploadId": upload_a["uploadId"]}).json()
    analysis_b = client.post("/api/analyze", json={"uploadId": upload_b["uploadId"]}).json()

    loaded_a = client.get(f"/api/analysis/{analysis_a['analysisId']}").json()
    loaded_b = client.get(f"/api/analysis/{analysis_b['analysisId']}").json()

    assert loaded_a["status"] == "completed"
    assert loaded_b["status"] == "completed"
    assert loaded_a["payload"]["brainResponse"]["timeSeries"]
    assert loaded_a["payload"]["markers"]
    assert loaded_a["payload"]["actionBoard"]["fixNow"]
    assert loaded_a["payload"]["timelineSegments"]
    assert loaded_a["payload"]["cutPlan"]
    assert loaded_a["payload"]["artifacts"]["processedJsonUrl"].startswith("/storage/")
    assert loaded_a["payload"]["artifacts"]["providerRawJsonUrl"] is None

    compare = client.post(
        "/api/compare",
        json={
            "analysisIdA": analysis_a["analysisId"],
            "analysisIdB": analysis_b["analysisId"],
        },
    )
    assert compare.status_code == 200
    compare_payload = compare.json()
    assert compare_payload["winner"] in {"A", "B", "tie"}
    assert len(compare_payload["slices"]) == 3
