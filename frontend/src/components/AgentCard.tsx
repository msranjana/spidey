import { AgentStatus, type AgentResult } from '../types';
import './AgentCard.css';

export const AGENT_ICONS: Record<string, string> = {
  'Log Scout': '📋',
  'Code Hunter': '🔍',
  'Infra Scout': '🏗️',
  'Security Scout': '🔒',
};

export interface AgentCardProps {
  name: string;
  agent: AgentResult;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function idleText(status: AgentStatus): string {
  if (status === AgentStatus.IDLE) return 'Waiting to start…';
  if (status === AgentStatus.RUNNING) return 'Investigating…';
  return 'No findings';
}

export default function AgentCard({ name, agent }: AgentCardProps) {
  const statusLower = agent.status.toLowerCase();
  const showTask =
    agent.status === AgentStatus.RUNNING && Boolean(agent.current_task);
  const showDuration =
    agent.duration_ms != null &&
    agent.duration_ms > 0 &&
    agent.status !== AgentStatus.IDLE;

  return (
    <div
      className={`agent-card agent-card--${statusLower}`}
      role="article"
      aria-label={name}
    >
      <div className="agent-card__header">
        <div className="agent-card__icon" aria-hidden="true">
          {AGENT_ICONS[name] ?? '🤖'}
        </div>
        <span className="agent-card__name">{name}</span>
        <span className={`agent-card__status agent-card__status--${statusLower}`}>
          {agent.status}
        </span>
      </div>

      {(showTask || showDuration) && (
        <div className="agent-card__activity">
          {showTask && (
            <span className="agent-card__task" aria-live="polite">
              {agent.current_task}
            </span>
          )}
          {showDuration && (
            <span className="agent-card__duration">
              {formatDuration(agent.duration_ms!)}
            </span>
          )}
        </div>
      )}

      <div className="agent-card__findings">
        {agent.findings.length > 0 ? (
          agent.findings.map((finding, index) => (
            <div
              key={`${index}-${finding.slice(0, 24)}`}
              className="agent-card__finding agent-card__finding--live"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              {finding}
            </div>
          ))
        ) : (
          <span className="agent-card__idle-text">{idleText(agent.status)}</span>
        )}
      </div>
    </div>
  );
}
