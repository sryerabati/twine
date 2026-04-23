from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings


def make_mirofish_settings(tmp_path: Path) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="mirofish",
        gemini_api_key="test-gemini-key",
        gemini_model="gemini-2.5-pro",
        mirofish_base_url="http://mirofish.test",
        mirofish_zep_api_key="zep-key",
        mirofish_simulation_max_rounds=6,
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
    )


def test_mirofish_settings_default_to_premium_round_budget() -> None:
    settings = Settings()

    assert settings.mirofish_simulation_max_rounds == 10


def test_extract_analysis_rejects_list_data_payload(tmp_path: Path) -> None:
    from app.services.mirofish_runner import MiroFishIntegrationError, MiroFishRunner

    runner = MiroFishRunner(make_mirofish_settings(tmp_path))

    with pytest.raises(MiroFishIntegrationError) as exc_info:
        runner._extract_analysis({"data": ["not", "a", "dict"]})

    message = str(exc_info.value)
    assert "expected dict with response key" in message
    assert "got list" in message
    assert "First 200 chars:" in message


def test_interview_agents_ignores_list_result_wrapper(tmp_path: Path, monkeypatch) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    runner = MiroFishRunner(make_mirofish_settings(tmp_path))

    def fake_service_data(*args, **kwargs) -> dict[str, object]:  # noqa: ANN002, ANN003
        return {"result": [{"agent_id": 1}]}

    monkeypatch.setattr(runner, "_service_data", fake_service_data)

    interviews = runner._interview_agents(
        object(),
        "http://mirofish.test",
        "sim_123",
        agent_ids=[1],
        prompt="Why did this land?",
        platform=None,
    )

    assert interviews == []


