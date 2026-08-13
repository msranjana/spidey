import { useCallback, useEffect, useRef, useState } from 'react';
import { streamUrl } from '../api';
import {
  AgentStatus,
  InvestigationStatus,
  type AgentResult,
  type InvestigationState,
  type SSEEvent,
} from '../types';

interface UseInvestigationReturn {
  investigationState: InvestigationState | null;
  isConnected: boolean;
  error: string | null;
  connect: (id: string) => void;
  disconnect: () => void;
}

/** Initial empty investigation state used before the first SSE event. */
function emptyState(id: string): InvestigationState {
  return {
    id,
    title: 'API Database Connection Failure',
    status: InvestigationStatus.PENDING,
    agents: {},
    root_cause: null,
    confidence: null,
    severity: null,
    affected_component: null,
    contributing_evidence: [],
    proposed_fix: null,
    proposed_fix_diff: null,
    fix_steps: [],
    verification_result: null,
    verification_checks: [],
    timeline: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mergeInvestigationFields(
  prev: InvestigationState,
  d: Record<string, unknown>,
): InvestigationState {
  return {
    ...prev,
    updated_at: new Date().toISOString(),
    status: (d.status as InvestigationStatus) ?? prev.status,
    root_cause:
      d.root_cause !== undefined
        ? (d.root_cause as string | null)
        : prev.root_cause,
    confidence:
      d.confidence !== undefined
        ? (d.confidence as number | null)
        : prev.confidence,
    severity:
      d.severity !== undefined
        ? (d.severity as string | null)
        : prev.severity,
    affected_component:
      d.affected_component !== undefined
        ? (d.affected_component as string | null)
        : prev.affected_component,
    contributing_evidence:
      d.contributing_evidence !== undefined
        ? (d.contributing_evidence as InvestigationState['contributing_evidence'])
        : prev.contributing_evidence,
    proposed_fix:
      d.proposed_fix !== undefined
        ? (d.proposed_fix as string | null)
        : prev.proposed_fix,
    proposed_fix_diff:
      d.proposed_fix_diff !== undefined
        ? (d.proposed_fix_diff as string | null)
        : prev.proposed_fix_diff,
    fix_steps:
      d.fix_steps !== undefined
        ? (d.fix_steps as string[])
        : prev.fix_steps,
    verification_result:
      d.verification_result !== undefined
        ? (d.verification_result as string | null)
        : prev.verification_result,
    verification_checks:
      d.verification_checks !== undefined
        ? (d.verification_checks as InvestigationState['verification_checks'])
        : prev.verification_checks,
    timeline: d.timeline
      ? (d.timeline as InvestigationState['timeline'])
      : prev.timeline,
  };
}

export function useInvestigation(): UseInvestigationReturn {
  const [investigationState, setInvestigationState] =
    useState<InvestigationState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(
    (id: string) => {
      disconnect();
      setError(null);
      setInvestigationState(emptyState(id));

      const es = new EventSource(streamUrl(id));
      esRef.current = es;

      es.onopen = () => setIsConnected(true);

      es.onmessage = (ev: MessageEvent<string>) => {
        try {
          const sseEvent = JSON.parse(ev.data) as SSEEvent;
          handleSSEEvent(sseEvent);
        } catch {
          // ignore unparseable frames
        }
      };

      es.onerror = () => {
        setError('SSE connection lost. The stream may have ended.');
        setIsConnected(false);
        es.close();
      };
    },
    [disconnect],
  );

  function handleSSEEvent(event: SSEEvent) {
    setInvestigationState((prev) => {
      if (!prev) return prev;

      switch (event.type) {
        case 'agent_update': {
          const agentData = event.data as Partial<AgentResult> & {
            agent?: string;
            agent_name?: string;
          };
          const name = agentData.agent ?? agentData.agent_name;
          if (!name) return prev;

          return {
            ...prev,
            updated_at: new Date().toISOString(),
            agents: {
              ...prev.agents,
              [name]: {
                agent_name: name,
                status: (agentData.status as AgentStatus) ?? AgentStatus.IDLE,
                findings: (agentData.findings as string[]) ?? [],
                evidence:
                  (agentData.evidence as Record<string, unknown>) ?? {},
                started_at: (agentData.started_at as string) ?? null,
                completed_at: (agentData.completed_at as string) ?? null,
              },
            },
          };
        }

        case 'investigation_update': {
          return mergeInvestigationFields(prev, event.data);
        }

        case 'complete': {
          const full = event.data as Partial<InvestigationState>;
          return {
            ...mergeInvestigationFields(prev, event.data),
            ...full,
            status: InvestigationStatus.COMPLETE,
            updated_at: new Date().toISOString(),
          };
        }

        default:
          return prev;
      }
    });
  }

  // Clean up on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return { investigationState, isConnected, error, connect, disconnect };
}
