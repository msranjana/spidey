"""Integration / golden-path tests for Spider-Sense.

These tests drive the full investigation pipeline through the FastAPI app
using FastAPI's TestClient (in-process, no network required).

The SSE live-backend tests are skipped automatically when the backend is not
reachable on localhost:8000; start the server first to enable them:

    cd backend && uvicorn main:app --port 8000

Run the whole suite with:
    python -m pytest tests/test_integration.py -v
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup (conftest.py also does this, but keep it here for standalone use)
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).resolve().parent.parent
_BACKEND = _ROOT / "backend"
for _p in (_ROOT, _BACKEND):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BACKEND_BASE = "http://localhost:8000"


def _backend_is_up() -> bool:
    """Return True if the backend is reachable on localhost:8000."""
    try:
        import httpx
        r = httpx.get(f"{_BACKEND_BASE}/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# In-process golden-path tests (no live server required)
# ---------------------------------------------------------------------------

class TestGoldenPathInProcess:
    """Full investigation pipeline exercised entirely through TestClient."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        self.client = client

    # ------------------------------------------------------------------
    # 1. Start investigation
    # ------------------------------------------------------------------

    def test_create_investigation_returns_201(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Golden Path — DB Outage"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "investigation_id" in body
        assert body["status"] == "PENDING"

    # ------------------------------------------------------------------
    # 2. GET investigation immediately after creation
    # ------------------------------------------------------------------

    def test_get_investigation_initial_state(self, created_investigation):
        client, inv_id = created_investigation
        resp = client.get(f"/api/investigations/{inv_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == inv_id
        assert body["status"] in ("PENDING", "RUNNING")
        assert "agents" in body
        assert "timeline" in body

    # ------------------------------------------------------------------
    # 3. Trigger demo
    # ------------------------------------------------------------------

    def test_run_demo_returns_202(self, created_investigation):
        client, inv_id = created_investigation
        resp = client.post(f"/api/investigations/{inv_id}/run-demo")
        assert resp.status_code == 202
        body = resp.json()
        assert body["investigation_id"] == inv_id
        assert "message" in body

    # ------------------------------------------------------------------
    # 4. Agents endpoint lists all four phase-1 agents
    # ------------------------------------------------------------------

    def test_agents_endpoint_returns_all_phase1_agents(self, created_investigation):
        client, inv_id = created_investigation
        resp = client.get(f"/api/investigations/{inv_id}/agents")
        assert resp.status_code == 200
        agents = resp.json()
        expected = {"Log Scout", "Code Hunter", "Infra Scout", "Security Scout"}
        assert set(agents.keys()) == expected

    # ------------------------------------------------------------------
    # 5. SSE stream opens and emits connection comment
    # ------------------------------------------------------------------

    def test_sse_stream_opens(self, created_investigation):
        client, inv_id = created_investigation
        with client.stream("GET", f"/api/investigations/{inv_id}/stream") as resp:
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]
            first_line = next(resp.iter_lines())
            assert first_line == ": connected"

    # ------------------------------------------------------------------
    # 6. Full pipeline: wait for COMPLETE status
    #    We poll after starting the investigation and reading SSE events.
    # ------------------------------------------------------------------

    def test_full_pipeline_complete(self):
        """
        Start an investigation, collect all SSE events, and assert the
        golden-path outcome:
          • status == COMPLETE
          • root_cause is not empty
          • proposed_fix is not empty
          • verification_result contains 'OK' or 'active' or 'PASS'
        """
        # Create
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Golden Path Full"},
        )
        assert resp.status_code == 201
        inv_id = resp.json()["investigation_id"]

        # Collect all SSE events (stream closes with sentinel None)
        events: list[dict] = []
        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            assert stream.status_code == 200
            for raw_line in stream.iter_lines():
                if not raw_line or raw_line.startswith(":"):
                    continue
                if raw_line.startswith("data: "):
                    payload = raw_line[len("data: "):]
                    try:
                        events.append(json.loads(payload))
                    except json.JSONDecodeError:
                        pass

        # Assert we received at least some events
        assert len(events) > 0, "No SSE events received"

        # Assert agent_update events were received
        agent_update_events = [e for e in events if e.get("type") == "agent_update"]
        assert len(agent_update_events) > 0, "No agent_update events"

        # Assert a complete event was received
        complete_events = [e for e in events if e.get("type") == "complete"]
        assert len(complete_events) == 1, "Expected exactly one 'complete' event"

        complete_data = complete_events[0]["data"]
        assert complete_data.get("investigation_id") == inv_id
        assert complete_data.get("root_cause"), "root_cause is empty"
        assert complete_data.get("proposed_fix"), "proposed_fix is empty"

        # Verify final investigation state via API
        state_resp = self.client.get(f"/api/investigations/{inv_id}")
        assert state_resp.status_code == 200
        state = state_resp.json()
        assert state["status"] == "COMPLETE", f"Expected COMPLETE, got {state['status']}"
        assert state["root_cause"], "root_cause field is empty in state"
        assert state["proposed_fix"], "proposed_fix field is empty in state"
        assert state["verification_result"], "verification_result is empty in state"

    # ------------------------------------------------------------------
    # 7. Agent-level assertions after pipeline completes
    # ------------------------------------------------------------------

    def test_all_four_agents_complete_after_pipeline(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Agent Completion Check"},
        )
        inv_id = resp.json()["investigation_id"]

        # Drain the stream to wait for completion
        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            for _ in stream.iter_lines():
                pass

        agents_resp = self.client.get(f"/api/investigations/{inv_id}/agents")
        assert agents_resp.status_code == 200
        agents = agents_resp.json()

        expected_agents = {"Log Scout", "Code Hunter", "Infra Scout", "Security Scout"}
        assert set(agents.keys()) == expected_agents
        for name, data in agents.items():
            assert data["status"] == "COMPLETE", f"{name} not COMPLETE"
            assert len(data["findings"]) > 0, f"{name} has no findings"

    # ------------------------------------------------------------------
    # 8. Fix steps count >= 3 (check proposed_fix string via state)
    # ------------------------------------------------------------------

    def test_proposed_fix_is_non_empty(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Fix Steps Check"},
        )
        inv_id = resp.json()["investigation_id"]

        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            for _ in stream.iter_lines():
                pass

        state = self.client.get(f"/api/investigations/{inv_id}").json()
        assert state["proposed_fix"], "proposed_fix is empty"
        # The fix contains multiple commands separated by semicolons or newlines
        fix = state["proposed_fix"]
        assert len(fix) >= 10, f"proposed_fix too short: {fix!r}"

    # ------------------------------------------------------------------
    # 9. Verification result contains expected health indicators
    # ------------------------------------------------------------------

    def test_verification_result_contains_health_indicators(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Verification Check"},
        )
        inv_id = resp.json()["investigation_id"]

        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            for _ in stream.iter_lines():
                pass

        state = self.client.get(f"/api/investigations/{inv_id}").json()
        verification = state.get("verification_result", "")
        assert verification, "verification_result is empty"
        # Should mention API health or DB connections
        assert any(
            kw in verification.lower()
            for kw in ("api", "db", "connection", "error", "ok")
        ), f"Unexpected verification result: {verification!r}"

    # ------------------------------------------------------------------
    # 10. Root cause mentions disk or postgres
    # ------------------------------------------------------------------

    def test_root_cause_mentions_disk_or_postgres(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Root Cause Content Check"},
        )
        inv_id = resp.json()["investigation_id"]

        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            for _ in stream.iter_lines():
                pass

        state = self.client.get(f"/api/investigations/{inv_id}").json()
        root_cause = state.get("root_cause", "")
        assert root_cause, "root_cause is empty"
        assert any(
            kw in root_cause.lower()
            for kw in ("disk", "postgres", "pvc", "connection")
        ), f"root_cause doesn't mention expected keywords: {root_cause!r}"

    # ------------------------------------------------------------------
    # 11. Timeline events are populated
    # ------------------------------------------------------------------

    def test_timeline_populated_after_pipeline(self):
        resp = self.client.post(
            "/api/investigations",
            json={"title": "Timeline Check"},
        )
        inv_id = resp.json()["investigation_id"]

        with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
            for _ in stream.iter_lines():
                pass

        state = self.client.get(f"/api/investigations/{inv_id}").json()
        timeline = state.get("timeline", [])
        assert len(timeline) > 0, "Timeline is empty after pipeline"

        event_types = {e["event_type"] for e in timeline}
        assert "investigation_started" in event_types
        assert "complete" in event_types

    # ------------------------------------------------------------------
    # 12. Multiple concurrent investigations don't interfere
    # ------------------------------------------------------------------

    def test_two_investigations_are_independent(self):
        ids = []
        for i in range(2):
            resp = self.client.post(
                "/api/investigations",
                json={"title": f"Concurrency Check {i}"},
            )
            ids.append(resp.json()["investigation_id"])

        # Drain both streams (sequentially for simplicity with TestClient)
        for inv_id in ids:
            with self.client.stream("GET", f"/api/investigations/{inv_id}/stream") as stream:
                for _ in stream.iter_lines():
                    pass

        for inv_id in ids:
            state = self.client.get(f"/api/investigations/{inv_id}").json()
            assert state["id"] == inv_id
            assert state["status"] == "COMPLETE"