def test_mirofish_runner_executes_service_workflow_and_returns_proxy_analysis(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from app.services.mirofish_runner import MiroFishBrief, MiroFishRunner

    settings = make_mirofish_settings(tmp_path)
    runner = MiroFishRunner(settings)
    video_path = tmp_path / "clip.mp4"
    video_path.write_bytes(b"video")

    monkeypatch.setattr(
        runner,
        "_build_video_brief",
        lambda path: MiroFishBrief(
            projectName="Twine brief",
            projectFileName="twine-brief.md",
            markdown="# Brief\n\nWindow 1 [0.0-4.0]\n",
            simulationRequirement="Simulate audience reaction to this short-form video.",
            windows=[
                {
                    "windowIndex": 1,
                    "startSec": 0.0,
                    "endSec": 4.0,
                    "motionScore": 0.62,
                    "audioEnergy": 0.73,
                    "transcriptDensity": 0.55,
                    "sceneChange": True,
                    "silenceOverlap": False,
                    "transcriptExcerpt": "The first line lands fast.",
                    "note": "strong opener",
                }
            ],
            warnings=[],
        ),
    )
    monkeypatch.setattr(
        runner,
        "_hydrate_audience_world",
        lambda client, base_url, simulation_id, *, windows, include_cached_interviews: {
            "status": "hydrating",
            "simulationId": simulation_id,
            "platformBreakdown": [],
            "cohorts": [],
            "threads": [],
            "agents": [],
            "interviews": [],
            "evidenceMoments": [],
        },
    )

    seen_request_headers: list[tuple[str, str, str | None]] = []
    report_prompt: str | None = None
    prepare_payload: dict[str, object] | None = None
    start_payload: dict[str, object] | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal report_prompt, prepare_payload, start_payload
        path = request.url.path
        method = request.method
        seen_request_headers.append((method, path, request.headers.get("accept-language")))
        if method == "GET" and path == "/health":
            return httpx.Response(200, request=request, json={"status": "ok"})
        if method == "POST" and path == "/api/graph/ontology/generate":
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"project_id": "proj_123"}},
            )
        if method == "POST" and path == "/api/graph/build":
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"task_id": "task_graph"}},
            )
        if method == "GET" and path == "/api/graph/task/task_graph":
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "status": "completed",
                        "result": {"graph_id": "graph_123"},
                    },
                },
            )
        if method == "POST" and path == "/api/simulation/create":
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"simulation_id": "sim_123"}},
            )
        if method == "POST" and path == "/api/simulation/prepare":
            prepare_payload = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"task_id": "task_prepare"}},
            )
        if method == "POST" and path == "/api/simulation/prepare/status":
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"status": "completed", "progress": 100}},
            )
        if method == "POST" and path == "/api/simulation/start":
            start_payload = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"runner_status": "running"}},
            )
        if method == "GET" and path == "/api/simulation/sim_123/run-status":
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"runner_status": "completed"}},
            )
        if method == "POST" and path == "/api/report/chat":
            report_prompt = request.content.decode("utf-8")
            response_text = json.dumps(
                {
                    "summary": {
                        "overallRecommendation": "The room is interested early but drifts later.",
                        "strengths": ["The first line lands fast."],
                        "weaknesses": ["The middle loses trust."],
                    },
                    "scores": {
                        "hookScore": 82,
                        "pacingScore": 68,
                        "retentionEstimate": 71,
                        "viralPotential": 76,
                        "confidence": "medium",
                        "helpingFactors": ["Strong curiosity in the opener"],
                        "hurtingFactors": ["Trust softens in the middle"],
                    },
                    "timeline": [
                        {
                            "startSec": 0.0,
                            "endSec": 4.0,
                            "globalActivation": 0.81,
                            "motionScore": 0.62,
                            "audioEnergy": 0.73,
                            "transcriptDensity": 0.55,
                            "sceneChange": True,
                            "silenceOverlap": False,
                            "note": "The simulated audience leans in fast.",
                        }
                    ],
                    "markers": [
                        {
                            "t": 0.5,
                            "type": "strong_hook",
                            "severity": "high",
                            "explanation": "The room locks in early.",
                            "suggestion": "Preserve the opening line.",
                        }
                    ],
                    "deadspaceCuts": [],
                    "warnings": [],
                }
            )
            return httpx.Response(
                200,
                request=request,
                json={"success": True, "data": {"response": response_text}},
            )

        raise AssertionError(f"Unexpected request: {method} {request.url}")

    transport = httpx.MockTransport(handler)
    original_client = httpx.Client

    class StubClientFactory:
        def __call__(self, *args, **kwargs) -> httpx.Client:
            return original_client(*args, transport=transport, **kwargs)

    monkeypatch.setattr("app.services.mirofish_runner.httpx.Client", StubClientFactory())

    result = runner.analyze_video(video_path)

    assert result.provider == "mirofish"
    assert result.proxyAnalysis is not None
    assert result.proxyAnalysis["summary"]["overallRecommendation"]
    assert result.proxyAnalysis["timeline"][0]["note"] == "The simulated audience leans in fast."
    assert result.providerRaw is not None
    assert result.providerRaw["projectId"] == "proj_123"
    assert report_prompt is not None
    assert prepare_payload == {"simulation_id": "sim_123", "parallel_profile_count": 5}
    assert start_payload == {
        "simulation_id": "sim_123",
        "platform": "parallel",
        "max_rounds": 6,
        "enable_graph_memory_update": True,
    }
    assert "All natural-language output must be English only." in report_prompt
    assert "Do not use Chinese or any other non-English language" in report_prompt
    assert seen_request_headers
    assert all(locale == "en" for _, _, locale in seen_request_headers if locale is not None)


def test_mirofish_runner_builds_vertex_openai_sidecar_env(tmp_path: Path, monkeypatch) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="mirofish",
        gemini_platform="vertex",
        gemini_model="gemini-2.5-pro",
        mirofish_vertex_project_id="vertex-proj",
        mirofish_vertex_location="global",
        mirofish_zep_api_key="zep-key",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
    )
    runner = MiroFishRunner(settings)

    class FakeCredentials:
        def __init__(self) -> None:
            self.token = None

        def refresh(self, request) -> None:  # noqa: ANN001
            self.token = "vertex-token"

    monkeypatch.setattr(
        "app.services.mirofish_runner.google_auth_default",
        lambda scopes: (FakeCredentials(), "detected-project"),
    )

    env = runner._managed_sidecar_env()

    assert env["LLM_API_KEY"] == "vertex-token"
    assert env["LLM_BASE_URL"] == "https://aiplatform.googleapis.com/v1/projects/vertex-proj/locations/global/endpoints/openapi"
    assert env["LLM_MODEL_NAME"] == "google/gemini-2.5-pro"
    assert env["ZEP_API_KEY"] == "zep-key"


