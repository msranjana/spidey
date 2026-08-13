import type { VerificationCheck } from '../types';
import './ResultsPanels.css';

export interface VerificationPanelProps {
  verificationResult?: string | null;
  verificationChecks?: VerificationCheck[];
}

function checkIcon(status: string): { symbol: string; className: string } {
  const normalized = status.toLowerCase();
  if (normalized === 'pass' || normalized === 'passed') {
    return { symbol: '✓', className: 'verification-check__icon--pass' };
  }
  if (normalized === 'fail' || normalized === 'failed') {
    return { symbol: '✗', className: 'verification-check__icon--fail' };
  }
  return { symbol: '!', className: 'verification-check__icon--warn' };
}

export default function VerificationPanel({
  verificationResult,
  verificationChecks = [],
}: VerificationPanelProps) {
  return (
    <div className="result-panel result-panel--verification" role="region" aria-label="Verification results">
      <div className="result-panel__label result-panel__label--verification">Verification</div>

      {verificationChecks.length > 0 ? (
        <ul className="verification-checklist" aria-label="Verification checks">
          {verificationChecks.map((check, i) => {
            const { symbol, className } = checkIcon(check.status);
            return (
              <li key={i} className="verification-check">
                <span
                  className={`verification-check__icon ${className}`}
                  aria-hidden="true"
                >
                  {symbol}
                </span>
                <div className="verification-check__body">
                  <div className="verification-check__name">{check.name}</div>
                  <div className="verification-check__message">{check.message}</div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : verificationResult ? (
        <p className="root-cause-text">{verificationResult}</p>
      ) : null}

      {verificationResult && verificationChecks.length > 0 && (
        <p className="verification-summary">{verificationResult}</p>
      )}
    </div>
  );
}
