/**
 * EvidenceExplorer — drill-down panel for agent findings and structured evidence.
 *
 * Renders a summary chip row for scalar metrics and an expandable tree for
 * nested objects / arrays collected by each scout agent.
 */

import { useState } from 'react';
import './EvidenceExplorer.css';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface EvidenceExplorerProps {
  agentName: string;
  findings: string[];
  evidence: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  'Log Scout':      '📋',
  'Code Hunter':    '🔍',
  'Infra Scout':    '🏗️',
  'Security Scout': '🔒',
  'Root Cause':     '🧠',
  'Fix':            '🔧',
  'Verification':   '✅',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  );
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface EvidenceNodeProps {
  label: string;
  value: unknown;
  depth?: number;
}

function EvidenceNode({ label, value, depth = 0 }: EvidenceNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const type = valueType(value);
  const isExpandable = type === 'object' || type === 'array';

  if (!isExpandable) {
    return (
      <div className="evidence-node evidence-node--leaf" style={{ paddingLeft: depth * 14 }}>
        <span className="evidence-node__key">{formatKey(label)}</span>
        <span className={`evidence-node__value evidence-node__value--${type}`}>
          {formatScalar(value as string | number | boolean | null)}
        </span>
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value as Record<string, unknown>);

  const preview = Array.isArray(value)
    ? `${value.length} item${value.length === 1 ? '' : 's'}`
    : `${entries.length} field${entries.length === 1 ? '' : 's'}`;

  return (
    <div className="evidence-node evidence-node--branch" style={{ paddingLeft: depth * 14 }}>
      <button
        type="button"
        className="evidence-node__toggle"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
      >
        <span className={`evidence-node__chevron${expanded ? ' evidence-node__chevron--open' : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className="evidence-node__key">{formatKey(label)}</span>
        <span className="evidence-node__preview">{preview}</span>
      </button>

      {expanded && (
        <div className="evidence-node__children">
          {entries.length === 0 ? (
            <div className="evidence-node__empty">Empty {type}</div>
          ) : (
            entries.map(([childKey, childValue]) => (
              <EvidenceNode
                key={childKey}
                label={childKey}
                value={childValue}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function EvidenceExplorer({
  agentName,
  findings,
  evidence,
}: EvidenceExplorerProps) {
  const evidenceEntries = Object.entries(evidence);
  const scalarEntries = evidenceEntries.filter(([, v]) => isScalar(v));
  const complexEntries = evidenceEntries.filter(([, v]) => !isScalar(v));
  const icon = AGENT_ICONS[agentName] ?? '🤖';

  return (
    <section
      className="evidence-explorer"
      aria-label={`${agentName} evidence`}
    >
      <header className="evidence-explorer__header">
        <span className="evidence-explorer__icon" aria-hidden="true">{icon}</span>
        <h3 className="evidence-explorer__title">{agentName}</h3>
        <span className="evidence-explorer__count">
          {findings.length} finding{findings.length === 1 ? '' : 's'}
          {' · '}
          {evidenceEntries.length} metric{evidenceEntries.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="evidence-explorer__body">
        <div className="evidence-explorer__section">
          <h4 className="evidence-explorer__section-title">Findings</h4>
          {findings.length > 0 ? (
            <ul className="evidence-explorer__findings">
              {findings.map((finding, i) => (
                <li key={i} className="evidence-explorer__finding">{finding}</li>
              ))}
            </ul>
          ) : (
            <p className="evidence-explorer__empty">No findings recorded.</p>
          )}
        </div>

        <div className="evidence-explorer__section">
          <h4 className="evidence-explorer__section-title">Evidence</h4>

          {evidenceEntries.length === 0 ? (
            <p className="evidence-explorer__empty">No evidence collected yet.</p>
          ) : (
            <>
              {scalarEntries.length > 0 && (
                <div className="evidence-explorer__chips" role="list">
                  {scalarEntries.map(([key, value]) => (
                    <div key={key} className="evidence-chip" role="listitem">
                      <span className="evidence-chip__key">{formatKey(key)}</span>
                      <span className="evidence-chip__value">
                        {formatScalar(value as string | number | boolean | null)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {complexEntries.length > 0 && (
                <div className="evidence-explorer__tree">
                  {complexEntries.map(([key, value]) => (
                    <EvidenceNode key={key} label={key} value={value} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
