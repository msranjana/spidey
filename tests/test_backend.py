"""Smoke tests for Spider-Sense backend.

Run with:
    cd E:/proj/spidy
    python -m pytest tests/ -v
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import asyncio

import pytest
from fastapi.testclient import TestClient

from main import app, manager
from models import AgentStatus, InvestigationStatus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/investigations
# ---------------------------------------------------------------------------


def test_start_investigation_default_title(client: TestClient) -> None:
    resp = client.post("/api/investigations")
    assert resp.status_code == 201
    body = resp.json()
    assert "investigation_id" in body
    assert body["status"] == InvestigationStatus.PENDING


def test_start_investigation_custom_title(client: TestClient) -> None:
    resp = client.post("/api/investigations", json={"title": "DB outage"})
    assert resp.status_code == 201
    body = resp.json()
    assert "investigation_id" in body


# ---------------------------------------------------------------------------
# GET /api/investigations/{id}
# ---------------------------------------------------------------------------


def test_get_investigation_not_found(client: TestClient) -> None:
    resp = client.get("/api/investigations/nonexistent-id")
    assert resp.status_code == 404


def test_get_investigation_exists(client: TestClient) -> None:
    # Create one first
    create_resp = client.post("/api/investigations", json={"title": "Test"})
    inv_id = create_resp.json()["investigation_id"]

    resp = client.get(f"/api/investigations/{inv_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == inv_id
    assert body["title"] == "Test"
    assert "agents" in body
    assert "timeline" in body


# ---------------------------------------------------------------------------
# GET /api/investigations/{id}/agents
# ---------------------------------------------------------------------------


def test_get_agents_not_found(client: TestClient) -> None:
    resp = client.get("/api/investigations/bad-id/agents")
    assert resp.status_code == 404


def test_get_agents_has_four_agents(client: TestClient) -> None:
    create_resp = client.post("/api/investigations", json={"title": "Agents test"})
    inv_id = create_resp.json()["investigation_id"]

    resp = client.get(f"/api/investigations/{inv_id}/agents")
    assert resp.status_code == 200
    agents = resp.json()
    expected_agents = {"Log Scout", "Code Hunter", "Infra Scout", "Security Scout"}
    assert set(agents.keys()) == expected_agents
    for agent_data in agents.values():
        assert agent_data["status"] == AgentStatus.IDLE


# ---------------------------------------------------------------------------
# POST /api/investigations/{id}/run-demo
# ---------------------------------------------------------------------------


def test_run_demo_not_found(client: TestClient) -> None:
    resp = client.post("/api/investigations/bad-id/run-demo")
    assert resp.status_code == 404


def test_run_demo_triggers(client: TestClient) -> None:
    create_resp = client.post("/api/investigations", json={"title": "Demo test"})
    inv_id = create_resp.json()["investigation_id"]

    resp = client.post(f"/api/investigations/{inv_id}/run-demo")
    assert resp.status_code == 202
    body = resp.json()
    assert body["investigation_id"] == inv_id


# ---------------------------------------------------------------------------
# InvestigationManager unit tests
# ---------------------------------------------------------------------------


def test_manager_create_and_get() -> None:
    m = manager  # use the shared instance
    state = m.create("Unit test")
    assert state.id
    assert state.title == "Unit test"
    assert state.status == InvestigationStatus.PENDING
    fetched = m.get(state.id)
    assert fetched is not None
    assert fetched.id == state.id


def test_manager_get_missing() -> None:
    m = manager
    assert m.get("does-not-exist") is None


def test_manager_update_agent() -> None:
    from models import AgentResult, AgentStatus

    m = manager
    state = m.create("Update test")
    result = AgentResult(
        agent_name="Log Scout",
        status=AgentStatus.COMPLETE,
        findings=["test finding"],
    )
    m.update_agent(state.id, "Log Scout", result)
    updated = m.get(state.id)
    assert updated is not None
    assert updated.agents["Log Scout"].status == AgentStatus.COMPLETE
    assert updated.agents["Log Scout"].findings == ["test finding"]


# ---------------------------------------------------------------------------
# SSE stream — lightweight check (no full timing wait)
# ---------------------------------------------------------------------------


def test_stream_not_found(client: TestClient) -> None:
    resp = client.get("/api/investigations/bad-id/stream")
    assert resp.status_code == 404


def test_stream_opens(client: TestClient) -> None:
    """Stream should open and immediately emit the : connected comment."""
    create_resp = client.post("/api/investigations", json={"title": "Stream test"})
    inv_id = create_resp.json()["investigation_id"]

    # Use stream=True so TestClient doesn't buffer the whole body
    with client.stream("GET", f"/api/investigations/{inv_id}/stream") as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        # Read the first line (the connection comment)
        first_line = next(resp.iter_lines())
        assert first_line == ": connected"


# ---------------------------------------------------------------------------
# Models unit tests
# ---------------------------------------------------------------------------


def test_investigation_state_defaults() -> None:
    from models import InvestigationState

    state = InvestigationState(id="abc", title="t")
    assert state.status == InvestigationStatus.PENDING
    assert state.agents == {}
    assert state.timeline == []
    assert state.root_cause is None


def test_agent_result_defaults() -> None:
    from models import AgentResult

    result = AgentResult(agent_name="Test Agent")
    assert result.status == AgentStatus.IDLE
    assert result.findings == []
    assert result.evidence == {}
