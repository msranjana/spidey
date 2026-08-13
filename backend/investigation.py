"""InvestigationManager — orchestrates agents and streams SSE events.

Path strategy:
  - backend/ is inserted first so ``from models import ...`` resolves to
    backend/models.py (not agents/models.py).
  - The project root is inserted second so ``import agents`` resolves to
    the agents/ package.  We never add agents/ directly to sys.path (that
    would shadow backend/models).

The real AgentOrchestrator is used when available; stub implementations
provide identical deterministic data for standalone / test runs.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from asyncio import Queue
from collections.abc import AsyncGenerator
from datetime import datetime
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# sys.path: backend/ first, then project root (for ``import agents``)
# ---------------------------------------------------------------------------
_BACKEND_DIR = str(Path(__file__).resolve().parent)
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)

for _p in (_PROJECT_ROOT, _BACKEND_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# backend/models must be imported before anything that might pull agents.
# agents/models re-exports these same canonical models, so there is exactly
# one definition of AgentResult / AgentStatus across the codebase.
from models import (  # noqa: E402
    AgentResult,
    AgentStatus,
    ContributingEvidence,
    InvestigationState,
    InvestigationStatus,
    TimelineEvent,
    VerificationCheck,
    utcnow,
)

# ---------------------------------------------------------------------------
# Try to import the real AgentOrchestrator.
# On failure, _ORCHESTRATOR_AVAILABLE stays False and stubs are used.
# ---------------------------------------------------------------------------
_ORCHESTRATOR_AVAILABLE = False
try:
    from agents.orchestrator import AgentOrchestrator as _AgentOrchestrator  # type: ignore[import]
    _ORCHESTRATOR_AVAILABLE = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Demo scenario stubs
# Provide identical data to the real agents so the backend works standalone.
# ---------------------------------------------------------------------------


async def _stub_log_scout() -> AgentResult:
    await asyncio.sleep(3)
    return AgentResult(
        agent_name="Log Scout",
        status=AgentStatus.COMPLETE,
        findings=[
            "ERROR: Connection refused to postgres:5432",
            "Retry attempts: 5/5 failed",
        ],
        evidence={
            "log_lines_analyzed": 1247,
            "error_count": 847,
            "critical_pattern": "connection_refused",
            "error_rate": "100%",
            "time_range": "last 15 minutes",
        },
    )


async def _stub_code_hunter() -> AgentResult:
    await asyncio.sleep(4)
    return AgentResult(
        agent_name="Code Hunter",
        status=AgentStatus.COMPLETE,
        findings=[
            "db_pool.connect() called without timeout",
            "Missing connection pool exhaustion handling",
        ],
        evidence={
            "files_scanned": 42,
            "relevant_files": ["src/db/pool.py", "src/db/connection.py"],
        },
    )


async def _stub_infra_scout() -> AgentResult:
    await asyncio.sleep(5)
    return AgentResult(
        agent_name="Infra Scout",
        status=AgentStatus.COMPLETE,
        findings=[
            "PostgreSQL pod: CrashLoopBackOff",
            "PVC disk usage: 98%",
        ],
        evidence={
            "pod_status": "CrashLoopBackOff",
            "pod_restarts": 7,
            "disk_usage_pct": 98,
            "disk_used_gi": 9.8,
            "disk_capacity_gi": 10,
        },
    )


async def _stub_security_scout() -> AgentResult:
    await asyncio.sleep(3)
    return AgentResult(
        agent_name="Security Scout",
        status=AgentStatus.COMPLETE,
        findings=[
            "No anomalous auth patterns",
            "DB credentials valid",
        ],
        evidence={
            "auth_anomalies": 0,
            "auth_events_checked": 320,
            "suspicious_ips": 0,
        },
    )


_AGENT_STUBS: dict[str, Any] = {
    "Log Scout": _stub_log_scout,
    "Code Hunter": _stub_code_hunter,
    "Infra Scout": _stub_infra_scout,
    "Security Scout": _stub_security_scout,
}

_DEMO_ROOT_CAUSE = (
    "PostgreSQL pod crashed due to disk exhaustion (98% full), "
    "causing all connection pool slots to time out"
)
_DEMO_FIX = (
    "kubectl exec postgres-0 -- vacuumdb --all --analyze; "
    "increase PVC size from 10Gi to 50Gi"
)
_DEMO_VERIFICATION = (
    "API health check: 200 OK; DB connections: 45/100 active; Error rate: 0.0%"
)
_DEMO_CONFIDENCE = 0.97
_DEMO_SEVERITY = "critical"
_DEMO_AFFECTED_COMPONENT = "PostgreSQL / postgres-0 (StatefulSet)"
_DEMO_CONTRIBUTING_EVIDENCE = [
    {"source": "Infra Scout", "finding": "PVC disk usage at 98% (threshold 95%)", "relevance": 0.95},
    {"source": "Infra Scout", "finding": "Pod status: CrashLoopBackOff", "relevance": 0.90},
    {"source": "Log Scout", "finding": "Critical pattern: connection_refused (847 errors)", "relevance": 0.88},
    {"source": "Code Hunter", "finding": "db_pool.connect() lacks timeout; no pool exhaustion handling", "relevance": 0.72},
]
_DEMO_FIX_STEPS = [
    "Reclaim disk space with vacuumdb on postgres-0",
    "Expand postgres-pvc from 10Gi to 50Gi",
    "Rollout restart statefulset/postgres",
    "Set DB_POOL_SIZE=50 in application config",
    "Set DB_POOL_TIMEOUT=30 in application config",
]
_DEMO_FIX_DIFF = (
    "--- a/config/app.env\n"
    "+++ b/config/app.env\n"
    "@@ -1,4 +1,4 @@\n"
    " DATABASE_URL=postgres://app:***@postgres:5432/appdb\n"
    "-DB_POOL_SIZE=10\n"
    "+DB_POOL_SIZE=50\n"
    "-DB_POOL_TIMEOUT=\n"
    "+DB_POOL_TIMEOUT=30\n"
    " LOG_LEVEL=info\n"
)
_DEMO_VERIFICATION_CHECKS = [
    {"name": "API Health", "status": "pass", "message": "200 OK"},
    {"name": "DB Connections", "status": "pass", "message": "45/100 active"},
    {"name": "Error Rate", "status": "pass", "message": "0.00%"},
    {"name": "PostgreSQL Pod", "status": "pass", "message": "Running"},
    {"name": "Disk Usage", "status": "pass", "message": "61% (post-remediation)"},
]

_AGENT_PROGRESS: dict[str, list[tuple[float, str, str | None]]] = {
    "Log Scout": [
        (0.8, "Connecting to log stream…", None),
        (1.0, "Scanning log lines for errors…", "ERROR: Connection refused to postgres:5432"),
        (1.0, "Analyzing retry patterns…", "Retry attempts: 5/5 failed"),
    ],
    "Code Hunter": [
        (1.0, "Indexing repository…", None),
        (1.2, "Tracing database call sites…", "db_pool.connect() called without timeout"),
        (1.2, "Reviewing error-handling paths…", "Missing connection pool exhaustion handling"),
    ],
    "Infra Scout": [
        (1.2, "Querying cluster state…", None),
        (1.5, "Inspecting PostgreSQL pod…", "PostgreSQL pod: CrashLoopBackOff"),
        (1.5, "Checking persistent volume usage…", "PVC disk usage: 98%"),
    ],
    "Security Scout": [
        (0.8, "Reviewing auth event logs…", None),
        (1.0, "Checking credential validity…", "No anomalous auth patterns"),
        (1.0, "Scanning for suspicious access…", "DB credentials valid"),
    ],
}

_PHASE1_AGENTS = ("Log Scout", "Code Hunter", "Infra Scout", "Security Scout")
_PHASE2_AGENTS = ("Root Cause", "Fix", "Verification")
_FIXTURE_AGENT_SLEEP = 2.0


def _agent_result_from_fixture(agent_name: str, fixture: dict[str, Any]) -> AgentResult:
    """Build an ``AgentResult`` from a scenario fixture's expected agent data."""
    expected = fixture["expected_agents"][agent_name]
    return AgentResult(
        agent_name=agent_name,
        status=AgentStatus(expected["status"]),
        findings=list(expected.get("findings", [])),
        evidence=dict(expected.get("evidence", {})),
    )


