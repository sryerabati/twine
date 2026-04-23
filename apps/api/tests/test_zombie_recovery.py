from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.context import APIContext
from app.services.jobs import AnalysisJobService


def test_recover_zombie_analyses_marks_running_records_failed(
    test_context: APIContext,
) -> None:
    analysis_paths = test_context.storage.create_analysis_paths()
    running = test_context.storage.init_analysis_record(analysis_paths.analysis_id).model_copy(
        update={
            "status": "running",
            "updatedAt": datetime.now(UTC),
        }
    )
    test_context.storage.write_analysis_record(running)

    service = AnalysisJobService(
        test_context.storage,
        test_context.runner,
        test_context.engine,
        test_context.convex_sync,
    )

    recovered = service.recover_zombie_analyses()

    refreshed = test_context.storage.read_analysis_record(analysis_paths.analysis_id)
    assert recovered == 1
    assert refreshed.status == "failed"
    assert refreshed.error is not None
    assert "interrupted by server restart" in refreshed.error


def test_get_analysis_times_out_stale_running_records(
    client: TestClient,
    test_context: APIContext,
) -> None:
    analysis_paths = test_context.storage.create_analysis_paths()
    running = test_context.storage.init_analysis_record(analysis_paths.analysis_id).model_copy(
        update={
            "status": "running",
            "updatedAt": datetime.now(UTC) - timedelta(minutes=11),
        }
    )
    test_context.storage.write_analysis_record(running)

    response = client.get(f"/api/analysis/{analysis_paths.analysis_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert "server may have restarted" in payload["error"]

    refreshed = test_context.storage.read_analysis_record(analysis_paths.analysis_id)
    assert refreshed.status == "failed"
    assert refreshed.error is not None
    assert "server may have restarted" in refreshed.error


def test_cancel_analysis_marks_running_record_failed_and_is_idempotent(
    client: TestClient,
    test_context: APIContext,
) -> None:
    analysis_paths = test_context.storage.create_analysis_paths()
    running = test_context.storage.init_analysis_record(analysis_paths.analysis_id).model_copy(
        update={
            "status": "running",
            "updatedAt": datetime.now(UTC),
        }
    )
    test_context.storage.write_analysis_record(running)

    response = client.post(f"/api/analysis/{analysis_paths.analysis_id}/cancel")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "Cancelled by user."

    second_response = client.post(f"/api/analysis/{analysis_paths.analysis_id}/cancel")

    assert second_response.status_code == 200
    assert second_response.json()["status"] == "failed"
    assert second_response.json()["error"] == "Cancelled by user."
