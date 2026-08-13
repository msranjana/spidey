"""AgentOrchestrator — runs the full Spider-Sense investigation pipeline."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from .code_hunter import CodeHunterAgent
from .fix_agent import FixAgent
from .infra_scout import InfraScoutAgent
from .log_scout import LogScoutAgent
from .models import AgentResult, AgentStatus
from .root_cause import RootCauseAgent
from .security_scout import SecurityScoutAgent
from .verification import VerificationAgent

# Type alias for the update callback.
UpdateCallback = Callable[[str, AgentResult], Awaitable[None] | None]


class AgentOrchestrator:
    """Coordinates all agents in the two-phase investigation pipeline.

    Phase 1 (parallel):
        Log Scout, Code Hunter, Infra Scout, Security Scout

    Phase 2 (sequential):
        Root Cause → Fix → Verification

    ``on_update_callback`` is called after each agent completes.
    It may be a coroutine or a plain function.
    """

    def __init__(self) -> None:
        # Instantiate all agents once; they are stateless between runs.
        self._log_scout = LogScoutAgent()
        self._code_hunter = CodeHunterAgent()
        self._infra_scout = InfraScoutAgent()
        self._security_scout = SecurityScoutAgent()
        self._root_cause = RootCauseAgent()
        self._fix = FixAgent()
        self._verification = VerificationAgent()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_investigation(
        self,
        investigation_id: str,
        context: dict[str, Any],
        on_update_callback: UpdateCallback | None = None,
    ) -> dict[str, Any]:
        """Execute the full pipeline and return a result dict.

        Args:
            investigation_id: Unique ID for this run (used in callback payloads).
            context: Arbitrary incident metadata passed to every agent.
            on_update_callback: Optional async or sync callable invoked with
                ``(agent_name: str, result: AgentResult)`` after each agent.

        Returns:
            A JSON-serialisable dict containing all agent results, root cause,
            proposed fix, verification outcome, and timing metadata.
        """
        started_at = datetime.utcnow()
        results: dict[str, AgentResult] = {}

        async def _notify(result: AgentResult) -> None:
            if on_update_callback is None:
                return
            ret = on_update_callback(result.agent_name, result)
            if asyncio.iscoroutine(ret):
                await ret

        # ------------------------------------------------------------------
        # Phase 1 — parallel scouts
        # ------------------------------------------------------------------
        phase1_agents = [
            self._log_scout,
            self._code_hunter,
            self._infra_scout,
            self._security_scout,
        ]

        phase1_results: list[AgentResult] = await asyncio.gather(
            *[agent.run(context) for agent in phase1_agents]
        )

        for result in phase1_results:
            results[result.agent_name] = result
            await _notify(result)

        # Enrich context with evidence for downstream agents.
        enriched_context = dict(context)
        for result in phase1_results:
            if result.agent_name == "Log Scout":
                enriched_context["log_evidence"] = result.evidence
            elif result.agent_name == "Infra Scout":
                enriched_context["infra_evidence"] = result.evidence

        # ------------------------------------------------------------------
        # Phase 2 — sequential: Root Cause → Fix → Verification
        # ------------------------------------------------------------------
        for agent in (self._root_cause, self._fix, self._verification):
            result = await agent.run(enriched_context)
            results[result.agent_name] = result
            await _notify(result)

        # ------------------------------------------------------------------
        # Compile final output
        # ------------------------------------------------------------------
        root_cause_result = results.get("Root Cause")
        fix_result = results.get("Fix")
        verification_result = results.get("Verification")

        rc_evidence = root_cause_result.evidence if root_cause_result else {}
        fix_evidence = fix_result.evidence if fix_result else {}
        ver_evidence = verification_result.evidence if verification_result else {}

        return {
            "investigation_id": investigation_id,
            "started_at": started_at.isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "agents": {name: res.to_dict() for name, res in results.items()},
            "root_cause": (
                rc_evidence.get("root_cause_summary")
                if root_cause_result and root_cause_result.status == AgentStatus.COMPLETE
                else None
            ),
            "confidence": (
                rc_evidence.get("confidence")
                if root_cause_result and root_cause_result.status == AgentStatus.COMPLETE
                else None
            ),
            "severity": rc_evidence.get("severity"),
            "affected_component": rc_evidence.get("affected_component"),
            "contributing_evidence": rc_evidence.get("contributing_evidence", []),
            "proposed_fix": (
                fix_result.findings[0]
                if fix_result and fix_result.findings
                else None
            ),
            "proposed_fix_diff": fix_evidence.get("proposed_fix_diff"),
            "fix_steps": fix_evidence.get("fix_steps", []),
            "verification_verdict": (
                ver_evidence.get("verdict")
                if verification_result and verification_result.status == AgentStatus.COMPLETE
                else None
            ),
            "verification_checks": ver_evidence.get("verification_checks", []),
            "status": "COMPLETE" if all(
                r.status == AgentStatus.COMPLETE for r in results.values()
            ) else "PARTIAL",
        }