def _verification_message(fixture: dict[str, Any]) -> str:
    """Format a human-readable verification summary from fixture checks."""
    checks = fixture["expected_verification"]["checks"]
    parts = [f"{key.replace('_', ' ')}: {value}" for key, value in checks.items()]
    verdict = fixture["expected_verification"].get("verdict", "PASS")
    return f"Verdict: {verdict}; " + "; ".join(parts)


def _ensure_fixture_agents(state: InvestigationState, fixture: dict[str, Any]) -> None:
    """Ensure investigation state has all agents referenced by the fixture."""
    for agent_name in fixture["expected_agents"]:
        if agent_name not in state.agents:
            state.agents[agent_name] = AgentResult(agent_name=agent_name)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _default_data_file() -> Path:
    """Resolve the investigations store path.

    Override with the ``SPIDY_DATA_FILE`` environment variable; defaults to
    ``backend/data/investigations.json``.
    """
    env = os.environ.get("SPIDY_DATA_FILE")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent / "data" / "investigations.json"


# ---------------------------------------------------------------------------
# InvestigationManager
# ---------------------------------------------------------------------------


class InvestigationManager:
    """Holds investigations and orchestrates agent execution.

    State is persisted to a JSON file (see ``_default_data_file``) so history
    survives backend restarts.  Runs interrupted by a restart are reloaded in
    ``FAILED`` state.
    """

    def __init__(self, data_file: str | os.PathLike[str] | None = None) -> None:
        self._investigations: dict[str, InvestigationState] = {}
        self._subscribers: dict[str, list[Queue[str | None]]] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._data_file = Path(data_file) if data_file is not None else _default_data_file()
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Load investigations from the JSON store, if it exists."""
        if not self._data_file.exists():
            return
        try:
            raw = self._data_file.read_text(encoding="utf-8")
            data = json.loads(raw)
        except (OSError, ValueError, json.JSONDecodeError):
            return
        changed = False
        for item in data:
            try:
                state = InvestigationState(**item)
            except Exception:  # noqa: BLE001
                continue
            if state.status in (
                InvestigationStatus.RUNNING,
                InvestigationStatus.ROOT_CAUSE,
                InvestigationStatus.FIX_PROPOSED,
            ):
                state.status = InvestigationStatus.FAILED
                state.updated_at = utcnow()
                changed = True
            self._investigations[state.id] = state
            self._subscribers[state.id] = []
        if changed:
            self._persist()

    def _persist(self) -> None:
        """Atomically write all investigations to the JSON store."""
        try:
            self._data_file.parent.mkdir(parents=True, exist_ok=True)
            payload = [state.model_dump(mode="json") for state in self._investigations.values()]
            tmp = self._data_file.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            tmp.replace(self._data_file)
        except OSError:
            pass

    # ------------------------------------------------------------------
    # Public CRUD
    # ------------------------------------------------------------------

    def create(
        self,
        title: str = "Untitled Investigation",
        *,
        logs: str | None = None,
        stack_trace: str | None = None,
        config_snippet: str | None = None,
        code_snippet: str | None = None,
    ) -> InvestigationState:
        inv_id = str(uuid.uuid4())
        state = InvestigationState(
            id=inv_id,
            title=title,
            status=InvestigationStatus.PENDING,
            logs=logs,
            stack_trace=stack_trace,
            config_snippet=config_snippet,
            code_snippet=code_snippet,
            agents={
                name: AgentResult(agent_name=name)
                for name in _AGENT_STUBS
            },
        )
        self._investigations[inv_id] = state
        self._subscribers[inv_id] = []
        self._persist()
        return state

    def get(self, inv_id: str) -> InvestigationState | None:
        return self._investigations.get(inv_id)

    def list(self) -> list[InvestigationState]:
        """Return all investigations, newest first."""
        return sorted(
            self._investigations.values(),
            key=lambda s: (s.created_at, s.id),
            reverse=True,
        )

    def update_agent(self, inv_id: str, agent_name: str, result: AgentResult) -> None:
        state = self._investigations[inv_id]
        state.agents[agent_name] = result
        state.updated_at = utcnow()
        self._persist()

    def set_scenario(self, inv_id: str, scenario_id: str) -> None:
        """Record the demo scenario for an investigation and persist it."""
        state = self._investigations.get(inv_id)
        if state is None:
            return
        state.scenario_id = scenario_id
        state.updated_at = utcnow()
        self._persist()

    # ------------------------------------------------------------------
    # SSE subscription
    # ------------------------------------------------------------------

    def attach_subscriber(self, inv_id: str) -> Queue[str | None]:
        """Register a new SSE subscriber queue for an investigation."""
        q: Queue[str | None] = Queue()
        self._subscribers.setdefault(inv_id, []).append(q)
        return q

    def detach_subscriber(self, inv_id: str, q: Queue[str | None]) -> None:
        """Remove a subscriber queue when the client disconnects."""
        try:
            self._subscribers[inv_id].remove(q)
        except (KeyError, ValueError):
            pass

    def subscribe(self, inv_id: str) -> AsyncGenerator[str, None]:
        """Return an async generator that yields SSE JSON lines."""
        q: Queue[str | None] = Queue()
        if inv_id not in self._subscribers:
            self._subscribers[inv_id] = []
        self._subscribers[inv_id].append(q)

        async def _generator() -> AsyncGenerator[str, None]:
            try:
                while True:
                    item = await q.get()
                    if item is None:
                        break
                    yield item
            finally:
                try:
                    self._subscribers[inv_id].remove(q)
                except (KeyError, ValueError):
                    pass

        return _generator()

    # ------------------------------------------------------------------
    # Internal publish helpers
    # ------------------------------------------------------------------

    def _publish(self, inv_id: str, event_type: str, data: dict[str, Any]) -> None:
        payload = json.dumps({"type": event_type, "data": data})
        for q in self._subscribers.get(inv_id, []):
            q.put_nowait(payload)

    @staticmethod
    def _duration_ms(started_at: datetime | None, ended_at: datetime | None = None) -> int:
        if started_at is None:
            return 0
        end = ended_at or utcnow()
        return max(0, int((end - started_at).total_seconds() * 1000))

    def _publish_agent_progress(
        self,
        inv_id: str,
        agent: str,
        status: AgentStatus,
        findings: list[str],
        current_task: str | None,
        started_at: datetime | None,
        *,
        evidence: dict[str, Any] | None = None,
        error: str | None = None,
        ended_at: datetime | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "agent": agent,
            "status": status,
            "findings": findings,
            "current_task": current_task,
            "duration_ms": self._duration_ms(started_at, ended_at),
        }
        if evidence is not None:
            payload["evidence"] = evidence
        if error is not None:
            payload["error"] = error
        self._publish(inv_id, "agent_update", payload)

    @staticmethod
    def _parse_contributing_evidence(
        items: list[dict[str, Any]] | None,
    ) -> list[ContributingEvidence]:
        if not items:
            return []
        return [
            ContributingEvidence(
                source=item.get("source", "Unknown"),
                finding=item.get("finding", ""),
                relevance=float(item.get("relevance", 0.0)),
            )
            for item in items
        ]

    @staticmethod
    def _parse_verification_checks(
        items: list[dict[str, Any]] | None,
    ) -> list[VerificationCheck]:
        if not items:
            return []
        return [
            VerificationCheck(
                name=item.get("name", "Check"),
                status=item.get("status", "unknown"),
                message=item.get("message", ""),
            )
            for item in items
        ]

    def _apply_results_payload(
        self, state: InvestigationState, payload: dict[str, Any]
    ) -> None:
        state.root_cause = payload.get("root_cause")
        state.confidence = payload.get("confidence")
        state.severity = payload.get("severity")
        state.affected_component = payload.get("affected_component")
        state.contributing_evidence = self._parse_contributing_evidence(
            payload.get("contributing_evidence")
        )
        state.proposed_fix = payload.get("proposed_fix")
        state.proposed_fix_diff = payload.get("proposed_fix_diff")
        state.fix_steps = list(payload.get("fix_steps") or [])
        verdict = payload.get("verification_verdict")
        if verdict:
            state.verification_result = f"Verdict: {verdict}"
        elif payload.get("verification_result"):
            state.verification_result = payload["verification_result"]
        state.verification_checks = self._parse_verification_checks(
            payload.get("verification_checks")
        )
        state.updated_at = utcnow()
        self._persist()

    def _results_sse_payload(self, state: InvestigationState) -> dict[str, Any]:
        return {
            "root_cause": state.root_cause,
            "confidence": state.confidence,
            "severity": state.severity,
            "affected_component": state.affected_component,
            "contributing_evidence": [
                e.model_dump() for e in state.contributing_evidence
            ],
            "proposed_fix": state.proposed_fix,
            "proposed_fix_diff": state.proposed_fix_diff,
            "fix_steps": state.fix_steps,
            "verification_result": state.verification_result,
            "verification_checks": [
                c.model_dump() for c in state.verification_checks
            ],
        }

    def _apply_fixture_root_cause(
        self, state: InvestigationState, fixture: dict[str, Any]
    ) -> None:
        scenario = fixture.get("scenario", {})
        root_cause_agent = fixture.get("expected_agents", {}).get("Root Cause", {})
        root_evidence = root_cause_agent.get("evidence", {})
        state.root_cause = fixture.get("expected_root_cause_full")
        state.confidence = root_evidence.get("confidence")
        state.severity = scenario.get("severity", "").lower() or None
        state.affected_component = scenario.get("affected_component")
        state.updated_at = utcnow()
        self._persist()

    def _apply_fixture_fix(
        self, state: InvestigationState, fixture: dict[str, Any]
    ) -> None:
        state.fix_steps = list(fixture.get("expected_fix_steps") or [])
        state.proposed_fix = "; ".join(state.fix_steps) if state.fix_steps else None
        state.updated_at = utcnow()
        self._persist()

    def _apply_fixture_verification(
        self, state: InvestigationState, fixture: dict[str, Any]
    ) -> None:
        checks = fixture.get("expected_verification", {}).get("checks", {})
        state.verification_checks = [
            VerificationCheck(
                name=key.replace("_", " ").title(),
                status="pass",
                message=str(value),
            )
            for key, value in checks.items()
        ]
        state.verification_result = _verification_message(fixture)
        state.updated_at = utcnow()
        self._persist()

    def _sentinel(self, inv_id: str) -> None:
        for q in self._subscribers.get(inv_id, []):
            q.put_nowait(None)

    # ------------------------------------------------------------------
    # Orchestration entry point
    # ------------------------------------------------------------------

    def start(self, inv_id: str, scenario_id: str | None = None) -> None:
        """Start the pipeline as a tracked background task.

        Cancels any prior run for the same investigation before starting a
        new one.  Tasks are tracked so they can be cancelled on shutdown.
        """
        self.cancel(inv_id)
        task = asyncio.create_task(self.run_investigation(inv_id, scenario_id))
        self._tasks[inv_id] = task
        task.add_done_callback(self._on_task_done)

    def _on_task_done(self, task: asyncio.Task[Any]) -> None:
        """Remove a finished task from the registry (only if it is the current one)."""
        for inv_id, current in list(self._tasks.items()):
            if current is task:
                self._tasks.pop(inv_id, None)
                return

    def cancel(self, inv_id: str) -> None:
        """Cancel a tracked background task for an investigation, if any."""
        task = self._tasks.pop(inv_id, None)
        if task is not None and not task.done():
            task.cancel()

    async def cancel_all(self) -> None:
        """Cancel all tracked background tasks (e.g. on shutdown)."""
        tasks = list(self._tasks.values())
        self._tasks.clear()
        if not tasks:
            return
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def run_investigation(
        self, inv_id: str, scenario_id: str | None = None
    ) -> None:
        """Full investigation pipeline (runs as a background asyncio task)."""
        state = self._investigations.get(inv_id)
        try:
            if scenario_id is not None:
                await self._run_with_fixture(inv_id, scenario_id)
            elif _ORCHESTRATOR_AVAILABLE:
                await self._run_with_real_agents(inv_id)
            else:
                await self._run_with_stubs(inv_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            if state is not None:
                state.status = InvestigationStatus.FAILED
                state.updated_at = utcnow()
                self._publish(
                    inv_id,
                    "investigation_update",
                    {"status": InvestigationStatus.FAILED, "error": str(exc)},
                )
        finally:
            self._persist()
            self._sentinel(inv_id)

    # ------------------------------------------------------------------
    # Real-agent pipeline
    # ------------------------------------------------------------------

    async def _run_with_real_agents(self, inv_id: str) -> None:
        state = self._investigations[inv_id]
        state.status = InvestigationStatus.RUNNING
        state.updated_at = utcnow()
        self._publish(inv_id, "investigation_update", {"status": "RUNNING", "message": "Investigation started"})
        self._add_timeline(state, "investigation_started", None, "Investigation started")

        orchestrator = _AgentOrchestrator()

        async def _on_update(agent_name: str, agent_result: AgentResult) -> None:
            # agent_result is already a backend.models.AgentResult (the agents
            # package re-exports the canonical model), so store it directly.
            self.update_agent(inv_id, agent_name, agent_result)
            self._publish_agent_progress(
                inv_id,
                agent_name,
                agent_result.status,
                agent_result.findings,
                None,
                agent_result.started_at,
                evidence=agent_result.evidence,
                ended_at=agent_result.completed_at,
            )
            self._add_timeline(
                state,
                "agent_complete",
                agent_name,
                f"{agent_name} complete",
                {"findings": agent_result.findings},
            )

            if agent_result.status != AgentStatus.COMPLETE:
                return
            if agent_name == "Root Cause":
                self._apply_results_payload(state, {
                    "root_cause": agent_result.evidence.get("root_cause_summary"),
                    "confidence": agent_result.evidence.get("confidence"),
                    "severity": agent_result.evidence.get("severity"),
                    "affected_component": agent_result.evidence.get("affected_component"),
                    "contributing_evidence": agent_result.evidence.get("contributing_evidence", []),
                })
                state.status = InvestigationStatus.ROOT_CAUSE
                state.updated_at = utcnow()
                self._publish(inv_id, "investigation_update", {
                    "status": InvestigationStatus.ROOT_CAUSE,
                    **self._results_sse_payload(state),
                })
                self._add_timeline(state, "root_cause", None, f"Root cause: {state.root_cause}")
            elif agent_name == "Fix":
                self._apply_results_payload(state, {
                    "proposed_fix": agent_result.findings[0] if agent_result.findings else None,
                    "proposed_fix_diff": agent_result.evidence.get("proposed_fix_diff"),
                    "fix_steps": agent_result.evidence.get("fix_steps", []),
                })
                state.status = InvestigationStatus.FIX_PROPOSED
                state.updated_at = utcnow()
                self._publish(inv_id, "investigation_update", {
                    "status": InvestigationStatus.FIX_PROPOSED,
                    **self._results_sse_payload(state),
                })
                self._add_timeline(state, "fix_proposed", None, f"Fix: {state.proposed_fix}")
            elif agent_name == "Verification":
                self._apply_results_payload(state, {
                    "verification_verdict": agent_result.evidence.get("verdict"),
                    "verification_checks": agent_result.evidence.get("verification_checks", []),
                })
                state.status = InvestigationStatus.COMPLETE
                state.updated_at = utcnow()
                self._publish(inv_id, "investigation_update", {
                    "status": InvestigationStatus.COMPLETE,
                    **self._results_sse_payload(state),
                })
                self._add_timeline(state, "complete", None, "Investigation complete")

        try:
            result = await orchestrator.run_investigation(
                investigation_id=inv_id,
                context={"title": state.title},
                on_update_callback=_on_update,
            )
            self._apply_results_payload(state, result)
            state.status = InvestigationStatus.COMPLETE
            state.updated_at = utcnow()

            self._publish(inv_id, "complete", {
                "investigation_id": inv_id,
                **self._results_sse_payload(state),
            })
        except Exception as exc:  # noqa: BLE001
            state.status = InvestigationStatus.FAILED
            state.updated_at = utcnow()
            self._publish(inv_id, "investigation_update", {"status": "FAILED", "error": str(exc)})

    # ------------------------------------------------------------------
    # Fixture-driven pipeline (used by run-demo with scenario_id)
    # ------------------------------------------------------------------

    async def _run_with_fixture(self, inv_id: str, scenario_id: str) -> None:
        from demo.registry import get_fixture

        fixture = get_fixture(scenario_id)
        state = self._investigations[inv_id]
        _ensure_fixture_agents(state, fixture)
        state.scenario_id = scenario_id
        state.status = InvestigationStatus.RUNNING
        state.updated_at = utcnow()

        self._publish(
            inv_id,
            "investigation_update",
            {
                "status": "RUNNING",
                "message": "Investigation started",
                "scenario_id": scenario_id,
            },
        )
        self._add_timeline(state, "investigation_started", None, "Investigation started")

        # Phase 1 — parallel scouts
        for name in _PHASE1_AGENTS:
            state.agents[name].status = AgentStatus.RUNNING
            state.agents[name].started_at = utcnow()
            self._publish(
                inv_id,
                "agent_update",
                {"agent": name, "status": AgentStatus.RUNNING, "findings": []},
            )
            self._add_timeline(state, "agent_started", name, f"{name} started")

        phase1_tasks = [
            asyncio.create_task(self._run_fixture_agent(inv_id, name, fixture))
            for name in _PHASE1_AGENTS
        ]
        await asyncio.gather(*phase1_tasks)

        # Phase 2 — sequential synthesis agents
        for name in _PHASE2_AGENTS:
            state.agents[name].status = AgentStatus.RUNNING
            state.agents[name].started_at = utcnow()
            self._publish(
                inv_id,
                "agent_update",
                {"agent": name, "status": AgentStatus.RUNNING, "findings": []},
            )
            self._add_timeline(state, "agent_started", name, f"{name} started")
            await self._run_fixture_agent(inv_id, name, fixture)

            if name == "Root Cause":
                self._apply_fixture_root_cause(state, fixture)
                state.status = InvestigationStatus.ROOT_CAUSE
                state.updated_at = utcnow()
                self._publish(
                    inv_id,
                    "investigation_update",
                    {
                        "status": InvestigationStatus.ROOT_CAUSE,
                        **self._results_sse_payload(state),
                    },
                )
                self._add_timeline(
                    state, "root_cause", None, f"Root cause: {state.root_cause}"
                )
            elif name == "Fix":
                self._apply_fixture_fix(state, fixture)
                state.status = InvestigationStatus.FIX_PROPOSED
                state.updated_at = utcnow()
                self._publish(
                    inv_id,
                    "investigation_update",
                    {
                        "status": InvestigationStatus.FIX_PROPOSED,
                        **self._results_sse_payload(state),
                    },
                )
                self._add_timeline(
                    state, "fix_proposed", None, f"Fix: {state.proposed_fix}"
                )
            elif name == "Verification":
                self._apply_fixture_verification(state, fixture)
                state.status = InvestigationStatus.COMPLETE
                state.updated_at = utcnow()
                self._publish(
                    inv_id,
                    "investigation_update",
                    {
                        "status": InvestigationStatus.COMPLETE,
                        **self._results_sse_payload(state),
                    },
                )
                self._add_timeline(state, "complete", None, "Investigation complete")

        self._publish(
            inv_id,
            "complete",
            {
                "investigation_id": inv_id,
                "scenario_id": scenario_id,
                **self._results_sse_payload(state),
            },
        )

    async def _run_fixture_agent(
        self, inv_id: str, name: str, fixture: dict[str, Any]
    ) -> None:
        state = self._investigations[inv_id]
        try:
            await asyncio.sleep(_FIXTURE_AGENT_SLEEP)
            result = _agent_result_from_fixture(name, fixture)
            result.started_at = state.agents[name].started_at
            result.completed_at = utcnow()
            self.update_agent(inv_id, name, result)
            self._publish(
                inv_id,
                "agent_update",
                {
                    "agent": name,
                    "status": AgentStatus.COMPLETE,
                    "findings": result.findings,
                    "evidence": result.evidence,
                },
            )
            self._add_timeline(
                state,
                "agent_complete",
                name,
                f"{name} complete: {len(result.findings)} findings",
                {"findings": result.findings},
            )
        except Exception as exc:  # noqa: BLE001
            state.agents[name].status = AgentStatus.FAILED
            state.agents[name].completed_at = utcnow()
            self._publish(
                inv_id,
                "agent_update",
                {"agent": name, "status": AgentStatus.FAILED, "error": str(exc)},
            )

    # ------------------------------------------------------------------
    # Stub pipeline (used when agents package is not present)
    # ------------------------------------------------------------------

    async def _run_with_stubs(self, inv_id: str) -> None:
        state = self._investigations[inv_id]
        state.status = InvestigationStatus.RUNNING
        state.updated_at = utcnow()

        self._publish(inv_id, "investigation_update", {"status": "RUNNING", "message": "Investigation started"})
        self._add_timeline(state, "investigation_started", None, "Investigation started")

        # Phase 1: parallel agents
        for name in _AGENT_STUBS:
            started_at = utcnow()
            state.agents[name].status = AgentStatus.RUNNING
            state.agents[name].started_at = started_at
            self._publish_agent_progress(
                inv_id,
                name,
                AgentStatus.RUNNING,
                [],
                f"{name} starting…",
                started_at,
            )
            self._add_timeline(state, "agent_started", name, f"{name} started")

        tasks = [
            asyncio.create_task(self._run_single_agent(inv_id, name, fn))
            for name, fn in _AGENT_STUBS.items()
        ]
        await asyncio.gather(*tasks)

        # Phase 2: root cause
        await asyncio.sleep(2)
        self._apply_results_payload(state, {
            "root_cause": _DEMO_ROOT_CAUSE,
            "confidence": _DEMO_CONFIDENCE,
            "severity": _DEMO_SEVERITY,
            "affected_component": _DEMO_AFFECTED_COMPONENT,
            "contributing_evidence": _DEMO_CONTRIBUTING_EVIDENCE,
        })
        self._publish(inv_id, "investigation_update", {
            "status": InvestigationStatus.ROOT_CAUSE,
            **self._results_sse_payload(state),
        })
        state.status = InvestigationStatus.ROOT_CAUSE
        state.updated_at = utcnow()
        self._add_timeline(state, "root_cause", None, f"Root cause: {state.root_cause}")

        # Phase 3: fix
        await asyncio.sleep(2)
        state.proposed_fix = _DEMO_FIX
        state.proposed_fix_diff = _DEMO_FIX_DIFF
        state.fix_steps = list(_DEMO_FIX_STEPS)
        state.status = InvestigationStatus.FIX_PROPOSED
        state.updated_at = utcnow()
        self._publish(inv_id, "investigation_update", {
            "status": InvestigationStatus.FIX_PROPOSED,
            **self._results_sse_payload(state),
        })
        self._add_timeline(state, "fix_proposed", None, f"Fix: {state.proposed_fix}")

        # Phase 4: verification
        await asyncio.sleep(3)
        state.verification_result = _DEMO_VERIFICATION
        state.verification_checks = self._parse_verification_checks(
            _DEMO_VERIFICATION_CHECKS
        )
        state.status = InvestigationStatus.COMPLETE
        state.updated_at = utcnow()
        self._publish(inv_id, "investigation_update", {
            "status": InvestigationStatus.COMPLETE,
            **self._results_sse_payload(state),
        })
        self._add_timeline(state, "complete", None, "Investigation complete")

        self._publish(inv_id, "complete", {
            "investigation_id": inv_id,
            **self._results_sse_payload(state),
        })

    async def _run_single_agent(self, inv_id: str, name: str, stub_fn: Any) -> None:
        state = self._investigations[inv_id]
        started_at = state.agents[name].started_at or utcnow()
        findings: list[str] = []
        try:
            stub_task = asyncio.create_task(stub_fn())
            for delay, task, finding in _AGENT_PROGRESS.get(name, []):
                await asyncio.sleep(delay)
                if finding:
                    findings.append(finding)
                state.agents[name].findings = list(findings)
                self._publish_agent_progress(
                    inv_id,
                    name,
                    AgentStatus.RUNNING,
                    findings,
                    task,
                    started_at,
                )

            result: AgentResult = await stub_task
            result.agent_name = name
            result.started_at = started_at
            result.completed_at = utcnow()
            self.update_agent(inv_id, name, result)
            self._publish_agent_progress(
                inv_id,
                name,
                AgentStatus.COMPLETE,
                result.findings,
                None,
                started_at,
                evidence=result.evidence,
                ended_at=result.completed_at,
            )
            self._add_timeline(
                state, "agent_complete", name,
                f"{name} complete: {len(result.findings)} findings",
                {"findings": result.findings},
            )
        except Exception as exc:  # noqa: BLE001
            state.agents[name].status = AgentStatus.FAILED
            state.agents[name].completed_at = utcnow()
            self._publish_agent_progress(
                inv_id,
                name,
                AgentStatus.FAILED,
                findings,
                None,
                started_at,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # Timeline helper
    # ------------------------------------------------------------------

    @staticmethod
    def _add_timeline(
        state: InvestigationState,
        event_type: str,
        agent: str | None,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        state.timeline.append(
            TimelineEvent(
                timestamp=utcnow(),
                event_type=event_type,
                agent=agent,
                message=message,
                data=data or {},
            )
        )
