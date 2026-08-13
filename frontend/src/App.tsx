/**
 * App.tsx — Spider-Sense integrated frontend
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import './App.css';
import OrchestrationGraph from './components/OrchestrationGraph';
import AgentCard from './components/AgentCard';
import EvidenceExplorer from './components/EvidenceExplorer';
import ResultsPanels from './components/ResultsPanels';
import IncidentInput from './components/IncidentInput';
import InvestigationHistory from './components/InvestigationHistory';
import {
  getInvestigation,
  listDemoScenarios,
  runDemo,
  startInvestigation,
  streamUrl,
} from './api';
import {
  AgentStatus,
  InvestigationStatus,
  type AgentResult,
  type AgentUpdatePayload,
  type CompletePayload,
  type ContributingEvidence,
  type DemoScenario,
  type InvestigationUpdatePayload,
  type VerificationCheck,
} from './types';

const SCOUT_AGENTS = ['Log Scout', 'Code Hunter', 'Infra Scout', 'Security Scout'];

const EMPTY_RESULTS = {
  root_cause: null as string | null,
  confidence: null as number | null,
  severity: null as string | null,
  affected_component: null as string | null,
  contributing_evidence: [] as ContributingEvidence[],
  proposed_fix: null as string | null,
  proposed_fix_diff: null as string | null,
  fix_steps: [] as string[],
  verification_result: null as string | null,
  verification_checks: [] as VerificationCheck[],
};

function initialAgents(): Record<string, AgentResult> {
  const rec: Record<string, AgentResult> = {};
  for (const name of SCOUT_AGENTS) {
    rec[name] = {
      agent_name: name,
      status: AgentStatus.IDLE,
      findings: [],
      evidence: {},
      started_at: null,
      completed_at: null,
    };
  }
  return rec;
}

function investigationStatusLabel(status: string): string {
  switch (status) {
    case InvestigationStatus.PENDING:      return 'Pending';
    case InvestigationStatus.RUNNING:      return 'Running…';
    case InvestigationStatus.ROOT_CAUSE:   return 'Identifying root cause…';
    case InvestigationStatus.FIX_PROPOSED: return 'Applying fix…';
    case InvestigationStatus.COMPLETE:     return 'Complete';
    case InvestigationStatus.FAILED:       return 'Failed';
    default:                               return '';
  }
}

function statusDotClass(status: string): string {
  if (
    status === InvestigationStatus.RUNNING ||
    status === InvestigationStatus.ROOT_CAUSE ||
    status === InvestigationStatus.FIX_PROPOSED
  ) {
    return 'status-dot status-dot--running';
  }
  if (status === InvestigationStatus.COMPLETE) return 'status-dot status-dot--complete';
  if (status === InvestigationStatus.FAILED)   return 'status-dot status-dot--failed';
  return 'status-dot';
}

export default function App() {
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [investigationStatus, setInvestigationStatus] = useState<string>('');
  const [agents, setAgents] = useState<Record<string, AgentResult>>(initialAgents());
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('api-db-connection-failure');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixDecision, setFixDecision] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [showIncidentInput, setShowIncidentInput] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const isActive = investigationStatus === InvestigationStatus.RUNNING
    || investigationStatus === InvestigationStatus.ROOT_CAUSE
    || investigationStatus === InvestigationStatus.FIX_PROPOSED;

  useEffect(() => {
    listDemoScenarios()
      .then(setScenarios)
      .catch(() => {
        setScenarios([
          {
            id: 'api-db-connection-failure',
            title: 'API Database Connection Failure',
            description: 'DB connection pool exhausted',
            severity: 'CRITICAL',
          },
          {
            id: 'memory-oom-kill',
            title: 'Memory OOM Kill',
            description: 'Order service OOM killed',
            severity: 'HIGH',
          },
          {
            id: 'tls-certificate-expiry',
            title: 'TLS Certificate Expiry',
            description: 'Expired ingress certificate',
            severity: 'HIGH',
          },
        ]);
      });
  }, []);

  const resetRunState = useCallback(() => {
    setAgents(initialAgents());
    setResults(EMPTY_RESULTS);
    setSelectedAgent(null);
    setFixDecision('pending');
    setInvestigationStatus('PENDING');
    setError(null);
  }, []);

  const applyInvestigationUpdate = useCallback((d: InvestigationUpdatePayload) => {
    setInvestigationStatus(d.status);
    setResults(prev => ({
      root_cause: d.root_cause ?? prev.root_cause,
      confidence: d.confidence ?? prev.confidence,
      severity: d.severity ?? prev.severity,
      affected_component: d.affected_component ?? prev.affected_component,
      contributing_evidence: d.contributing_evidence ?? prev.contributing_evidence,
      proposed_fix: d.proposed_fix ?? prev.proposed_fix,
      proposed_fix_diff: d.proposed_fix_diff ?? prev.proposed_fix_diff,
      fix_steps: d.fix_steps ?? prev.fix_steps,
      verification_result: d.verification_result ?? prev.verification_result,
      verification_checks: d.verification_checks ?? prev.verification_checks,
    }));
  }, []);

  const connectSSE = useCallback((invId: string) => {
    esRef.current?.close();
    const es = new EventSource(streamUrl(invId));
    esRef.current = es;

    es.onmessage = (evt: MessageEvent<string>) => {
      if (!evt.data || evt.data.startsWith(':')) return;
      let parsed: { type: string; data: unknown };
      try {
        parsed = JSON.parse(evt.data) as { type: string; data: unknown };
      } catch {
        return;
      }

      if (parsed.type === 'agent_update') {
        const d = parsed.data as AgentUpdatePayload;
        setAgents(prev => ({
          ...prev,
          [d.agent]: {
            ...(prev[d.agent] ?? {
              agent_name: d.agent,
              findings: [],
              evidence: {},
              started_at: null,
              completed_at: null,
            }),
            status: d.status,
            findings: d.findings ?? prev[d.agent]?.findings ?? [],
            evidence: d.evidence ?? prev[d.agent]?.evidence ?? {},
            current_task: d.current_task,
            duration_ms: d.duration_ms,
          },
        }));
      } else if (parsed.type === 'investigation_update') {
        applyInvestigationUpdate(parsed.data as InvestigationUpdatePayload);
      } else if (parsed.type === 'complete') {
        const d = parsed.data as CompletePayload;
        setInvestigationStatus('COMPLETE');
        setResults({
          root_cause: d.root_cause,
          confidence: d.confidence ?? null,
          severity: d.severity ?? null,
          affected_component: d.affected_component ?? null,
          contributing_evidence: d.contributing_evidence ?? [],
          proposed_fix: d.proposed_fix,
          proposed_fix_diff: d.proposed_fix_diff ?? null,
          fix_steps: d.fix_steps ?? [],
          verification_result: d.verification_result,
          verification_checks: d.verification_checks ?? [],
        });
        es.close();
      }
    };

    es.onerror = () => { es.close(); };
  }, [applyInvestigationUpdate]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const loadInvestigation = useCallback(async (invId: string) => {
    resetRunState();
    setInvestigationId(invId);
    try {
      const state = await getInvestigation(invId);
      setInvestigationStatus(state.status);
      const mergedAgents = initialAgents();
      for (const [name, agent] of Object.entries(state.agents)) {
        if (SCOUT_AGENTS.includes(name)) {
          mergedAgents[name] = agent;
        }
      }
      setAgents(mergedAgents);
      setResults({
        root_cause: state.root_cause,
        confidence: state.confidence,
        severity: state.severity,
        affected_component: state.affected_component,
        contributing_evidence: state.contributing_evidence ?? [],
        proposed_fix: state.proposed_fix,
        proposed_fix_diff: state.proposed_fix_diff,
        fix_steps: state.fix_steps ?? [],
        verification_result: state.verification_result,
        verification_checks: state.verification_checks ?? [],
      });
      if (state.status === InvestigationStatus.RUNNING
        || state.status === InvestigationStatus.ROOT_CAUSE
        || state.status === InvestigationStatus.FIX_PROPOSED) {
        connectSSE(invId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investigation');
    }
  }, [connectSSE, resetRunState]);

  const handleRunDemo = useCallback(async () => {
    setError(null);
    setIsStarting(true);
    resetRunState();

    const scenario = scenarios.find(s => s.id === selectedScenarioId);
    const title = scenario?.title ?? 'API Database Connection Failure';

    try {
      const created = await startInvestigation(title);
      setInvestigationId(created.investigation_id);
      await runDemo(created.investigation_id, selectedScenarioId);
      setInvestigationStatus('RUNNING');
      connectSSE(created.investigation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start investigation');
      setInvestigationStatus('FAILED');
    } finally {
      setIsStarting(false);
    }
  }, [connectSSE, resetRunState, scenarios, selectedScenarioId]);

  const handleInvestigationStarted = useCallback((invId: string) => {
    setShowIncidentInput(false);
    resetRunState();
    setInvestigationId(invId);
    setInvestigationStatus('RUNNING');
    connectSSE(invId);
  }, [connectSSE, resetRunState]);

  const agentStates: Record<string, AgentStatus> = {};
  for (const [name, agent] of Object.entries(agents)) {
    agentStates[name] = agent.status;
  }

  const isResolved = investigationStatus === 'COMPLETE';
  const neverRun = investigationStatus === '';
  const statusLabel = investigationStatusLabel(investigationStatus);
  const selectedAgentData = selectedAgent ? agents[selectedAgent] : null;

  const buttonLabel = isStarting ? 'Starting…'
    : isActive ? 'Running…'
    : isResolved ? 'Run Again'
    : 'Run Demo';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__logo" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="2.25" fill="currentColor" />
            <path
              d="M10 2v3M10 15v3M2 10h3M15 10h3M4.22 4.22l2.12 2.12M13.66 13.66l2.12 2.12M4.22 15.78l2.12-2.12M13.66 6.34l2.12-2.12"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            <path
              d="M6.5 6.5c2-1.5 5-1.5 7 0M6.5 13.5c2 1.5 5 1.5 7 0"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="app-header__brand">
          <h1 className="app-header__title">
            Spider<span>-Sense</span>
          </h1>
        </div>
        <span className="app-header__divider" aria-hidden="true" />
        <span className="app-header__subtitle">Agentic Incident Response</span>
        <div className="app-header__meta">
          <span className="app-header__badge">v3</span>
        </div>
      </header>

      <div className="app-shell">
        <InvestigationHistory
          selectedId={investigationId}
          onSelect={loadInvestigation}
        />

        <main className="app-main">
          <div className="control-bar">
            <select
              className="scenario-select"
              value={selectedScenarioId}
              onChange={e => setSelectedScenarioId(e.target.value)}
              disabled={isActive || isStarting}
              aria-label="Demo scenario"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>

            <button
              className="btn-run"
              onClick={handleRunDemo}
              disabled={isActive || isStarting}
              aria-busy={isActive}
            >
              {buttonLabel}
            </button>

            <button
              className="btn-secondary"
              onClick={() => setShowIncidentInput(v => !v)}
              disabled={isActive || isStarting}
            >
              {showIncidentInput ? 'Hide Incident Form' : 'Custom Incident'}
            </button>

            {statusLabel && (
              <div className="status-badge">
                <span className={statusDotClass(investigationStatus)} aria-hidden="true" />
                {statusLabel}
              </div>
            )}

            {error && (
              <span className="control-bar__error" role="alert">{error}</span>
            )}
          </div>

          {showIncidentInput && (
            <IncidentInput
              onInvestigationStarted={handleInvestigationStarted}
              disabled={isActive || isStarting}
            />
          )}

          <section className="graph-panel" aria-label="Pipeline visualization">
            <div className="panel-title">Pipeline</div>
            <OrchestrationGraph
              agentStates={agentStates}
              investigationStatus={investigationStatus}
              selectedAgent={selectedAgent}
              onAgentClick={setSelectedAgent}
            />
          </section>

          <section aria-label="Agent status">
            <div className="panel-title">Scouts</div>
            <div className="agents-grid">
              {SCOUT_AGENTS.map(name => (
                <AgentCard key={name} name={name} agent={agents[name]} />
              ))}
            </div>
          </section>

          {selectedAgentData && (
            <EvidenceExplorer
              agentName={selectedAgent!}
              findings={selectedAgentData.findings}
              evidence={selectedAgentData.evidence}
            />
          )}

          <ResultsPanels
            state={results}
            onFixApprove={() => setFixDecision('approved')}
            onFixReject={() => setFixDecision('rejected')}
          />

          {fixDecision === 'approved' && (
            <div className="fix-decision fix-decision--approved" role="status">
              Fix approved — preview only; no files were modified.
            </div>
          )}
          {fixDecision === 'rejected' && (
            <div className="fix-decision fix-decision--rejected" role="status">
              Fix rejected — investigation results preserved for review.
            </div>
          )}

          {isResolved && (
            <div className="resolved-banner" role="status">
              <span className="resolved-banner__icon" aria-hidden="true" />
              <div>
                <div className="resolved-banner__title">Incident Resolved</div>
                <div className="resolved-banner__sub">
                  Investigation complete · Select a scenario and click <strong>Run Demo</strong> to replay
                </div>
              </div>
            </div>
          )}

          {neverRun && !showIncidentInput && (
            <div className="empty-state">
              Choose a demo scenario or paste a custom incident to start the agentic investigation pipeline.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