def test_mirofish_runner_loads_room_voices_from_simulation_artifacts(tmp_path: Path) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    settings = make_mirofish_settings(tmp_path)
    repo_dir = tmp_path / "MiroFish"
    simulation_dir = repo_dir / "backend" / "uploads" / "simulations" / "sim_test"
    simulation_dir.mkdir(parents=True, exist_ok=True)
    settings.mirofish_repo_dir = repo_dir

    (simulation_dir / "reddit_profiles.json").write_text(
        json.dumps(
            [
                {
                    "username": "maya_557",
                    "name": "Maya",
                    "profession": "Freelance Graphic Design Student",
                },
                {
                    "username": "theo_972",
                    "name": "Theo",
                    "profession": "Technical Analyst & Digital Forensic Specialist",
                },
            ]
        ),
        encoding="utf-8",
    )

    db_path = simulation_dir / "reddit_simulation.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE user (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT,
            name TEXT
        );
        CREATE TABLE post (
            post_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME,
            num_likes INTEGER DEFAULT 0,
            num_shares INTEGER DEFAULT 0
        );
        CREATE TABLE comment (
            comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            num_likes INTEGER DEFAULT 0
        );
        """
    )
    connection.execute("INSERT INTO user (user_id, user_name, name) VALUES (1, '', 'maya_557')")
    connection.execute("INSERT INTO user (user_id, user_name, name) VALUES (2, '', 'theo_972')")
    connection.execute(
        """
        INSERT INTO post (user_id, content, created_at, num_likes, num_shares)
        VALUES (1, ?, '2026-04-20 00:54:10', 3, 1)
        """,
        ("Wait, I've been seeing this app everywhere. If it really fixes pacing, I'm in.",),
    )
    connection.execute(
        """
        INSERT INTO comment (post_id, user_id, content, created_at, num_likes)
        VALUES (1, 2, ?, '2026-04-20 00:55:10', 2)
        """,
        ("The pacing is promising, but the technical claim still needs proof.",),
    )
    connection.commit()
    connection.close()

    runner = MiroFishRunner(settings)

    voices = runner._load_room_voices("sim_test")

    assert [voice["speaker"] for voice in voices] == ["Maya", "Theo"]
    assert voices[0]["handle"] == "@maya_557"
    assert voices[0]["platform"] == "Reddit"
    assert voices[0]["stance"] == "positive"
    assert voices[1]["stance"] == "negative"
    assert "Freelance Graphic Design Student" in voices[0]["role"]
    assert "seeing this app everywhere" in voices[0]["quote"]
    assert "technical claim still needs proof" in voices[1]["quote"]


def test_mirofish_runner_uses_gemini_to_override_room_voice_stances(tmp_path: Path) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    settings = make_mirofish_settings(tmp_path)
    repo_dir = tmp_path / "MiroFish"
    simulation_dir = repo_dir / "backend" / "uploads" / "simulations" / "sim_classified"
    simulation_dir.mkdir(parents=True, exist_ok=True)
    settings.mirofish_repo_dir = repo_dir

    (simulation_dir / "reddit_profiles.json").write_text(
        json.dumps(
            [
                {"username": "maya_557", "name": "Maya", "profession": "Freelance Graphic Design Student"},
                {"username": "theo_972", "name": "Theo", "profession": "Technical Analyst"},
            ]
        ),
        encoding="utf-8",
    )

    db_path = simulation_dir / "reddit_simulation.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE user (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT,
            name TEXT
        );
        CREATE TABLE post (
            post_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME,
            num_likes INTEGER DEFAULT 0,
            num_shares INTEGER DEFAULT 0
        );
        CREATE TABLE comment (
            comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            num_likes INTEGER DEFAULT 0
        );
        """
    )
    connection.execute("INSERT INTO user (user_id, user_name, name) VALUES (1, '', 'maya_557')")
    connection.execute("INSERT INTO user (user_id, user_name, name) VALUES (2, '', 'theo_972')")
    connection.execute(
        """
        INSERT INTO post (user_id, content, created_at, num_likes, num_shares)
        VALUES (1, ?, '2026-04-20 00:54:10', 3, 1)
        """,
        ("This looks strong and useful, but I still need proof before I trust it.",),
    )
    connection.execute(
        """
        INSERT INTO comment (post_id, user_id, content, created_at, num_likes)
        VALUES (1, 2, ?, '2026-04-20 00:55:10', 2)
        """,
        ("The claim lands for me overall. I would use this.",),
    )
    connection.commit()
    connection.close()

    runner = MiroFishRunner(settings)
    runner._brief_helper = SimpleNamespace(  # type: ignore[assignment]
        classify_reaction_stances=lambda reactions: {
            "maya_557": "negative",
            "theo_972": "positive",
        }
    )

    voices = runner._load_room_voices("sim_classified", classify_with_gemini=True)

    assert voices[0]["speaker"] == "Theo"
    assert voices[0]["stance"] == "positive"
    assert voices[1]["speaker"] == "Maya"
    assert voices[1]["stance"] == "negative"


