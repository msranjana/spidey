import type { InvestigationState, StartInvestigationResponse } from './types';

const BASE_URL = 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Create a new investigation.
 * POST /api/investigations
 */
export function startInvestigation(
  title = 'API Database Connection Failure',
): Promise<StartInvestigationResponse> {
  return request<StartInvestigationResponse>('/api/investigations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

/**
 * Kick off the deterministic demo scenario.
 * POST /api/investigations/{id}/run-demo
 */
export function runDemo(id: string): Promise<{ started: boolean }> {
  return request<{ started: boolean }>(`/api/investigations/${id}/run-demo`, {
    method: 'POST',
  });
}

/**
 * Fetch current investigation state snapshot.
 * GET /api/investigations/{id}
 */
export function getInvestigation(id: string): Promise<InvestigationState> {
  return request<InvestigationState>(`/api/investigations/${id}`);
}

/**
 * Build the SSE stream URL for an investigation.
 * (Used by useInvestigation hook via EventSource.)
 */
export function streamUrl(id: string): string {
  return `${BASE_URL}/api/investigations/${id}/stream`;
}
