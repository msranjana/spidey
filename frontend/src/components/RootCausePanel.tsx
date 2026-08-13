import type { ContributingEvidence } from '../types';
import './ResultsPanels.css';

export interface RootCausePanelProps {
  rootCause: string;
  confidence?: number | null;
  severity?: string | null;
  affectedComponent?: string | null;
  contributingEvidence?: ContributingEvidence[];
}

function confidenceTier(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'medium';
  return 'low';
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function RootCausePanel({
  rootCause,
  confidence,
  severity,
  affectedComponent,
  contributingEvidence = [],
}: RootCausePanelProps) {
  const tier = confidence != null ? confidenceTier(confidence) : null;

  return (
    <div className="result-panel result-panel--root-cause" role="region" aria-label="Root cause analysis">
      <div className="result-panel__label result-panel__label--root-cause">Root Cause</div>

      <div className="root-cause-meta">
        {severity && (
          <span
            className={`severity-badge severity-badge--${severity.toLowerCase()}`}
            aria-label={`Severity: ${severity}`}
          >
            {severity}
          </span>
        )}
        {affectedComponent && (
          <span className="affected-component">
            Affected: <strong>{affectedComponent}</strong>
          </span>
        )}
      </div>

      {confidence != null && (
        <div className="confidence-bar" aria-label={`Confidence: ${formatConfidence(confidence)}`}>
          <div className="confidence-bar__header">
            <span>Confidence</span>
            <span>{formatConfidence(confidence)}</span>
          </div>
          <div className="confidence-bar__track">
            <div
              className={`confidence-bar__fill confidence-bar__fill--${tier}`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
        </div>
      )}

      <p className="root-cause-text">{rootCause}</p>

      {contributingEvidence.length > 0 && (
        <ul className="contributing-evidence" aria-label="Contributing evidence">
          {contributingEvidence.map((item, i) => (
            <li key={i} className="contributing-evidence__item">
              <span className="contributing-evidence__source">{item.source}</span>
              {' — '}
              {item.finding}
              <span className="contributing-evidence__relevance">
                ({Math.round(item.relevance * 100)}% relevance)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