def test_mirofish_runner_keeps_more_than_four_room_voices_and_longer_quotes(tmp_path: Path) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    settings = make_mirofish_settings(tmp_path)
    repo_dir = tmp_path / "MiroFish"
    simulation_dir = repo_dir / "backend" / "uploads" / "simulations" / "sim_many"
    simulation_dir.mkdir(parents=True, exist_ok=True)
    settings.mirofish_repo_dir = repo_dir

    (simulation_dir / "reddit_profiles.json").write_text(
        json.dumps(
            [
                {
                    "username": f"voice_{index}",
                    "name": f"Voice {index}",
                    "profession": f"Audience role {index}",
                }
                for index in range(1, 7)
            ]
        ),
        encoding="utf-8",
    )

    db_path = simulation_dir / "reddit_simulation.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE user (
            user_id INTEGER PRIMARY KEY,
            user_name TEXT,
            name TEXT
        );
        CREATE TABLE post (
            post_id INTEGER PRIMARY KEY,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME,
            num_likes INTEGER DEFAULT 0,
            num_shares INTEGER DEFAULT 0
        );
        CREATE TABLE comment (
            comment_id INTEGER PRIMARY KEY,
            post_id INTEGER,
            user_id INTEGER,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            num_likes INTEGER DEFAULT 0
        );
        """
    )
    long_positive = (
        "This reaction keeps going because the viewer is explaining exactly why the promise lands, "
        "why the workflow feels sharp, and why the whole thing is useful enough to keep watching."
    )
    long_negative = (
        "This reaction keeps going because the viewer is explaining exactly why the proof softens, "
        "why the ending still needs to be trimmed down, and why the claim remains too unclear to trust."
    )
    for index in range(1, 7):
        connection.execute(
            "INSERT INTO user (user_id, user_name, name) VALUES (?, ?, ?)",
            (index, f"voice_{index}", f"voice_{index}"),
        )
        connection.execute(
            """
            INSERT INTO post (post_id, user_id, content, created_at, num_likes, num_shares)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    index,
                    index,
                    f"{long_positive if index % 2 else long_negative} Reaction {index}.",
                    f"2026-04-20 00:55:0{index}",
                    14 - index,
                    0,
                ),
            )
    connection.commit()
    connection.close()

    runner = MiroFishRunner(settings)

    voices = runner._load_room_voices("sim_many")

    assert len(voices) == 6
    assert voices[0]["speaker"] == "Voice 1"
    assert [voice["stance"] for voice in voices[:6]] == [
        "positive",
        "negative",
        "positive",
        "negative",
        "positive",
        "negative",
    ]
    assert "workflow feels sharp" in voices[0]["quote"]
    assert voices[-1]["speaker"] == "Voice 6"


