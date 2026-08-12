"""Smoke tests for the Spider-Sense agents package.

Run with:  python -m pytest tests/test_agents.py -v
or:        python tests/test_agents.py

All tests are async and use only stdlib (asyncio / unittest).
No external testing framework is required, though pytest-asyncio makes
the suite more ergonomic when pytest is available.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

# Ensure the repo root is on sys.path so `import agents` works from any CWD.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agents import (
    AgentOrchestrator,
    AgentResult,
    AgentStatus,
    CodeHunterAgent,
    FixAgent,
    InfraScoutAgent,
    LogScoutAgent,
    RootCauseAgent,
    SecurityScoutAgent,
    VerificationAgent,
)
from agents.base import BaseAgent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro: "asyncio.Coroutine[None, None, object]") -> object:  # type: ignore[type-arg]
    """Run a coroutine synchronously (works on any Python ≥ 3.7)."""
    return asyncio.get_event_loop().run_until_complete(coro)


# Patch all agents to use near-zero sleep so tests finish quickly.
_FAST = 0.01

for _cls in (
    LogScoutAgent,
    CodeHunterAgent,
    InfraScoutAgent,
    SecurityScoutAgent,
    RootCauseAgent,
    FixAgent,
    VerificationAgent,
):
    _cls._SLEEP = _fast = _FAST  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Unit tests — individual agents
# ---------------------------------------------------------------------------

class TestAgentResult(unittest.TestCase):
    def test_defaults(self) -> None:
        r = AgentResult(agent_name="Test")
        self.assertEqual(r.status, AgentStatus.IDLE)
        self.assertEqual(r.findings, [])
        self.assertEqual(r.evidence, {})
        self.assertIsNone(r.error)

    def test_to_dict_keys(self) -> None:
        r = AgentResult(agent_name="Test", status=AgentStatus.COMPLETE)
        d = r.to_dict()
        for key in ("agent_name", "status", "findings", "evidence", "started_at", "completed_at", "error"):
            self.assertIn(key, d, f"Missing key: {key}")

    def test_status_enum_values(self) -> None:
        self.assertEqual(AgentStatus.IDLE.value, "IDLE")
        self.assertEqual(AgentStatus.RUNNING.value, "RUNNING")
        self.assertEqual(AgentStatus.COMPLETE.value, "COMPLETE")
        self.assertEqual(AgentStatus.FAILED.value, "FAILED")


class TestBaseAgentAbstract(unittest.TestCase):
    def test_cannot_instantiate_directly(self) -> None:
        with self.assertRaises(TypeError):
            BaseAgent()  # type: ignore[abstract]


class TestLogScoutAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = LogScoutAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Log Scout")

    def test_run_returns_complete_result(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)
        self.assertEqual(result.agent_name, "Log Scout")

    def test_findings_not_empty(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertGreater(len(result.findings), 0)

    def test_evidence_has_required_keys(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        for key in ("log_lines_analyzed", "error_count", "critical_pattern"):
            self.assertIn(key, result.evidence)

    def test_error_count_is_847(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence["error_count"], 847)

    def test_timestamps_populated(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertIsNotNone(result.started_at)
        self.assertIsNotNone(result.completed_at)
        self.assertGreaterEqual(result.completed_at, result.started_at)


class TestCodeHunterAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = CodeHunterAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Code Hunter")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_severity_high(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("severity"), "high")

    def test_files_scanned(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("files_scanned"), 47)


class TestInfraScoutAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = InfraScoutAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Infra Scout")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_pod_status_crashloop(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("pod_status"), "CrashLoopBackOff")

    def test_disk_usage_98(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("disk_usage_pct"), 98)


class TestSecurityScoutAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = SecurityScoutAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Security Scout")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_no_anomalies(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("auth_anomalies"), 0)
        self.assertEqual(result.evidence.get("threat_level"), "none")


class TestRootCauseAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = RootCauseAgent()
        self._ctx = {
            "infra_evidence": {"disk_usage_pct": 98, "pod_status": "CrashLoopBackOff"},
            "log_evidence": {"critical_pattern": "connection_refused", "error_count": 847},
        }

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Root Cause")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run(self._ctx))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_high_confidence(self) -> None:
        result: AgentResult = _run(self.agent.run(self._ctx))  # type: ignore[assignment]
        self.assertGreaterEqual(result.evidence.get("confidence", 0), 0.95)

    def test_all_triggers_fired(self) -> None:
        result: AgentResult = _run(self.agent.run(self._ctx))  # type: ignore[assignment]
        triggers = result.evidence.get("triggers", {})
        self.assertTrue(triggers.get("disk_exhaustion"))
        self.assertTrue(triggers.get("pod_crash_loop"))
        self.assertTrue(triggers.get("connection_refused"))

    def test_empty_context_still_returns_complete(self) -> None:
        """RootCause must not crash on empty context — uses defaults."""
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)


class TestFixAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = FixAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Fix")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_five_steps(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("step_count"), 5)

    def test_risk_low(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("risk"), "low")

    def test_pool_size_config(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        cfg = result.evidence.get("config_changes", {})
        self.assertEqual(cfg.get("DB_POOL_SIZE", {}).get("to"), 50)
        self.assertEqual(cfg.get("DB_POOL_TIMEOUT", {}).get("to"), 30)


class TestVerificationAgent(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = VerificationAgent()

    def test_name(self) -> None:
        self.assertEqual(self.agent.name, "Verification")

    def test_run_complete(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.status, AgentStatus.COMPLETE)

    def test_verdict_pass(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("verdict"), "PASS")

    def test_api_health_200(self) -> None:
        result: AgentResult = _run(self.agent.run({}))  # type: ignore[assignment]
        self.assertEqual(result.evidence.get("api_health"), "200 OK")


# ---------------------------------------------------------------------------
# Integration test — full orchestrator pipeline
# ---------------------------------------------------------------------------

class TestAgentOrchestrator(unittest.TestCase):
    def _run_pipeline(self) -> dict:
        orch = AgentOrchestrator()
        updates: list[tuple[str, AgentResult]] = []

        async def _cb(name: str, result: AgentResult) -> None:
            updates.append((name, result))

        result = _run(orch.run_investigation("test-001", {}, _cb))  # type: ignore[assignment]
        return result, updates  # type: ignore[return-value]

    def test_pipeline_returns_dict(self) -> None:
        result, _ = self._run_pipeline()
        self.assertIsInstance(result, dict)

    def test_all_agents_present(self) -> None:
        result, _ = self._run_pipeline()
        expected = {
            "Log Scout", "Code Hunter", "Infra Scout", "Security Scout",
            "Root Cause", "Fix", "Verification",
        }
        self.assertEqual(set(result["agents"].keys()), expected)

    def test_status_complete(self) -> None:
        result, _ = self._run_pipeline()
        self.assertEqual(result["status"], "COMPLETE")

    def test_root_cause_populated(self) -> None:
        result, _ = self._run_pipeline()
        self.assertIsNotNone(result["root_cause"])
        self.assertIn("disk", result["root_cause"].lower())

    def test_high_confidence(self) -> None:
        result, _ = self._run_pipeline()
        self.assertGreaterEqual(result["confidence"], 0.95)

    def test_verification_pass(self) -> None:
        result, _ = self._run_pipeline()
        self.assertEqual(result["verification_verdict"], "PASS")

    def test_callback_fired_for_all_agents(self) -> None:
        _, updates = self._run_pipeline()
        agent_names = {name for name, _ in updates}
        expected = {
            "Log Scout", "Code Hunter", "Infra Scout", "Security Scout",
            "Root Cause", "Fix", "Verification",
        }
        self.assertEqual(agent_names, expected)

    def test_callback_results_are_complete(self) -> None:
        _, updates = self._run_pipeline()
        for name, result in updates:
            self.assertEqual(result.status, AgentStatus.COMPLETE, f"{name} not COMPLETE")

    def test_investigation_id_in_result(self) -> None:
        result, _ = self._run_pipeline()
        self.assertEqual(result["investigation_id"], "test-001")

    def test_proposed_fix_not_none(self) -> None:
        result, _ = self._run_pipeline()
        self.assertIsNotNone(result["proposed_fix"])

    def test_pipeline_without_callback(self) -> None:
        """Orchestrator must run cleanly when no callback is provided."""
        orch = AgentOrchestrator()
        result = _run(orch.run_investigation("test-002", {}))  # type: ignore[assignment]
        self.assertEqual(result["status"], "COMPLETE")


# ---------------------------------------------------------------------------
# Entry point — run without pytest
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main(verbosity=2)
