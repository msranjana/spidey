/**
 * InvestigationHistory — DevTools-style sidebar for past investigations.
 *
 * Fetches GET /api/investigations and refreshes periodically so new runs
 * started elsewhere in the UI appear without a manual reload.
 */

import { useCallback, useEffect, useState } from 'react';
import { listInvestigations } from '../api';
import { InvestigationStatus, type InvestigationSummary } from '../types';
import './InvestigationHistory.css';

const REFRESH_MS = 5000;
const SELECT_EVENT = 'spidy:investigation-select';

interface InvestigationHistoryProps {
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function statusLabel(status: InvestigationStatus): string {
  switch (status) {
    case InvestigationStatus.PENDING:
      return 'Pending';
    case InvestigationStatus.RUNNING:
      return 'Running';
    case InvestigationStatus.COMPLETE:
      return 'Complete';
    case InvestigationStatus.FAILED:
      return 'Failed';
    default:
      return status;
  }
}

function statusChipClass(status: InvestigationStatus): string {
  switch (status) {
    case InvestigationStatus.RUNNING:
      return 'history-chip--running';
    case InvestigationStatus.COMPLETE:
      return 'history-chip--complete';
    case InvestigationStatus.FAILED:
      return 'history-chip--failed';
    default:
      return 'history-chip--pending';
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function reopenInvestigation(id: string, onSelect?: (id: string) => void) {
  onSelect?.(id);
  window.dispatchEvent(
    new CustomEvent(SELECT_EVENT, { detail: { id } }),
  );
}

export default function InvestigationHistory({
  selectedId = null,
  onSelect,
}: InvestigationHistoryProps) {
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const items = await listInvestigations();
      setInvestigations(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const count = investigations.length;

  return (
    <aside className="investigation-history" aria-label="Investigation history">
      <div className="investigation-history__header">
        <div className="investigation-history__heading">
          <h2 className="investigation-history__title">Investigations</h2>
          {count > 0 && (
            <span className="investigation-history__count" aria-label={`${count} investigations`}>
              {count}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`investigation-history__refresh${refreshing ? ' investigation-history__refresh--spin' : ''}`}
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh investigation history"
        >
          ↻
        </button>
      </div>

      {error && (
        <p className="investigation-history__error" role="alert">
          {error}
        </p>
      )}

      {loading && investigations.length === 0 ? (
        <ul className="investigation-history__list investigation-history__list--skeleton" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="history-skeleton" />
          ))}
        </ul>
      ) : investigations.length === 0 ? (
        <p className="investigation-history__empty">
          No investigations yet.
          <span className="investigation-history__empty-hint">Run a demo to start one.</span>
        </p>
      ) : (
        <ul className="investigation-history__list">
          {investigations.map((inv) => {
            const isSelected = selectedId === inv.id;
            return (
              <li
                key={inv.id}
                className={`history-item${isSelected ? ' history-item--selected' : ''}`}
              >
                <button
                  type="button"
                  className="history-item__body"
                  onClick={() => reopenInvestigation(inv.id, onSelect)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="history-item__row history-item__row--title">
                    <span className="history-item__title">{inv.title}</span>
                    <span
                      className={`history-chip ${statusChipClass(inv.status)}`}
                      title={statusLabel(inv.status)}
                    >
                      {inv.status === InvestigationStatus.RUNNING && (
                        <span className="history-chip__dot" aria-hidden="true" />
                      )}
                      {statusLabel(inv.status)}
                    </span>
                  </span>
                  <span className="history-item__row history-item__row--meta">
                    <span className="history-item__id" title={inv.id}>
                      {shortId(inv.id)}
                    </span>
                    <time
                      className="history-item__time"
                      dateTime={inv.created_at}
                      title={formatAbsolute(inv.created_at)}
                    >
                      {formatRelative(inv.created_at)}
                    </time>
                  </span>
                </button>
                <button
                  type="button"
                  className="history-item__reopen"
                  onClick={() => reopenInvestigation(inv.id, onSelect)}
                  aria-label={`Reopen ${inv.title}`}
                  title="Reopen investigation"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