def test_mirofish_runner_hydrates_native_audience_world_from_service_payloads(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    settings = make_mirofish_settings(tmp_path)
    runner = MiroFishRunner(settings)

    interview_requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        if method == "GET" and path == "/health":
            return httpx.Response(200, request=request, json={"status": "ok"})

        if method == "GET" and path == "/api/simulation/sim_world/posts":
            platform = request.url.params.get("platform")
            if platform == "reddit":
                return httpx.Response(
                    200,
                    request=request,
                    json={
                        "success": True,
                        "data": {
                            "platform": "reddit",
                            "count": 2,
                            "posts": [
                                {
                                    "post_id": 101,
                                    "user_id": 1,
                                    "content": "UGC creators will save time on rough cuts with this workflow.",
                                    "created_at": "2026-04-21T12:00:00",
                                    "num_likes": 12,
                                    "num_shares": 3,
                                },
                                {
                                    "post_id": 102,
                                    "user_id": 2,
                                    "content": "The feature pitch is sharp, but the proof still feels thin.",
                                    "created_at": "2026-04-21T12:05:00",
                                    "num_likes": 6,
                                    "num_shares": 1,
                                },
                            ],
                        },
                    },
                )
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "platform": "twitter",
                        "count": 1,
                        "posts": [
                            {
                                "post_id": 201,
                                "user_id": 3,
                                "content": "This opener would stop my scroll, but the back half needs harder proof.",
                                "created_at": "2026-04-21T12:06:00",
                                "num_likes": 9,
                                "num_shares": 4,
                            }
                        ],
                    },
                },
            )

        if method == "GET" and path == "/api/simulation/sim_world/comments":
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "count": 2,
                        "comments": [
                            {
                                "comment_id": 1001,
                                "post_id": 101,
                                "user_id": 2,
                                "content": "I like the speed, but the ending still drags.",
                                "created_at": "2026-04-21T12:01:00",
                                "num_likes": 4,
                            },
                            {
                                "comment_id": 1002,
                                "post_id": 101,
                                "user_id": 3,
                                "content": "I would test this on my next batch because the first beat lands fast.",
                                "created_at": "2026-04-21T12:02:00",
                                "num_likes": 3,
                            },
                        ],
                    },
                },
            )

        if method == "GET" and path == "/api/simulation/sim_world/profiles/realtime":
            platform = request.url.params.get("platform")
            if platform == "reddit":
                profiles = [
                    {
                        "agent_id": 1,
                        "username": "jules_cut",
                        "name": "Jules",
                        "profession": "UGC creator and freelance editor",
                        "bio": "Runs creator workflows for product launches.",
                    },
                    {
                        "agent_id": 2,
                        "username": "nina_brand",
                        "name": "Nina",
                        "profession": "Brand strategist for consumer apps",
                        "bio": "Looks for proof and trust gaps in short-form ads.",
                    },
                ]
            else:
                profiles = [
                    {
                        "agent_id": 3,
                        "username": "omar_growth",
                        "name": "Omar",
                        "profession": "Growth marketer and creative analyst",
                        "bio": "Tracks hooks, drop-off, and shareability.",
                    }
                ]
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "platform": platform,
                        "count": len(profiles),
                        "profiles": profiles,
                    },
                },
            )

        if method == "GET" and path == "/api/simulation/sim_world/agent-stats":
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "agents_count": 3,
                        "stats": [
                            {
                                "agent_id": 1,
                                "agent_name": "Jules",
                                "total_actions": 7,
                                "twitter_actions": 0,
                                "reddit_actions": 7,
                                "action_types": {"CREATE_POST": 2, "COMMENT": 3},
                            },
                            {
                                "agent_id": 2,
                                "agent_name": "Nina",
                                "total_actions": 5,
                                "twitter_actions": 0,
                                "reddit_actions": 5,
                                "action_types": {"CREATE_POST": 1, "COMMENT": 2},
                            },
                            {
                                "agent_id": 3,
                                "agent_name": "Omar",
                                "total_actions": 6,
                                "twitter_actions": 4,
                                "reddit_actions": 2,
                                "action_types": {"CREATE_POST": 2, "LIKE_POST": 2},
                            },
                        ],
                    },
                },
            )

        if method == "GET" and path == "/api/simulation/sim_world/timeline":
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "rounds_count": 2,
                        "timeline": [
                            {
                                "round_num": 1,
                                "twitter_actions": 2,
                                "reddit_actions": 3,
                                "total_actions": 5,
                                "active_agents_count": 3,
                                "active_agents": [1, 2, 3],
                                "action_types": {"CREATE_POST": 2, "COMMENT": 1},
                            },
                            {
                                "round_num": 2,
                                "twitter_actions": 1,
                                "reddit_actions": 2,
                                "total_actions": 3,
                                "active_agents_count": 2,
                                "active_agents": [1, 2],
                                "action_types": {"COMMENT": 2, "LIKE_POST": 1},
                            },
                        ],
                    },
                },
            )

        if method == "GET" and path == "/api/simulation/sim_world/run-status/detail":
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "simulation_id": "sim_world",
                        "runner_status": "completed",
                        "current_round": 2,
                        "total_rounds": 2,
                        "all_actions": [
                            {
                                "round_num": 1,
                                "timestamp": "2026-04-21T12:00:00",
                                "platform": "reddit",
                                "agent_id": 1,
                                "agent_name": "Jules",
                                "action_type": "CREATE_POST",
                                "action_args": {
                                    "content": "UGC creators will save time on rough cuts with this workflow."
                                },
                            },
                            {
                                "round_num": 2,
                                "timestamp": "2026-04-21T12:02:00",
                                "platform": "reddit",
                                "agent_id": 2,
                                "agent_name": "Nina",
                                "action_type": "COMMENT",
                                "action_args": {"content": "I like the speed, but the ending still drags."},
                            },
                        ],
                    },
                },
            )

        if method == "POST" and path == "/api/simulation/interview/batch":
            interview_requests.append(json.loads(request.content.decode("utf-8")))
            return httpx.Response(
                200,
                request=request,
                json={
                    "success": True,
                    "data": {
                        "interviews_count": 2,
                        "result": {
                            "interviews_count": 2,
                            "results": {
                                "reddit_1": {
                                    "agent_id": 1,
                                    "response": "The first three seconds earned my attention because the hook solves a real workflow pain.",
                                    "platform": "reddit",
                                },
                                "twitter_3": {
                                    "agent_id": 3,
                                    "response": "I needed a cleaner proof beat in the back half before I would repost it.",
                                    "platform": "twitter",
                                },
                            },
                        },
                    },
                },
            )

        raise AssertionError(f"Unexpected request: {method} {request.url}")

    transport = httpx.MockTransport(handler)
    original_client = httpx.Client

    class StubClientFactory:
        def __call__(self, *args, **kwargs) -> httpx.Client:
            return original_client(*args, transport=transport, **kwargs)

    monkeypatch.setattr("app.services.mirofish_runner.httpx.Client", StubClientFactory())

    world = runner.hydrate_audience_world(
        "sim_world",
        windows=[
            {"windowIndex": 1, "startSec": 0.0, "endSec": 4.0, "note": "Hook lands quickly."},
            {"windowIndex": 2, "startSec": 4.0, "endSec": 8.0, "note": "Proof starts softening."},
        ],
        include_cached_interviews=True,
    )

    assert world["status"] == "ready"
    assert world["simulationId"] == "sim_world"
    assert [item["platform"] for item in world["platformBreakdown"]] == ["reddit", "twitter"]
    assert world["threads"][0]["rootPost"]["id"] == "reddit-post-101"
    assert world["threads"][0]["replyCount"] == 2
    assert world["threads"][0]["replies"][0]["content"] == "I like the speed, but the ending still drags."
    assert len(world["cohorts"]) >= 2
    assert world["cohorts"][0]["representativeAgentIds"]
    assert world["agents"][0]["displayName"] == "Jules"
    assert world["interviews"][0]["response"].startswith("The first three seconds")
    assert world["evidenceMoments"][0]["windowId"] == "window-1"
    assert world["evidenceMoments"][0]["threadIds"] == ["reddit-post-101"]
    assert interview_requests == [
        {
            "simulation_id": "sim_world",
            "interviews": [
                {"agent_id": 1, "prompt": "What made you trust this moment?"},
                {"agent_id": 3, "prompt": "What made you skeptical of this video?"},
            ],
            "timeout": 120,
        }
    ]


