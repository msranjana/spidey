import { AgentStatus, type AgentResult } from '../types';
import './AgentCard.css';

export const AGENT_ICONS: Record<string, string> = {
  'Log Scout': 'LS',
  'Code Hunter': 'CH',
  'Infra Scout': 'IS',
  'Security Scout': 'SS',
};

export interface AgentCardProps {
  name: string;
  agent: AgentResult;
}

const MAX_VISIBLE_FINDINGS = 3;

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function idleText(status: AgentStatus): string {
  if (status === AgentStatus.IDLE) return 'Waiting to start…';
  if (status === AgentStatus.RUNNING) return 'Investigating…';
  return 'No findings';
}

export default function AgentCard({ name, agent }: AgentCardProps) {
  const statusLower = agent.status.toLowerCase();
  const hasTask = Boolean(agent.current_task?.trim());
  const showTask = agent.status === AgentStatus.RUNNING && hasTask;
  const showDuration =
    agent.duration_ms != null &&
    agent.duration_ms > 0 &&
    agent.status !== AgentStatus.IDLE;
  const findings = agent.findings ?? [];
  const visibleFindings = findings.slice(0, MAX_VISIBLE_FINDINGS);
  const hiddenCount = findings.length - visibleFindings.length;

  return (
    <div
      className={`agent-card agent-card--${statusLower}`}
      role="article"
      aria-label={name}
    >
      <div className="agent-card__header">
        <div className="agent-card__icon" aria-hidden="true">
          {AGENT_ICONS[name] ?? 'AG'}
        </div>
        <div className="agent-card__title">
          <span className="agent-card__name">{name}</span>
          {showDuration && (
            <span className="agent-card__duration" title="Elapsed time">
              {formatDuration(agent.duration_ms!)}
            </span>
          )}
        </div>
        <span className={`agent-card__status agent-card__status--${statusLower}`}>
          {agent.status}
        </span>
      </div>

      {showTask && (
        <div className="agent-card__task-row" aria-live="polite">
          <span className="agent-card__label">Task</span>
          <span className="agent-card__task">{agent.current_task}</span>
        </div>
      )}

      <div className="agent-card__findings-section">
        <div className="agent-card__findings-header">
          <span className="agent-card__label">Findings</span>
          {findings.length > 0 && (
            <span className="agent-card__findings-count">{findings.length}</span>
          )}
        </div>

        <div className="agent-card__findings">
          {findings.length > 0 ? (
            <>
              {visibleFindings.map((finding, index) => (
                <div
                  key={`${index}-${finding.slice(0, 24)}`}
                  className="agent-card__finding agent-card__finding--live"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {finding}
                </div>
              ))}
              {hiddenCount > 0 && (
                <span className="agent-card__findings-more">
                  +{hiddenCount} more
                </span>
              )}
            </>
          ) : (
            <span className="agent-card__idle-text">{idleText(agent.status)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
