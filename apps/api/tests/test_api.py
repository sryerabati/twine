from __future__ import annotations

from io import BytesIO
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.context import APIContext
from app.models.contracts import UploadResponse


class FakeConvexStorageBridge:
    def __init__(self) -> None:
        self._next_upload = 1
        self.files: dict[str, bytes] = {}
        self.service_calls: list[dict[str, object]] = []

    def post(
        self,
        url: str,
        *,
        json: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
        content: object | None = None,
    ) -> httpx.Response:
        if url.endswith("/service/storage/upload-url"):
            upload_url = f"https://uploads.example/{self._next_upload}"
            self._next_upload += 1
            self.service_calls.append(
                {"url": url, "json": json, "headers": headers or {}, "timeout": timeout}
            )
            return httpx.Response(200, json={"uploadUrl": upload_url})

        if url.endswith("/service/storage/urls"):
            storage_ids = [str(value) for value in (json or {}).get("storageIds", [])]
            self.service_calls.append(
                {"url": url, "json": json, "headers": headers or {}, "timeout": timeout}
            )
            return httpx.Response(
                200,
                json={
                    "urls": {
                        storage_id: f"https://files.example/{storage_id}"
                        for storage_id in storage_ids
                    }
                },
            )

        if url.startswith("https://uploads.example/"):
            if hasattr(content, "read"):
                body = content.read()
            elif isinstance(content, bytes):
                body = content
            elif isinstance(content, str):
                body = content.encode("utf-8")
            elif content is None:
                body = b""
            else:  # pragma: no cover - defensive against unexpected httpx behavior
                body = bytes(content)
            storage_id = f"storage_{len(self.files) + 1}"
            self.files[storage_id] = body
            return httpx.Response(200, json={"storageId": storage_id})

        self.service_calls.append(
            {"url": url, "json": json, "headers": headers or {}, "timeout": timeout}
        )
        return httpx.Response(204)

    def get(self, url: str, *, timeout: float | None = None) -> httpx.Response:
        storage_id = url.rsplit("/", 1)[-1]
        if storage_id not in self.files:
            return httpx.Response(404)
        return httpx.Response(
            200,
            content=self.files[storage_id],
            headers={"content-type": "application/octet-stream"},
        )


def enable_convex_media_storage(
    test_context: APIContext,
    monkeypatch: pytest.MonkeyPatch,
) -> FakeConvexStorageBridge:
    bridge = FakeConvexStorageBridge()
    test_context.settings.convex_site_url = "https://example.convex.site"
    test_context.settings.convex_service_secret = "secret"
    monkeypatch.setattr("app.services.convex_sync.httpx.post", bridge.post)
    monkeypatch.setattr("app.services.convex_sync.httpx.get", bridge.get)
    return bridge


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


def test_upload_accepts_mov_files(
    client: TestClient,
    test_context: APIContext,
) -> None:
    response = client.post(
        "/api/upload",
        files={"file": ("clip.mov", BytesIO(b"fake-mov"), "video/quicktime")},
    )

    assert response.status_code == 201
    payload = response.json()
    upload_id = payload["uploadId"]
    paths = test_context.storage.upload_paths(upload_id)
    assert paths.source_path.suffix == ".mov"
    assert paths.source_path.exists()


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
    assert isinstance(payload["geminiApiKeyPresent"], bool)
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
    assert loaded_a["payload"]["analysisMode"] == "brain_scan"
    assert loaded_a["payload"]["audienceOutlook"] is None
    assert loaded_a["payload"]["brainSummary"] is None
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


