import type {
  DemoScenario,
  InvestigationState,
  InvestigationSummary,
  StartInvestigationRequest,
  StartInvestigationResponse,
} from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function listInvestigations(): Promise<InvestigationSummary[]> {
  return request<InvestigationSummary[]>('/api/investigations');
}

export function listDemoScenarios(): Promise<DemoScenario[]> {
  return request<DemoScenario[]>('/api/demo/scenarios');
}

export function startInvestigation(
  input: string | StartInvestigationRequest = 'API Database Connection Failure',
  start = false,
): Promise<StartInvestigationResponse> {
  const body: StartInvestigationRequest =
    typeof input === 'string'
      ? { title: input }
      : { title: 'Untitled Investigation', ...input };

  const query = start ? '?start=true' : '';
  return request<StartInvestigationResponse>(`/api/investigations${query}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function startCustomInvestigation(
  payload: StartInvestigationRequest,
): Promise<StartInvestigationResponse> {
  return startInvestigation(payload, true);
}

export function runDemo(
  id: string,
  scenarioId?: string,
): Promise<{ investigation_id: string; scenario_id: string; message: string }> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : '';
  return request(`/api/investigations/${id}/run-demo${query}`, {
    method: 'POST',
  });
}

export function getInvestigation(id: string): Promise<InvestigationState> {
  return request<InvestigationState>(`/api/investigations/${id}`);
}

export function streamUrl(id: string): string {
  return `/api/investigations/${id}/stream`;
}