def test_mirofish_brief_markdown_uses_readable_timeline_moments() -> None:
    from app.services.mirofish_runner import MiroFishRunner

    metadata = SimpleNamespace(duration_sec=8.0, width=720, height=1280, fps=30.0, size_bytes=169943)
    markdown = MiroFishRunner._brief_markdown(
        video_path=Path("source.mp4"),
        metadata=metadata,
        summary_text="A technical test pattern with a steady tone.",
        transcript_preview="No speech detected.",
        speech_coverage=0.0,
        windows=[
            {
                "windowIndex": 1,
                "startSec": 0.0,
                "endSec": 0.67,
                "motionScore": 0.0,
                "audioEnergy": 1.0,
                "transcriptDensity": 0.0,
                "sceneChange": False,
                "silenceOverlap": False,
                "transcriptExcerpt": "",
                "note": "strong audio",
            },
            {
                "windowIndex": 2,
                "startSec": 0.67,
                "endSec": 1.33,
                "motionScore": 0.93,
                "audioEnergy": 0.08,
                "transcriptDensity": 0.0,
                "sceneChange": True,
                "silenceOverlap": False,
                "transcriptExcerpt": "",
                "note": "scene change; high motion",
            },
        ],
        warnings=["No speech detected"],
    )

    assert "## Timeline Moments" in markdown
    assert "- 0.00s to 0.67s:" in markdown
    assert "- 0.67s to 1.33s:" in markdown
    assert "```json" not in markdown
    assert '"windowIndex"' not in markdown


