/** Mirror of backend Pydantic models (backend/models.py). */

export enum AgentStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

export enum InvestigationStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

export interface AgentResult {
  agent_name: string;
  status: AgentStatus;
  findings: string[];
  evidence: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
}

export interface TimelineEvent {
  timestamp: string;
  event_type: string; // agent_started | agent_complete | root_cause | fix | verification | complete
  agent: string | null;
  message: string;
  data: Record<string, unknown>;
}

export interface InvestigationState {
  id: string;
  title: string;
  status: InvestigationStatus;
  agents: Record<string, AgentResult>;
  root_cause: string | null;
  proposed_fix: string | null;
  verification_result: string | null;
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
}

/** SSE event envelope */
export interface SSEEvent {
  type: 'agent_update' | 'investigation_update' | 'complete';
  data: Record<string, unknown>;
}

/** Response from POST /api/investigations */
export interface StartInvestigationResponse {
  investigation_id: string;
  status: InvestigationStatus;
}

/** Payload from SSE `agent_update` events */
export interface AgentUpdatePayload {
  agent: string;
  status: AgentStatus;
  findings?: string[];
  evidence?: Record<string, unknown>;
  current_task?: string;
  duration_ms?: number;
  error?: string;
}

/** Payload from SSE `investigation_update` events */
export interface InvestigationUpdatePayload {
  status: string;
  message?: string;
  root_cause?: string;
  proposed_fix?: string;
  verification_result?: string;
}

/** Payload from SSE `complete` events */
export interface CompletePayload {
  investigation_id: string;
  root_cause: string;
  proposed_fix: string;
  verification_result: string;
}