def test_proxy_analysis_payload_exposes_read_the_room_fields(
    test_context: APIContext,
) -> None:
    upload_paths = test_context.storage.create_upload_paths("clip.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="clip.mp4",
        duration_sec=12.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    result = test_context.runner.analyze_video(upload_paths.source_path)
    result.proxyAnalysis = {
        "summary": {
            "overallRecommendation": "The room likes the opening but cools in the middle.",
            "strengths": ["Strong opening line"],
            "weaknesses": ["Middle section loses clarity"],
        },
        "scores": {
            "hookScore": 80,
            "pacingScore": 68,
            "retentionEstimate": 71,
            "viralPotential": 74,
            "confidence": "medium",
            "helpingFactors": ["Clear early promise"],
            "hurtingFactors": ["Some trust drop in the middle"],
        },
        "timeline": [
            {
                "startSec": 0,
                "endSec": 4,
                "globalActivation": 0.82,
                "motionScore": 0.61,
                "audioEnergy": 0.71,
                "transcriptDensity": 0.54,
                "sceneChange": True,
                "silenceOverlap": False,
                "note": "The opening lands quickly.",
            },
            {
                "startSec": 4,
                "endSec": 8,
                "globalActivation": 0.46,
                "motionScore": 0.33,
                "audioEnergy": 0.41,
                "transcriptDensity": 0.49,
                "sceneChange": False,
                "silenceOverlap": False,
                "note": "The room starts questioning the point.",
            },
        ],
        "roomVoices": [
            {
                "speaker": "Maya",
                "handle": "@maya_557",
                "role": "Freelance Graphic Design Student",
                "platform": "Reddit",
                "quote": "Wait, I've been seeing this app everywhere. If it really fixes pacing, I'm in.",
            },
            {
                "speaker": "Theo",
                "handle": "@theo_972",
                "role": "Technical Analyst & Digital Forensic Specialist",
                "platform": "Reddit",
                "quote": "The pacing is promising, but the technical claim still needs proof.",
            },
        ],
        "markers": [
            {
                "t": 1.2,
                "type": "strong_hook",
                "severity": "high",
                "explanation": "People are leaning in.",
                "suggestion": "Keep the opener intact.",
            }
        ],
        "deadspaceCuts": [],
        "warnings": [],
    }

    artifacts = test_context.engine.build_payload(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        source_path=upload_paths.source_path,
        result=result,
    )

    assert artifacts.payload.analysisMode == "read_the_room"
    assert artifacts.payload.audienceOutlook is not None
    assert len(artifacts.payload.audienceOutlook.timeline) == 2
    assert [voice.speaker for voice in artifacts.payload.audienceOutlook.roomVoices] == [
        "Maya",
        "Theo",
    ]
    assert artifacts.payload.audienceOutlook.roomVoices[0].handle == "@maya_557"
    assert artifacts.payload.brainSummary is not None
    assert artifacts.payload.brainSummary.averageActivation > 0


def test_lookup_completed_analysis_by_upload_id(
    client: TestClient,
) -> None:
    upload = client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"video"), "video/mp4")},
    ).json()

    analysis = client.post("/api/analyze", json={"uploadId": upload["uploadId"]}).json()

    response = client.get(f"/api/analysis/by-upload/{upload['uploadId']}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["analysisId"] == analysis["analysisId"]
    assert payload["status"] == "completed"
    assert payload["payload"]["video"]["uploadId"] == upload["uploadId"]


def test_get_analysis_backfills_room_voices_for_completed_read_the_room_payload(
    client: TestClient,
    test_context: APIContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload_paths = test_context.storage.create_upload_paths("clip.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="clip.mp4",
        duration_sec=12.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    test_context.storage.write_upload_metadata(
        UploadResponse(uploadId=upload_paths.upload_id, video=video)
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    result = test_context.runner.analyze_video(upload_paths.source_path)
    result.proxyAnalysis = {
        "summary": {
            "overallRecommendation": "The room likes the opening but cools in the middle.",
            "strengths": ["Strong opening line"],
            "weaknesses": ["Middle section loses clarity"],
        },
        "scores": {
            "hookScore": 80,
            "pacingScore": 68,
            "retentionEstimate": 71,
            "viralPotential": 74,
            "confidence": "medium",
            "helpingFactors": ["Clear early promise"],
            "hurtingFactors": ["Some trust drop in the middle"],
        },
        "timeline": [
            {
                "startSec": 0,
                "endSec": 4,
                "globalActivation": 0.82,
                "motionScore": 0.61,
                "audioEnergy": 0.71,
                "transcriptDensity": 0.54,
                "sceneChange": True,
                "silenceOverlap": False,
                "note": "The opening lands quickly.",
            }
        ],
        "markers": [],
        "deadspaceCuts": [],
        "warnings": [],
    }
    artifacts = test_context.engine.build_payload(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        source_path=upload_paths.source_path,
        result=result,
    )
    test_context.storage.write_analysis_payload(analysis_paths.analysis_id, artifacts.payload)
    test_context.storage.write_provider_raw(analysis_paths.analysis_id, {"simulationId": "sim_old"})
    completed = test_context.storage.init_analysis_record(analysis_paths.analysis_id).model_copy(
        update={
            "status": "completed",
            "createdAt": datetime.now(UTC),
            "updatedAt": datetime.now(UTC),
            "payload": None,
        }
    )
    test_context.storage.write_analysis_record(completed)
    monkeypatch.setattr(
        test_context.runner,
        "_load_room_voices",
        lambda simulation_id: [
            {
                "speaker": "Maya",
                "handle": "@maya_557",
                "role": "Freelance Graphic Design Student",
                "platform": "Reddit",
                "quote": "Wait, I've been seeing this app everywhere.",
            },
            {
                "speaker": "Theo",
                "handle": "@theo_972",
                "role": "Technical Analyst & Digital Forensic Specialist",
                "platform": "Reddit",
                "quote": "The pacing is promising, but the technical claim still needs proof.",
            },
            {
                "speaker": "Avery",
                "handle": "@avery_327",
                "role": "Marketing Analyst & Brand Strategist",
                "platform": "X",
                "quote": "The value proposition is strong, but they need clearer proof.",
            },
            {
                "speaker": "Lena",
                "handle": "@lena_190",
                "role": "UGC Content Quality Auditor & Post-Production Specialist",
                "platform": "X",
                "quote": "The format handling is sharp, but the ending cut lingers too long.",
            },
            {
                "speaker": "Noah",
                "handle": "@noah_611",
                "role": "Social Creative Producer",
                "platform": "Reddit",
                "quote": "I would keep watching, but I want the promise backed up faster.",
            },
        ],
        raising=False,
    )

    response = client.get(f"/api/analysis/{analysis_paths.analysis_id}")

    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["audienceOutlook"]["roomVoices"][0]["speaker"] == "Maya"
    assert len(payload["audienceOutlook"]["roomVoices"]) == 5
    assert (
        test_context.storage.read_analysis_payload(analysis_paths.analysis_id)
        .audienceOutlook
        .roomVoices[4]
        .speaker
        == "Noah"
    )


def test_get_analysis_upgrades_existing_room_voices_when_more_are_available(
    client: TestClient,
    test_context: APIContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload_paths = test_context.storage.create_upload_paths("clip.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="clip.mp4",
        duration_sec=12.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    test_context.storage.write_upload_metadata(UploadResponse(uploadId=upload_paths.upload_id, video=video))
    analysis_paths = test_context.storage.create_analysis_paths()

    result = test_context.runner.analyze_video(upload_paths.source_path)
    result.proxyAnalysis = {
        "summary": {
            "overallRecommendation": "The room likes the opening but cools in the middle.",
            "strengths": ["Strong opening line"],
            "weaknesses": ["Middle section loses clarity"],
        },
        "scores": {
            "hookScore": 80,
            "pacingScore": 68,
            "retentionEstimate": 71,
            "viralPotential": 74,
            "confidence": "medium",
            "helpingFactors": ["Clear early promise"],
            "hurtingFactors": ["Some trust drop in the middle"],
        },
        "timeline": [
            {
                "startSec": 0,
                "endSec": 4,
                "globalActivation": 0.82,
                "motionScore": 0.61,
                "audioEnergy": 0.71,
                "transcriptDensity": 0.54,
                "sceneChange": True,
                "silenceOverlap": False,
                "note": "The opening lands quickly.",
            }
        ],
        "roomVoices": [
            {
                "speaker": "Maya",
                "handle": "@maya_557",
                "role": "Freelance Graphic Design Student",
                "platform": "Reddit",
                "quote": "Wait, I've been seeing this app everywhere.",
            },
            {
                "speaker": "Theo",
                "handle": "@theo_972",
                "role": "Technical Analyst & Digital Forensic Specialist",
                "platform": "Reddit",
                "quote": "The pacing is promising, but the technical claim still needs proof.",
            },
        ],
        "markers": [],
        "deadspaceCuts": [],
        "warnings": [],
    }
    artifacts = test_context.engine.build_payload(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        source_path=upload_paths.source_path,
        result=result,
    )
    test_context.storage.write_analysis_payload(analysis_paths.analysis_id, artifacts.payload)
    test_context.storage.write_provider_raw(analysis_paths.analysis_id, {"simulationId": "sim_upgrade"})
    completed = test_context.storage.init_analysis_record(analysis_paths.analysis_id).model_copy(
        update={
            "status": "completed",
            "createdAt": datetime.now(UTC),
            "updatedAt": datetime.now(UTC),
            "payload": None,
        }
    )
    test_context.storage.write_analysis_record(completed)
    monkeypatch.setattr(
        test_context.runner,
        "_load_room_voices",
        lambda simulation_id: [
            {
                "speaker": "Maya",
                "handle": "@maya_557",
                "role": "Freelance Graphic Design Student",
                "platform": "Reddit",
                "quote": "Wait, I've been seeing this app everywhere.",
            },
            {
                "speaker": "Theo",
                "handle": "@theo_972",
                "role": "Technical Analyst & Digital Forensic Specialist",
                "platform": "Reddit",
                "quote": "The pacing is promising, but the technical claim still needs proof.",
            },
            {
                "speaker": "Avery",
                "handle": "@avery_327",
                "role": "Marketing Analyst & Brand Strategist",
                "platform": "X",
                "quote": "The value proposition is strong, but they need clearer proof.",
            },
        ],
        raising=False,
    )

    response = client.get(f"/api/analysis/{analysis_paths.analysis_id}")

    assert response.status_code == 200
    payload = response.json()["payload"]
    assert len(payload["audienceOutlook"]["roomVoices"]) == 3
    assert payload["audienceOutlook"]["roomVoices"][2]["speaker"] == "Avery"


def test_upload_endpoint_stores_media_in_convex_and_rehydrates_local_cache(
    client: TestClient,
    test_context: APIContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bridge = enable_convex_media_storage(test_context, monkeypatch)
    convex_upload_id = "0" * 32

    response = client.post(
        "/api/upload",
        data={"convexUploadId": convex_upload_id},
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
    )

    assert response.status_code == 201
    payload = response.json()
    upload_id = payload["uploadId"]
    upload_dir = test_context.settings.uploads_dir / upload_id
    source_path = upload_dir / "source.mp4"
    thumbnail_path = upload_dir / "thumbnail.jpg"

    assert payload["video"]["sourceStorageId"].startswith("storage_")
    assert payload["video"]["thumbnailStorageId"].startswith("storage_")
    assert payload["video"]["sourceUrl"] == (
        f"https://files.example/{payload['video']['sourceStorageId']}"
    )
    assert payload["video"]["thumbnailUrl"] == (
        f"https://files.example/{payload['video']['thumbnailStorageId']}"
    )
    assert not source_path.exists()
    assert not thumbnail_path.exists()

    paths = test_context.storage.upload_paths(upload_id)
    assert paths.source_path.exists()
    assert paths.thumbnail_path.exists()
    assert paths.source_path.read_bytes() == b"fake-mp4"
    assert payload["video"]["sourceStorageId"] in bridge.files
    assert payload["video"]["thumbnailStorageId"] in bridge.files

    attach_call = next(
        call for call in bridge.service_calls if str(call["url"]).endswith("/service/upload/attach")
    )
    assert attach_call["json"] == {
        "uploadId": convex_upload_id,
        "localUploadId": upload_id,
        "durationSec": 12.0,
        "videoStorageId": payload["video"]["sourceStorageId"],
        "thumbnailStorageId": payload["video"]["thumbnailStorageId"],
    }


def test_trim_endpoint_returns_convex_export_after_upload_cache_eviction(
    client: TestClient,
    test_context: APIContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_convex_media_storage(test_context, monkeypatch)

    upload = client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"video"), "video/mp4")},
    ).json()
    analysis = client.post("/api/analyze", json={"uploadId": upload["uploadId"]}).json()

    trim = client.post(
        f"/api/analysis/{analysis['analysisId']}/trim",
        json={},
    )

    assert trim.status_code == 200
    trim_payload = trim.json()
    assert trim_payload["trimmedVideoStorageId"].startswith("storage_")
    assert trim_payload["trimmedVideoUrl"] == (
        f"https://files.example/{trim_payload['trimmedVideoStorageId']}"
    )

    refreshed = client.get(f"/api/analysis/{analysis['analysisId']}").json()
    latest_export = refreshed["payload"]["exports"][-1]
    assert latest_export["trimmedVideoStorageId"] == trim_payload["trimmedVideoStorageId"]
    assert latest_export["trimmedVideoUrl"] == trim_payload["trimmedVideoUrl"]
    assert refreshed["payload"]["artifacts"]["trimmedVideoStorageId"] == trim_payload[
        "trimmedVideoStorageId"
    ]
    assert refreshed["payload"]["artifacts"]["trimmedVideoUrl"] == trim_payload["trimmedVideoUrl"]
