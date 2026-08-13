import { useState } from 'react';
import './ResultsPanels.css';

export interface FixPreviewProps {
  proposedFix?: string | null;
  proposedFixDiff?: string | null;
  fixSteps?: string[];
  onApprove?: () => void;
  onReject?: () => void;
}

function classifyDiffLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'hdr';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <div className="diff-viewer" aria-label="Proposed fix diff">
      <pre>
        {lines.map((line, i) => (
          <span key={i} className={`diff-line--${classifyDiffLine(line)}`}>
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

export default function FixPreview({
  proposedFix,
  proposedFixDiff,
  fixSteps = [],
  onApprove,
  onReject,
}: FixPreviewProps) {
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  const handleApprove = () => {
    setDecision('approved');
    onApprove?.();
  };

  const handleReject = () => {
    setDecision('rejected');
    onReject?.();
  };

  const decided = decision !== null;

  return (
    <div className="result-panel result-panel--fix" role="region" aria-label="Proposed fix preview">
      <div className="result-panel__label result-panel__label--fix">Proposed Fix</div>

      {fixSteps.length > 0 && (
        <ol className="fix-steps" aria-label="Remediation steps">
          {fixSteps.map((step, i) => (
            <li key={i} className="fix-steps__item">{step}</li>
          ))}
        </ol>
      )}

      {proposedFixDiff && <DiffViewer diff={proposedFixDiff} />}

      {!proposedFixDiff && proposedFix && (
        <p className="root-cause-text">{proposedFix}</p>
      )}

      <div className="fix-actions">
        <button
          type="button"
          className="btn-approve"
          onClick={handleApprove}
          disabled={decided}
          aria-label="Approve proposed fix"
        >
          Approve
        </button>
        <button
          type="button"
          className="btn-reject"
          onClick={handleReject}
          disabled={decided}
          aria-label="Reject proposed fix"
        >
          Reject
        </button>
        <span className="fix-actions__note">Manual approval required — fix is never auto-applied</span>
      </div>

      {decision === 'approved' && (
        <p className="fix-decision fix-decision--approved" role="status">
          Fix approved — awaiting operator to apply changes
        </p>
      )}
      {decision === 'rejected' && (
        <p className="fix-decision fix-decision--rejected" role="status">
          Fix rejected — no changes will be applied
        </p>
      )}
    </div>
  );
}
