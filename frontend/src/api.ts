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
): Promise<StartInvestigationResponse> {
  const body: StartInvestigationRequest =
    typeof input === 'string'
      ? { title: input }
      : { title: 'Untitled Investigation', ...input };

  return request<StartInvestigationResponse>('/api/investigations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function startInvestigationRun(id: string): Promise<{ investigation_id: string }> {
  return request<{ investigation_id: string }>(`/api/investigations/${id}/start`, {
    method: 'POST',
  });
}

export async function startCustomInvestigation(
  payload: StartInvestigationRequest,
): Promise<StartInvestigationResponse> {
  const created = await startInvestigation(payload);
  await startInvestigationRun(created.investigation_id);
  return created;
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
