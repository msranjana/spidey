"""Pydantic models for Spider-Sense backend."""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    """Current time as an aware UTC datetime (replaces deprecated datetime.utcnow)."""
    return datetime.now(timezone.utc)


class AgentStatus(str, enum.Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class InvestigationStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    ROOT_CAUSE = "root_cause"
    FIX_PROPOSED = "fix_proposed"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class AgentResult(BaseModel):
    agent_name: str
    status: AgentStatus = AgentStatus.IDLE
    findings: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain JSON-friendly dict."""
        return self.model_dump(mode="json")


class TimelineEvent(BaseModel):
    timestamp: datetime
    event_type: str  # agent_started | agent_complete | root_cause | fix | verification | complete
    agent: str | None = None
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class ContributingEvidence(BaseModel):
    source: str
    finding: str
    relevance: float = Field(ge=0.0, le=1.0)


class VerificationCheck(BaseModel):
    name: str
    status: str  # pass | fail | warn
    message: str


class InvestigationState(BaseModel):
    id: str
    title: str
    status: InvestigationStatus = InvestigationStatus.PENDING
    scenario_id: str | None = None
    agents: dict[str, AgentResult] = Field(default_factory=dict)
    logs: str | None = None
    stack_trace: str | None = None
    config_snippet: str | None = None
    code_snippet: str | None = None
    root_cause: str | None = None
    confidence: float | None = None
    severity: str | None = None
    affected_component: str | None = None
    contributing_evidence: list[ContributingEvidence] = Field(default_factory=list)
    proposed_fix: str | None = None
    proposed_fix_diff: str | None = None
    fix_steps: list[str] = Field(default_factory=list)
    verification_result: str | None = None
    verification_checks: list[VerificationCheck] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class InvestigationSummary(BaseModel):
    id: str
    title: str
    status: InvestigationStatus
    created_at: datetime
    updated_at: datetime


class StartInvestigationRequest(BaseModel):
    title: str = "Untitled Investigation"
    logs: str | None = None
    stack_trace: str | None = None
    config_snippet: str | None = None
    code_snippet: str | None = None


class StartInvestigationResponse(BaseModel):
    investigation_id: str
    status: InvestigationStatus


class SSEEvent(BaseModel):
    type: str  # agent_update | investigation_update | complete
    data: dict[str, Any]
