from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import httpx

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

    seen_request_headers: list[tuple[str, str, str | None]] = []
    report_prompt: str | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal report_prompt
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