def test_mirofish_brief_markdown_includes_room_seed_personas() -> None:
    from app.services.mirofish_runner import MiroFishRunner

    metadata = SimpleNamespace(duration_sec=8.0, width=720, height=1280, fps=30.0, size_bytes=169943)
    markdown = MiroFishRunner._brief_markdown(
        video_path=Path("source.mp4"),
        metadata=metadata,
        summary_text="A technical test pattern with a steady tone.",
        transcript_preview="No speech detected.",
        speech_coverage=0.0,
        windows=[
            {
                "windowIndex": 1,
                "startSec": 0.0,
                "endSec": 0.67,
                "motionScore": 0.0,
                "audioEnergy": 1.0,
                "transcriptDensity": 0.0,
                "sceneChange": False,
                "silenceOverlap": False,
                "transcriptExcerpt": "",
                "note": "strong audio",
            }
        ],
        warnings=["No speech detected"],
    )

    assert "## Room Seeds" in markdown
    assert "Maya (CasualViewer)" in markdown
    assert "Theo (ExpertViewer)" in markdown
    assert "Jordan (TrendCommentator)" in markdown


def test_mirofish_runner_builds_multiple_cohorts_even_for_generic_profiles(tmp_path: Path) -> None:
    from app.services.mirofish_runner import MiroFishRunner

    runner = MiroFishRunner(make_mirofish_settings(tmp_path))
    agents = [
        {
            "id": 1,
            "displayName": "Avery",
            "role": "Simulated audience agent",
            "bio": None,
            "platforms": ["reddit", "twitter"],
            "stats": {"totalActions": 14, "redditActions": 3, "twitterActions": 11},
        },
        {
            "id": 2,
            "displayName": "BrandObserver",
            "role": "Simulated audience agent",
            "bio": None,
            "platforms": ["reddit", "twitter"],
            "stats": {"totalActions": 12, "redditActions": 2, "twitterActions": 10},
        },
        {
            "id": 3,
            "displayName": "Theo",
            "role": "Simulated audience agent",
            "bio": None,
            "platforms": ["reddit", "twitter"],
            "stats": {"totalActions": 9, "redditActions": 8, "twitterActions": 1},
        },
        {
            "id": 4,
            "displayName": "Maya",
            "role": "Simulated audience agent",
            "bio": None,
            "platforms": ["reddit", "twitter"],
            "stats": {"totalActions": 8, "redditActions": 7, "twitterActions": 1},
        },
        {
            "id": 5,
            "displayName": "Lena",
            "role": "Simulated audience agent",
            "bio": None,
            "platforms": ["reddit", "twitter"],
            "stats": {"totalActions": 3, "redditActions": 1, "twitterActions": 2},
        },
    ]
    posts = [
        {"user_id": 1, "content": "This still needs harder proof before the trust gap closes."},
        {"user_id": 2, "content": "Sharp hook, but I still question the trust gap."},
        {"user_id": 3, "content": "Useful workflow breakdown. The proof lands better here."},
        {"user_id": 4, "content": "Good pacing and clearer payoff for editors."},
    ]
    comments = [
        {"user_id": 1, "content": "I would not repost this without proof."},
        {"user_id": 2, "content": "The claim still feels unclear to me."},
        {"user_id": 3, "content": "This feels worth testing on my next cut."},
        {"user_id": 4, "content": "Helpful framing for a faster rough cut."},
    ]

    cohorts, agent_to_cohort = runner._build_audience_cohorts(
        agents=agents,
        posts=posts,
        comments=comments,
    )

    assert len(cohorts) >= 3
    labels = {cohort["label"] for cohort in cohorts}
    assert "Twitter-first skeptics" in labels
    assert "Reddit-first evaluators" in labels
    assert "Quiet observers" in labels
    assert agent_to_cohort[1] == "twitter-skeptics"
    assert agent_to_cohort[3] == "reddit-evaluators"
    assert agent_to_cohort[5] == "quiet-observers"
