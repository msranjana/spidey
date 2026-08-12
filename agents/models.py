"""Data models for Spider-Sense agents.

Pure stdlib — no external dependencies required.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


class AgentStatus(str, enum.Enum):
    """Lifecycle states for an agent run."""

    IDLE = "IDLE"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


@dataclass
class AgentResult:
    """Result produced by a single agent."""

    agent_name: str
    status: AgentStatus = AgentStatus.IDLE
    findings: list[str] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain dict (JSON-friendly)."""
        return {
            "agent_name": self.agent_name,
            "status": self.status.value,
            "findings": self.findings,
            "evidence": self.evidence,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error": self.error,
        }