# ---------------------------------------------------------------------------
# Live-backend tests (require `uvicorn main:app --port 8000`)
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.skipif(not _backend_is_up(), reason="Backend not running on localhost:8000")
class TestLiveBackend:
    """Tests that hit a real running server — skipped unless backend is up."""

    def test_health(self):
        import httpx
        r = httpx.get(f"{_BACKEND_BASE}/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_create_investigation(self):
        import httpx
        r = httpx.post(
            f"{_BACKEND_BASE}/api/investigations",
            json={"title": "Live test"},
        )
        assert r.status_code == 201
        assert "investigation_id" in r.json()

    def test_get_investigation(self):
        import httpx
        create = httpx.post(
            f"{_BACKEND_BASE}/api/investigations",
            json={"title": "Live GET test"},
        )
        inv_id = create.json()["investigation_id"]
        r = httpx.get(f"{_BACKEND_BASE}/api/investigations/{inv_id}")
        assert r.status_code == 200
        assert r.json()["id"] == inv_id

    def test_run_demo_returns_202(self):
        import httpx
        create = httpx.post(
            f"{_BACKEND_BASE}/api/investigations",
            json={"title": "Live demo test"},
        )
        inv_id = create.json()["investigation_id"]
        r = httpx.post(f"{_BACKEND_BASE}/api/investigations/{inv_id}/run-demo")
        assert r.status_code == 202

    def test_sse_stream_events(self):
        """Stream SSE events for up to 20 s; verify agent_update events received."""
        import httpx

        create = httpx.post(
            f"{_BACKEND_BASE}/api/investigations",
            json={"title": "Live SSE test"},
        )
        inv_id = create.json()["investigation_id"]

        events: list[dict] = []
        deadline = time.time() + 20

        with httpx.stream(
            "GET",
            f"{_BACKEND_BASE}/api/investigations/{inv_id}/stream",
            timeout=25.0,
        ) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if time.time() > deadline:
                    break
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data: "):
                    try:
                        events.append(json.loads(line[6:]))
                    except json.JSONDecodeError:
                        pass
                if any(e.get("type") == "complete" for e in events):
                    break

        agent_updates = [e for e in events if e.get("type") == "agent_update"]
        assert len(agent_updates) > 0, "No agent_update events received in 20 s"

    def test_full_golden_path_live(self):
        """
        Full golden path against live server:
          - All 4 agents emit agent_update events
          - A 'complete' event is received
          - Final state has root_cause, proposed_fix, verification_result
        """
        import httpx

        create = httpx.post(
            f"{_BACKEND_BASE}/api/investigations",
            json={"title": "Golden Path Live"},
        )
        inv_id = create.json()["investigation_id"]

        events: list[dict] = []
        deadline = time.time() + 30

        with httpx.stream(
            "GET",
            f"{_BACKEND_BASE}/api/investigations/{inv_id}/stream",
            timeout=35.0,
        ) as resp:
            for line in resp.iter_lines():
                if time.time() > deadline:
                    break
                if line.startswith("data: "):
                    try:
                        events.append(json.loads(line[6:]))
                    except json.JSONDecodeError:
                        pass
                if any(e.get("type") == "complete" for e in events):
                    break

        agent_update_agents = {
            e["data"]["agent"]
            for e in events
            if e.get("type") == "agent_update" and "agent" in e.get("data", {})
        }
        expected_agents = {"Log Scout", "Code Hunter", "Infra Scout", "Security Scout"}
        assert expected_agents.issubset(agent_update_agents), (
            f"Missing agents in updates: {expected_agents - agent_update_agents}"
        )

        complete_events = [e for e in events if e.get("type") == "complete"]
        assert len(complete_events) == 1

        complete_data = complete_events[0]["data"]
        assert complete_data.get("root_cause"), "root_cause missing"
        assert complete_data.get("proposed_fix"), "proposed_fix missing"

        state = httpx.get(f"{_BACKEND_BASE}/api/investigations/{inv_id}").json()
        assert state["status"] == "COMPLETE"
        assert state["root_cause"]
        assert state["proposed_fix"]
        assert state["verification_result"]
