"""Tests for Spider-Sense demo scenario registry and run-demo API."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from demo.registry import (
    DEFAULT_SCENARIO_ID,
    get_fixture,
    list_scenario_ids,
    list_scenarios,
    resolve_scenario_id,
)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestScenarioRegistry:
    def test_default_scenario_is_db_connection_failure(self) -> None:
        assert DEFAULT_SCENARIO_ID == "api-db-connection-failure"
        assert resolve_scenario_id(None) == DEFAULT_SCENARIO_ID
        assert resolve_scenario_id("") == DEFAULT_SCENARIO_ID
        assert resolve_scenario_id("  ") == DEFAULT_SCENARIO_ID

    def test_list_scenario_ids_returns_three_scenarios(self) -> None:
        ids = list_scenario_ids()
        assert len(ids) == 3
        assert DEFAULT_SCENARIO_ID in ids
        assert "memory-oom-kill" in ids
        assert "tls-certificate-expiry" in ids

    def test_list_scenarios_metadata(self) -> None:
        scenarios = list_scenarios()
        assert len(scenarios) == 3
        by_id = {s["id"]: s for s in scenarios}
        assert by_id["memory-oom-kill"]["title"] == "Memory OOM Kill — Order Service"
        assert by_id["tls-certificate-expiry"]["severity"] == "HIGH"

    def test_get_fixture_db_default(self) -> None:
        fixture = get_fixture(DEFAULT_SCENARIO_ID)
        assert fixture["scenario"]["id"] == DEFAULT_SCENARIO_ID
        assert "expected_agents" in fixture
        assert "expected_root_cause_full" in fixture

    def test_get_fixture_unknown_raises(self) -> None:
        with pytest.raises(KeyError):
            get_fixture("nonexistent-scenario")

    @pytest.mark.parametrize(
        "scenario_id",
        ["api-db-connection-failure", "memory-oom-kill", "tls-certificate-expiry"],
    )
    def test_fixture_schema_has_required_keys(self, scenario_id: str) -> None:
        fixture = get_fixture(scenario_id)
        assert fixture["schema_version"] == "1.0"
        assert fixture["scenario"]["id"] == scenario_id
        assert fixture["expected_investigation"]["status"] == "COMPLETE"
        assert len(fixture["expected_agents"]) == 7


# ---------------------------------------------------------------------------
# run-demo API
# ---------------------------------------------------------------------------


class TestRunDemoScenarioParam:
    @pytest.fixture()
    def client(self) -> TestClient:
        backend = _ROOT / "backend"
        if str(backend) not in sys.path:
            sys.path.insert(0, str(backend))
        from main import app

        with TestClient(app) as test_client:
            yield test_client

    def _create_investigation(self, client: TestClient) -> str:
        resp = client.post("/api/investigations", json={"title": "Scenario test"})
        assert resp.status_code == 201
        return resp.json()["investigation_id"]

    def test_run_demo_defaults_to_db_scenario(self, client: TestClient) -> None:
        inv_id = self._create_investigation(client)
        resp = client.post(f"/api/investigations/{inv_id}/run-demo")
        assert resp.status_code == 202
        body = resp.json()
        assert body["scenario_id"] == DEFAULT_SCENARIO_ID
        assert body["investigation_id"] == inv_id

    def test_run_demo_explicit_scenario_id(self, client: TestClient) -> None:
        inv_id = self._create_investigation(client)
        resp = client.post(
            f"/api/investigations/{inv_id}/run-demo",
            params={"scenario_id": "memory-oom-kill"},
        )
        assert resp.status_code == 202
        assert resp.json()["scenario_id"] == "memory-oom-kill"

    def test_run_demo_invalid_scenario_returns_404(self, client: TestClient) -> None:
        inv_id = self._create_investigation(client)
        resp = client.post(
            f"/api/investigations/{inv_id}/run-demo",
            params={"scenario_id": "does-not-exist"},
        )
        assert resp.status_code == 404
        assert "Unknown scenario_id" in resp.json()["detail"]

    def test_run_demo_not_found(self, client: TestClient) -> None:
        resp = client.post("/api/investigations/bad-id/run-demo")
        assert resp.status_code == 404

    def _wait_for_complete(self, client: TestClient, inv_id: str, timeout: float = 15.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            state = client.get(f"/api/investigations/{inv_id}").json()
            if state["status"] in ("COMPLETE", "FAILED"):
                return state
            time.sleep(0.05)
        raise AssertionError(f"Investigation {inv_id} did not complete within {timeout}s")

    def _wait_for_root_cause_contains(
        self,
        client: TestClient,
        inv_id: str,
        keyword: str,
        timeout: float = 15.0,
    ) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            state = client.get(f"/api/investigations/{inv_id}").json()
            root_cause = state.get("root_cause") or ""
            if keyword in root_cause.lower() and state["status"] == "COMPLETE":
                return state
            time.sleep(0.05)
        raise AssertionError(
            f"Root cause did not contain {keyword!r} within {timeout}s"
        )

    def test_run_demo_memory_scenario_completes_with_expected_root_cause(
        self, client: TestClient
    ) -> None:
        inv_id = self._create_investigation(client)
        client.post(
            f"/api/investigations/{inv_id}/run-demo",
            params={"scenario_id": "memory-oom-kill"},
        )
        fixture = get_fixture("memory-oom-kill")
        state = self._wait_for_root_cause_contains(
            client,
            inv_id,
            fixture["expected_root_cause_contains"],
        )
        assert state["status"] == "COMPLETE"
        assert state["scenario_id"] == "memory-oom-kill"
        assert fixture["expected_root_cause_contains"] in state["root_cause"].lower()
        assert state["agents"]["Log Scout"]["status"] == "COMPLETE"
        assert state["agents"]["Root Cause"]["status"] == "COMPLETE"

    def test_run_demo_tls_scenario_completes_with_expected_root_cause(
        self, client: TestClient
    ) -> None:
        inv_id = self._create_investigation(client)
        client.post(
            f"/api/investigations/{inv_id}/run-demo",
            params={"scenario_id": "tls-certificate-expiry"},
        )
        fixture = get_fixture("tls-certificate-expiry")
        state = self._wait_for_root_cause_contains(
            client,
            inv_id,
            fixture["expected_root_cause_contains"],
        )
        assert state["status"] == "COMPLETE"
        assert state["scenario_id"] == "tls-certificate-expiry"
        assert fixture["expected_root_cause_contains"] in state["root_cause"].lower()
        assert "Verdict: PASS" in state["verification_result"]

    def test_fixture_files_are_valid_json(self) -> None:
        fixtures_dir = _ROOT / "demo" / "fixtures"
        for path in fixtures_dir.glob("*.json"):
            data = json.loads(path.read_text(encoding="utf-8"))
            assert "scenario" in data
            assert "id" in data["scenario"]
