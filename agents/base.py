"""BaseAgent abstract class for Spider-Sense agents."""

from __future__ import annotations

import abc
from typing import Any

from .models import AgentResult, AgentStatus, utcnow


class BaseAgent(abc.ABC):
    """Abstract base that all Spider-Sense agents must implement.

    Subclasses override ``_investigate`` to supply deterministic
    (or LLM-enhanced) analysis.  The public ``run`` method handles
    timing, status transitions, and error capture automatically.
    """

    #: Human-readable name shown in the UI.
    name: str = "UnnamedAgent"

    def __init__(self) -> None:
        self.status: AgentStatus = AgentStatus.IDLE

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def run(self, context: dict[str, Any]) -> AgentResult:
        """Execute the agent and return a completed ``AgentResult``.

        ``context`` is an arbitrary dict that callers may populate with
        incident metadata (title, labels, raw log snippets …).  Agents
        are free to ignore it for deterministic demo scenarios.
        """
        result = AgentResult(
            agent_name=self.name,
            status=AgentStatus.RUNNING,
            started_at=utcnow(),
        )
        self.status = AgentStatus.RUNNING
        try:
            findings, evidence = await self._investigate(context)
            result.findings = findings
            result.evidence = evidence
            result.status = AgentStatus.COMPLETE
            self.status = AgentStatus.COMPLETE
        except Exception as exc:  # noqa: BLE001
            result.status = AgentStatus.FAILED
            result.error = str(exc)
            self.status = AgentStatus.FAILED
        finally:
            result.completed_at = utcnow()
        return result

    # ------------------------------------------------------------------
    # Abstract hook
    # ------------------------------------------------------------------

    @abc.abstractmethod
    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        """Return (findings, evidence) for this agent.

        Both values must be JSON-serialisable.
        """
