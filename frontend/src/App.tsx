/**
 * App.tsx — Spider-Sense frontend root
 *
 * Sections:
 *  1. Header — branding
 *  2. Control bar — Run Demo button + status badge
 *  3. Pipeline graph — SVG orchestration visualization
 *  4. Agent cards — per-agent status + findings
 *  5. Results panel — root cause / fix / verification
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import OrchestrationGraph from './components/OrchestrationGraph';
import { AgentStatus } from './types';
import type {
  AgentUpdatePayload,
  InvestigationUpdatePayload,
  CompletePayload,
} from './types';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  'Log Scout':      '📋',
  'Code Hunter':    '🔍',
  'Infra Scout':    '🏗️',
  'Security Scout': '🔒',
};

const SCOUT_AGENTS = ['Log Scout', 'Code Hunter', 'Infra Scout', 'Security Scout'];

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AgentInfo {
  status: AgentStatus;
  findings: string[];
}

interface ResultsState {
  rootCause:          string | null;
  proposedFix:        string | null;
  verificationResult: string | null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function initialAgents(): Record<string, AgentInfo> {
  const rec: Record<string, AgentInfo> = {};
  for (const name of SCOUT_AGENTS) {
    rec[name] = { status: AgentStatus.IDLE, findings: [] };
  }
  return rec;
}

function investigationStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':      return 'Pending';
    case 'RUNNING':      return 'Running…';
    case 'root_cause':   return 'Identifying root cause…';
    case 'fix_proposed': return 'Applying fix…';
    case 'COMPLETE':     return 'Complete';
    case 'FAILED':       return 'Failed';
    default:             return '';
  }
}

function statusDotClass(status: string): string {
  if (status === 'RUNNING' || status === 'root_cause' || status === 'fix_proposed') return 'status-dot status-dot--running';
  if (status === 'COMPLETE') return 'status-dot status-dot--complete';
  if (status === 'FAILED')   return 'status-dot status-dot--failed';
  return 'status-dot';
}

// ─────────────────────────────────────────────
// AgentCard sub-component
// ─────────────────────────────────────────────

interface AgentCardProps {
  name: string;
  info: AgentInfo;
}

function AgentCard({ name, info }: AgentCardProps) {
  const statusLower = info.status.toLowerCase() as Lowercase<AgentStatus>;
  return (
    <div className={`agent-card agent-card--${statusLower}`} role="article" aria-label={name}>
      <div className="agent-card__header">
        <div className="agent-card__icon" aria-hidden="true">
          {AGENT_ICONS[name] ?? '🤖'}
        </div>
        <span className="agent-card__name">{name}</span>
        <span className={`agent-card__status agent-card__status--${statusLower}`}>
          {info.status}
        </span>
      </div>
      <div className="agent-card__findings">
        {info.findings.length > 0 ? (
          info.findings.map((f, i) => (
            <div key={i} className="agent-card__finding">{f}</div>
          ))
        ) : (
          <span className="agent-card__idle-text">
            {info.status === 'IDLE' ? 'Waiting to start…' : info.status === 'RUNNING' ? 'Investigating…' : 'No findings'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────

export default function App() {
  const [investigationId, setInvestigationId]     = useState<string | null>(null);
  const [investigationStatus, setInvestigationStatus] = useState<string>('');
  const [agents, setAgents]                       = useState<Record<string, AgentInfo>>(initialAgents());
  const [results, setResults]                     = useState<ResultsState>({ rootCause: null, proposedFix: null, verificationResult: null });
  const [isStarting, setIsStarting]               = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Derived: is a run active?
  const isActive = investigationStatus === 'RUNNING'
    || investigationStatus === 'root_cause'
    || investigationStatus === 'fix_proposed';

  // ── SSE handler ──────────────────────────────

  const connectSSE = useCallback((invId: string) => {
    if (esRef.current) {
      esRef.current.close();
    }
    const es = new EventSource(`/api/investigations/${invId}/stream`);
    esRef.current = es;

    es.onmessage = (evt) => {
      if (!evt.data || evt.data.startsWith(':')) return; // comment line
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
            status:   d.status,
            findings: d.findings ?? prev[d.agent]?.findings ?? [],
          },
        }));
      } else if (parsed.type === 'investigation_update') {
        const d = parsed.data as InvestigationUpdatePayload;
        setInvestigationStatus(d.status);
        if (d.root_cause) {
          setResults(prev => ({ ...prev, rootCause: d.root_cause! }));
        }
        if (d.proposed_fix) {
          setResults(prev => ({ ...prev, proposedFix: d.proposed_fix! }));
        }
        if (d.verification_result) {
          setResults(prev => ({ ...prev, verificationResult: d.verification_result! }));
        }
      } else if (parsed.type === 'complete') {
        const d = parsed.data as CompletePayload;
        setInvestigationStatus('COMPLETE');
        setResults({
          rootCause:          d.root_cause,
          proposedFix:        d.proposed_fix,
          verificationResult: d.verification_result,
        });
        es.close();
      }
    };

    es.onerror = () => {
      // Stream ended or error — close silently
      es.close();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  // ── Run Demo ─────────────────────────────────

  const handleRunDemo = async () => {
    setError(null);
    setIsStarting(true);

    // Reset state
    setAgents(initialAgents());
    setResults({ rootCause: null, proposedFix: null, verificationResult: null });
    setInvestigationStatus('PENDING');

    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'API Database Connection Failure' }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = (await res.json()) as { investigation_id: string; status: string };
      setInvestigationId(json.investigation_id);
      setInvestigationStatus(json.status);
      connectSSE(json.investigation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start investigation');
      setInvestigationStatus('FAILED');
    } finally {
      setIsStarting(false);
    }
  };

  // ── Re-run demo (already have inv ID) ────────

  const handleRerun = async () => {
    if (!investigationId) { await handleRunDemo(); return; }
    setError(null);
    setAgents(initialAgents());
    setResults({ rootCause: null, proposedFix: null, verificationResult: null });
    setInvestigationStatus('PENDING');
    setIsStarting(true);
    try {
      const res = await fetch(`/api/investigations/${investigationId}/run-demo`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInvestigationStatus('RUNNING');
      connectSSE(investigationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-run');
      setInvestigationStatus('FAILED');
    } finally {
      setIsStarting(false);
    }
  };

  // ── Derived: agentStates map for graph ───────

  const agentStates: Record<string, AgentStatus> = {};
  for (const [name, info] of Object.entries(agents)) {
    agentStates[name] = info.status;
  }

  const isResolved = investigationStatus === 'COMPLETE';
  const statusLabel = investigationStatusLabel(investigationStatus);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <span className="app-header__spider" aria-hidden="true">🕷️</span>
        <h1 className="app-header__title">
          Spider<span>-Sense</span>
        </h1>
        <span className="app-header__subtitle">Agentic Incident Response</span>
      </header>

      <main className="app-main">
        {/* Control bar */}
        <div className="control-bar">
          <button
            className="btn-run"
            onClick={investigationStatus === '' || isResolved || investigationStatus === 'FAILED' ? handleRunDemo : handleRerun}
            disabled={isActive || isStarting}
            aria-busy={isActive}
          >
            {isStarting ? '⏳ Starting…' : isActive ? '⚡ Running…' : isResolved ? '🔄 Run Again' : '▶ Run Demo'}
          </button>

          {statusLabel && (
            <div className="status-badge">
              <span className={statusDotClass(investigationStatus)} aria-hidden="true" />
              {statusLabel}
            </div>
          )}

          {error && (
            <span style={{ fontSize: 12, color: 'var(--accent-red)' }} role="alert">
              ⚠ {error}
            </span>
          )}
        </div>

        {/* Pipeline graph */}
        <section className="graph-panel" aria-label="Pipeline visualization">
          <div className="panel-title">Pipeline</div>
          <OrchestrationGraph
            agentStates={agentStates}
            investigationStatus={investigationStatus}
          />
        </section>

        {/* Agent cards */}
        <section aria-label="Agent status">
          <div className="panel-title">Scouts</div>
          <div className="agents-grid">
            {SCOUT_AGENTS.map(name => (
              <AgentCard key={name} name={name} info={agents[name]} />
            ))}
          </div>
        </section>

        {/* Results */}
        {(results.rootCause || results.proposedFix || results.verificationResult) && (
          <section className="results-panel" aria-label="Investigation results">
            <div className="panel-title">Findings</div>

            {results.rootCause && (
              <div className="result-block result-block--root-cause">
                <div className="result-block__label result-block__label--root-cause">Root Cause</div>
                <p className="result-block__text">{results.rootCause}</p>
              </div>
            )}

            {results.proposedFix && (
              <div className="result-block result-block--fix">
                <div className="result-block__label result-block__label--fix">Proposed Fix</div>
                <p className="result-block__text">{results.proposedFix}</p>
              </div>
            )}

            {results.verificationResult && (
              <div className="result-block result-block--verification">
                <div className="result-block__label result-block__label--verification">Verification</div>
                <p className="result-block__text">{results.verificationResult}</p>
              </div>
            )}
          </section>
        )}

        {/* Resolved banner */}
        {isResolved && (
          <div className="resolved-banner" role="status">
            <span className="resolved-banner__icon" aria-hidden="true">✅</span>
            <div>
              <div className="resolved-banner__title">Incident Resolved</div>
              <div className="resolved-banner__sub">
                Investigation complete · Click <strong>Run Again</strong> to replay
              </div>
            </div>
          </div>
        )}

        {/* Empty state before first run */}
        {investigationStatus === '' && (
          <div className="empty-state">
            Click <strong>Run Demo</strong> to start the agentic investigation pipeline.
          </div>
        )}
      </main>
    </div>
  );
}
