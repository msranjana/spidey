import type { InvestigationState } from '../types';
import FixPreview from './FixPreview';
import RootCausePanel from './RootCausePanel';
import VerificationPanel from './VerificationPanel';
import './ResultsPanels.css';

export interface ResultsPanelsProps {
  state: Pick<
    InvestigationState,
    | 'root_cause'
    | 'confidence'
    | 'severity'
    | 'affected_component'
    | 'contributing_evidence'
    | 'proposed_fix'
    | 'proposed_fix_diff'
    | 'fix_steps'
    | 'verification_result'
    | 'verification_checks'
  >;
  onFixApprove?: () => void;
  onFixReject?: () => void;
}

export default function ResultsPanels({
  state,
  onFixApprove,
  onFixReject,
}: ResultsPanelsProps) {
  const hasRootCause = Boolean(state.root_cause);
  const hasFix =
    Boolean(state.proposed_fix) ||
    Boolean(state.proposed_fix_diff) ||
    state.fix_steps.length > 0;
  const hasVerification =
    Boolean(state.verification_result) || state.verification_checks.length > 0;

  if (!hasRootCause && !hasFix && !hasVerification) {
    return null;
  }

  return (
    <section className="results-panels" aria-label="Investigation results">
      {hasRootCause && state.root_cause && (
        <RootCausePanel
          rootCause={state.root_cause}
          confidence={state.confidence}
          severity={state.severity}
          affectedComponent={state.affected_component}
          contributingEvidence={state.contributing_evidence}
        />
      )}

      {hasFix && (
        <FixPreview
          proposedFix={state.proposed_fix}
          proposedFixDiff={state.proposed_fix_diff}
          fixSteps={state.fix_steps}
          onApprove={onFixApprove}
          onReject={onFixReject}
        />
      )}

      {hasVerification && (
        <VerificationPanel
          verificationResult={state.verification_result}
          verificationChecks={state.verification_checks}
        />
      )}
    </section>
  );
}
