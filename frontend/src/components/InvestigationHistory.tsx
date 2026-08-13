/**
 * InvestigationHistory — sidebar listing past investigations.
 *
 * Fetches GET /api/investigations and refreshes periodically so new runs
 * started elsewhere in the UI appear without a manual reload.
 */

import { useCallback, useEffect, useState } from 'react';
import { listInvestigations } from '../api';
import { InvestigationStatus, type InvestigationSummary } from '../types';
import './InvestigationHistory.css';

const REFRESH_MS = 5000;

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

function statusClass(status: InvestigationStatus): string {
  switch (status) {
    case InvestigationStatus.RUNNING:
      return 'history-item__status--running';
    case InvestigationStatus.COMPLETE:
      return 'history-item__status--complete';
    case InvestigationStatus.FAILED:
      return 'history-item__status--failed';
    default:
      return 'history-item__status--pending';
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InvestigationHistory({
  selectedId = null,
  onSelect,
}: InvestigationHistoryProps) {
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await listInvestigations();
      setInvestigations(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <aside className="investigation-history" aria-label="Investigation history">
      <div className="investigation-history__header">
        <h2 className="investigation-history__title">History</h2>
        <button
          type="button"
          className="investigation-history__refresh"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
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
        <p className="investigation-history__empty">Loading…</p>
      ) : investigations.length === 0 ? (
        <p className="investigation-history__empty">
          No investigations yet. Run a demo to start one.
        </p>
      ) : (
        <ul className="investigation-history__list">
          {investigations.map((inv) => {
            const isSelected = selectedId === inv.id;
            return (
              <li key={inv.id}>
                <button
                  type="button"
                  className={`history-item${isSelected ? ' history-item--selected' : ''}`}
                  onClick={() => onSelect?.(inv.id)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="history-item__title">{inv.title}</span>
                  <span className="history-item__meta">
                    <span className={`history-item__status ${statusClass(inv.status)}`}>
                      {statusLabel(inv.status)}
                    </span>
                    <span className="history-item__time">{formatWhen(inv.created_at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
