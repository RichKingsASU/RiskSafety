/**
 * COI (Certificate of Insurance) decision core (DEF-02).
 *
 * UAT found the "Approve COI Limits" / "Reject / Flag Below Min" actions firing
 * a native browser confirm()/alert() instead of the app's styled confirm-with-
 * reason modal used by "Place on DNU list" and "Clear Onboarding". The required
 * rationale was not visibly enforced and the native dialog briefly froze the page.
 *
 * The UI now routes both actions through the shared modal. This module holds the
 * pure decision logic behind that modal so the governance guarantees are testable
 * without a browser:
 *   - a rationale is REQUIRED (commit stays disabled until one is entered);
 *   - COI approval is human-in-the-loop and NEVER auto-approves — a state change
 *     only happens when a reviewer explicitly commits a decision with a reason;
 *   - every commit writes an immutable audit row (action, actor, reason, time).
 */
import { computeScore } from '@forrest/scoring';
import type { CarrierMockRecord, AuditLog } from './mockData';

export type CoiDecision = 'approve' | 'reject';

/**
 * Reason-guard for the modal's commit button — matches the existing DNU /
 * Clear-Onboarding pattern (`disabled={!dialogReason.trim()}`). Commit is
 * enabled only when a non-empty rationale has been entered.
 */
export const canCommitCoiDecision = (reason: string): boolean => reason.trim().length > 0;

export interface CoiCommit {
  decision: CoiDecision;
  reason: string;
  /** Display name of the human reviewer committing the decision. */
  actor: string;
  /** ISO timestamp of the commit (injected so the core stays deterministic). */
  at: string;
}

export interface CoiDecisionResult {
  carrier: CarrierMockRecord;
  auditLog: AuditLog;
}

/**
 * Apply an explicit, human-committed COI decision to a carrier.
 *
 * Throws if the rationale is empty — there is no code path that mutates COI
 * state without an explicit decision AND a reason, so nothing here can
 * auto-approve. Returns the updated carrier plus the audit row to append.
 */
export function applyCoiDecision(
  carrier: CarrierMockRecord,
  commit: CoiCommit,
): CoiDecisionResult {
  if (!canCommitCoiDecision(commit.reason)) {
    throw new Error('COI decision requires a non-empty rationale for the audit log.');
  }

  const approved = commit.decision === 'approve';

  const updatedGates = {
    ...carrier.gates,
    // Approve clears the insurance hard gate; reject forces it (Red).
    insurance_lapsed_or_below_min: !approved,
  };

  const updatedCarrier: CarrierMockRecord = {
    ...carrier,
    gates: updatedGates,
    scoreResult: computeScore(carrier.inputs, updatedGates),
    coiOcr: {
      ...carrier.coiOcr,
      review_status: approved ? 'approved' : 'rejected',
      reviewed_by: commit.actor,
      reviewed_at: commit.at,
      rejection_reason: approved ? undefined : commit.reason,
    },
  };

  const auditLog: AuditLog = {
    id: `a-coi-${commit.at}`,
    carrier_id: carrier.id,
    carrier_name: carrier.legal_name,
    action_type: 'coi_ocr_review',
    performed_by: commit.actor,
    performed_at: commit.at,
    details: approved
      ? 'Certificate of Insurance (COI) approved manually. Insurance hard gate set to PASS.'
      : 'Certificate of Insurance (COI) rejected manually. Insurance hard gate set to FAIL.',
    reason: commit.reason,
  };

  return { carrier: updatedCarrier, auditLog };
}
