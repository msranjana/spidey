"""Pydantic models for Spider-Sense backend."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AgentStatus(str, enum.Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class InvestigationStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class AgentResult(BaseModel):
    agent_name: str
    status: AgentStatus = AgentStatus.IDLE
    findings: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class TimelineEvent(BaseModel):
    timestamp: datetime
    event_type: str  # agent_started | agent_complete | root_cause | fix | verification | complete
    agent: str | None = None
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class InvestigationState(BaseModel):
    id: str
    title: str
    status: InvestigationStatus = InvestigationStatus.PENDING
    agents: dict[str, AgentResult] = Field(default_factory=dict)
    root_cause: str | None = None
    proposed_fix: str | None = None
    verification_result: str | None = None
    timeline: list[TimelineEvent] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StartInvestigationRequest(BaseModel):
    title: str = "Untitled Investigation"


class StartInvestigationResponse(BaseModel):
    investigation_id: str
    status: InvestigationStatus


class SSEEvent(BaseModel):
    type: str  # agent_update | investigation_update | complete
    data: dict[str, Any]
