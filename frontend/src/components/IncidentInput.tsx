import { useCallback, useState, type CSSProperties, type FormEvent } from 'react';
import { startCustomInvestigation } from '../api';
import type { StartInvestigationRequest } from '../types';

export interface IncidentInputProps {
  /** Called after POST /api/investigations succeeds. */
  onInvestigationStarted?: (investigationId: string) => void;
  disabled?: boolean;
}

const EMPTY_FORM: Required<StartInvestigationRequest> = {
  title: '',
  logs: '',
  stack_trace: '',
  config_snippet: '',
  code_snippet: '',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#94a3b8',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f1f5f9',
  fontSize: 14,
  fontFamily: 'inherit',
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.5,
};

export default function IncidentInput({
  onInvestigationStarted,
  disabled = false,
}: IncidentInputProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(
    (field: keyof StartInvestigationRequest, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);

      const payload: StartInvestigationRequest = {
        title: form.title.trim() || 'Untitled Investigation',
      };

      for (const key of ['logs', 'stack_trace', 'config_snippet', 'code_snippet'] as const) {
        const value = form[key].trim();
        if (value) {
          payload[key] = value;
        }
      }

      try {
        const response = await startCustomInvestigation(payload);
        onInvestigationStarted?.(response.investigation_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start investigation');
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, onInvestigationStarted],
  );

  const isBusy = disabled || isSubmitting;

  return (
    <section className="incident-input" aria-label="Incident input">
      <div className="incident-input__header">
        <h2 className="incident-input__title">Report an Incident</h2>
        <p className="incident-input__subtitle">
          Paste logs, stack traces, and snippets from your environment. All fields are optional
          except a title.
        </p>
      </div>

      <form className="incident-input__form" onSubmit={handleSubmit}>
        <div style={fieldStyle}>
          <label htmlFor="incident-title" style={labelStyle}>
            Title
          </label>
          <input
            id="incident-title"
            type="text"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g. API Database Connection Failure"
            disabled={isBusy}
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="incident-logs" style={labelStyle}>
            Logs
          </label>
          <textarea
            id="incident-logs"
            value={form.logs}
            onChange={(e) => updateField('logs', e.target.value)}
            placeholder="Paste application or system logs…"
            disabled={isBusy}
            style={textareaStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="incident-stack-trace" style={labelStyle}>
            Stack Trace
          </label>
          <textarea
            id="incident-stack-trace"
            value={form.stack_trace}
            onChange={(e) => updateField('stack_trace', e.target.value)}
            placeholder="Paste the exception stack trace…"
            disabled={isBusy}
            style={textareaStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="incident-config" style={labelStyle}>
            Config Snippet
          </label>
          <textarea
            id="incident-config"
            value={form.config_snippet}
            onChange={(e) => updateField('config_snippet', e.target.value)}
            placeholder="Relevant config (env vars, k8s manifest, etc.)…"
            disabled={isBusy}
            style={textareaStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="incident-code" style={labelStyle}>
            Code Snippet
          </label>
          <textarea
            id="incident-code"
            value={form.code_snippet}
            onChange={(e) => updateField('code_snippet', e.target.value)}
            placeholder="Relevant source code around the failure…"
            disabled={isBusy}
            style={textareaStyle}
          />
        </div>

        <div className="incident-input__actions">
          <button type="submit" className="btn-run" disabled={isBusy} aria-busy={isSubmitting}>
            {isSubmitting ? '⏳ Starting…' : '▶ Start Investigation'}
          </button>
          {error && (
            <span className="incident-input__error" role="alert">
              ⚠ {error}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
