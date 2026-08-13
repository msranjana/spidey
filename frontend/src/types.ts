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
  current_task?: string;
  duration_ms?: number;
}

export interface TimelineEvent {
  timestamp: string;
  event_type: string;
  agent: string | null;
  message: string;
  data: Record<string, unknown>;
}

export interface ContributingEvidence {
  source: string;
  finding: string;
  relevance: number;
}

export interface VerificationCheck {
  name: string;
  status: string;
  message: string;
}

export interface InvestigationState {
  id: string;
  title: string;
  status: InvestigationStatus;
  scenario_id?: string | null;
  agents: Record<string, AgentResult>;
  logs?: string | null;
  stack_trace?: string | null;
  config_snippet?: string | null;
  code_snippet?: string | null;
  root_cause: string | null;
  confidence: number | null;
  severity: string | null;
  affected_component: string | null;
  contributing_evidence: ContributingEvidence[];
  proposed_fix: string | null;
  proposed_fix_diff: string | null;
  fix_steps: string[];
  verification_result: string | null;
  verification_checks: VerificationCheck[];
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
}

export interface InvestigationSummary {
  id: string;
  title: string;
  status: InvestigationStatus;
  created_at: string;
  updated_at: string;
}

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  severity: string;
}

export interface SSEEvent {
  type: 'agent_update' | 'investigation_update' | 'complete';
  data: Record<string, unknown>;
}

export interface StartInvestigationRequest {
  title?: string;
  logs?: string;
  stack_trace?: string;
  config_snippet?: string;
  code_snippet?: string;
}

export interface StartInvestigationResponse {
  investigation_id: string;
  status: InvestigationStatus;
}

export interface AgentUpdatePayload {
  agent: string;
  status: AgentStatus;
  findings?: string[];
  evidence?: Record<string, unknown>;
  current_task?: string;
  duration_ms?: number;
  error?: string;
}

export interface InvestigationUpdatePayload {
  status: string;
  message?: string;
  root_cause?: string;
  confidence?: number;
  severity?: string;
  affected_component?: string;
  contributing_evidence?: ContributingEvidence[];
  proposed_fix?: string;
  proposed_fix_diff?: string;
  fix_steps?: string[];
  verification_result?: string;
  verification_checks?: VerificationCheck[];
}

export interface CompletePayload {
  investigation_id: string;
  root_cause: string;
  confidence?: number;
  severity?: string;
  affected_component?: string;
  contributing_evidence?: ContributingEvidence[];
  proposed_fix: string;
  proposed_fix_diff?: string;
  fix_steps?: string[];
  verification_result: string;
  verification_checks?: VerificationCheck[];
}
