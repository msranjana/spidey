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

# backend/models must be imported before anything that might pull agents.models
from models import (  # noqa: E402
    AgentResult,
    AgentStatus,
    InvestigationState,
    InvestigationStatus,
    TimelineEvent,
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


# ---------------------------------------------------------------------------
# InvestigationManager
# ---------------------------------------------------------------------------


class InvestigationManager:
    """Holds in-memory investigations and orchestrates agent execution."""

    def __init__(self) -> None:
        self._investigations: dict[str, InvestigationState] = {}
        self._subscribers: dict[str, list[Queue[str | None]]] = {}

    # ------------------------------------------------------------------
    # Public CRUD
    # ------------------------------------------------------------------

    def create(self, title: str = "Untitled Investigation") -> InvestigationState:
        inv_id = str(uuid.uuid4())
        state = InvestigationState(
            id=inv_id,
            title=title,
            status=InvestigationStatus.PENDING,
            agents={
                name: AgentResult(agent_name=name)
                for name in _AGENT_STUBS
            },
        )
        self._investigations[inv_id] = state
        self._subscribers[inv_id] = []
        return state

    def get(self, inv_id: str) -> InvestigationState | None:
        return self._investigations.get(inv_id)

    def update_agent(self, inv_id: str, agent_name: str, result: AgentResult) -> None:
        state = self._investigations[inv_id]
        state.agents[agent_name] = result
        state.updated_at = datetime.utcnow()

    # ------------------------------------------------------------------
    # SSE subscription
    # ------------------------------------------------------------------

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

    def _sentinel(self, inv_id: str) -> None:
        for q in self._subscribers.get(inv_id, []):
            q.put_nowait(None)

    # ------------------------------------------------------------------
    # Orchestration entry point
    # ------------------------------------------------------------------

    async def run_investigation(self, inv_id: str) -> None:
        """Full investigation pipeline (runs as a background asyncio task)."""
        if _ORCHESTRATOR_AVAILABLE:
            await self._run_with_real_agents(inv_id)
        else:
            await self._run_with_stubs(inv_id)

    # ------------------------------------------------------------------
    # Real-agent pipeline
    # ------------------------------------------------------------------

    async def _run_with_real_agents(self, inv_id: str) -> None:
        state = self._investigations[inv_id]
        state.status = InvestigationStatus.RUNNING
        state.updated_at = datetime.utcnow()
        self._publish(inv_id, "investigation_update", {"status": "RUNNING", "message": "Investigation started"})
        self._add_timeline(state, "investigation_started", None, "Investigation started")

        orchestrator = _AgentOrchestrator()

        async def _on_update(agent_name: str, agent_result: Any) -> None:
            # Convert agents.models.AgentResult → backend.models.AgentResult
            pydantic_result = AgentResult(
                agent_name=agent_result.agent_name,
                status=AgentStatus(agent_result.status.value),
                findings=agent_result.findings,
                evidence=agent_result.evidence,
                started_at=agent_result.started_at,
                completed_at=agent_result.completed_at,
            )
            self.update_agent(inv_id, agent_name, pydantic_result)
            self._publish(
                inv_id,
                "agent_update",
                {
                    "agent": agent_name,
                    "status": pydantic_result.status,
                    "findings": pydantic_result.findings,
                    "evidence": pydantic_result.evidence,
                },
            )
            self._add_timeline(
                state,
                "agent_complete",
                agent_name,
                f"{agent_name} complete",
                {"findings": pydantic_result.findings},
            )

        try:
            result = await orchestrator.run_investigation(
                investigation_id=inv_id,
                context={"title": state.title},
                on_update_callback=_on_update,
            )
            state.root_cause = result.get("root_cause")
            state.proposed_fix = result.get("proposed_fix")
            state.verification_result = (
                f"Verdict: {result.get('verification_verdict', 'N/A')}"
            )
            state.status = InvestigationStatus.COMPLETE
            state.updated_at = datetime.utcnow()

            self._publish(inv_id, "investigation_update", {
                "status": "root_cause",
                "root_cause": state.root_cause,
            })
            self._publish(inv_id, "investigation_update", {
                "status": "fix_proposed",
                "proposed_fix": state.proposed_fix,
            })
            self._publish(inv_id, "investigation_update", {
                "status": InvestigationStatus.COMPLETE,
                "verification_result": state.verification_result,
            })
            self._publish(inv_id, "complete", {
                "investigation_id": inv_id,
                "root_cause": state.root_cause,
                "proposed_fix": state.proposed_fix,
                "verification_result": state.verification_result,
            })
            self._add_timeline(state, "complete", None, "Investigation complete")
        except Exception as exc:  # noqa: BLE001
            state.status = InvestigationStatus.FAILED
            state.updated_at = datetime.utcnow()
            self._publish(inv_id, "investigation_update", {"status": "FAILED", "error": str(exc)})
        finally:
            self._sentinel(inv_id)

    # ------------------------------------------------------------------
    # Stub pipeline (used when agents package is not present)
    # ------------------------------------------------------------------

    async def _run_with_stubs(self, inv_id: str) -> None:
        state = self._investigations[inv_id]
        state.status = InvestigationStatus.RUNNING
        state.updated_at = datetime.utcnow()

        self._publish(inv_id, "investigation_update", {"status": "RUNNING", "message": "Investigation started"})
        self._add_timeline(state, "investigation_started", None, "Investigation started")

        # Phase 1: parallel agents
        for name in _AGENT_STUBS:
            state.agents[name].status = AgentStatus.RUNNING
            state.agents[name].started_at = datetime.utcnow()
            self._publish(inv_id, "agent_update", {"agent": name, "status": AgentStatus.RUNNING, "findings": []})
            self._add_timeline(state, "agent_started", name, f"{name} started")

        tasks = [
            asyncio.create_task(self._run_single_agent(inv_id, name, fn))
            for name, fn in _AGENT_STUBS.items()
        ]
        await asyncio.gather(*tasks)

        # Phase 2: root cause
        await asyncio.sleep(2)
        state.root_cause = _DEMO_ROOT_CAUSE
        state.updated_at = datetime.utcnow()
        self._publish(inv_id, "investigation_update", {"status": "root_cause", "root_cause": state.root_cause})
        self._add_timeline(state, "root_cause", None, f"Root cause: {state.root_cause}")

        # Phase 3: fix
        await asyncio.sleep(2)
        state.proposed_fix = _DEMO_FIX
        state.updated_at = datetime.utcnow()
        self._publish(inv_id, "investigation_update", {"status": "fix_proposed", "proposed_fix": state.proposed_fix})
        self._add_timeline(state, "fix_proposed", None, f"Fix: {state.proposed_fix}")

        # Phase 4: verification
        await asyncio.sleep(3)
        state.verification_result = _DEMO_VERIFICATION
        state.status = InvestigationStatus.COMPLETE
        state.updated_at = datetime.utcnow()
        self._publish(inv_id, "investigation_update", {
            "status": InvestigationStatus.COMPLETE,
            "verification_result": state.verification_result,
        })
        self._add_timeline(state, "complete", None, "Investigation complete")

        self._publish(inv_id, "complete", {
            "investigation_id": inv_id,
            "root_cause": state.root_cause,
            "proposed_fix": state.proposed_fix,
            "verification_result": state.verification_result,
        })
        self._sentinel(inv_id)

    async def _run_single_agent(self, inv_id: str, name: str, stub_fn: Any) -> None:
        state = self._investigations[inv_id]
        try:
            result: AgentResult = await stub_fn()
            result.agent_name = name
            result.started_at = state.agents[name].started_at
            result.completed_at = datetime.utcnow()
            self.update_agent(inv_id, name, result)
            self._publish(inv_id, "agent_update", {
                "agent": name,
                "status": AgentStatus.COMPLETE,
                "findings": result.findings,
                "evidence": result.evidence,
            })
            self._add_timeline(
                state, "agent_complete", name,
                f"{name} complete: {len(result.findings)} findings",
                {"findings": result.findings},
            )
        except Exception as exc:  # noqa: BLE001
            state.agents[name].status = AgentStatus.FAILED
            state.agents[name].completed_at = datetime.utcnow()
            self._publish(inv_id, "agent_update", {"agent": name, "status": AgentStatus.FAILED, "error": str(exc)})

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
                timestamp=datetime.utcnow(),
                event_type=event_type,
                agent=agent,
                message=message,
                data=data or {},
            )
        )
