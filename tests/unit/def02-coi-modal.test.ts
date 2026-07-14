import { describe, it, expect } from 'vitest';
import { buildMockCarriers } from '../../apps/web/app/mockData';
import {
  canCommitCoiDecision,
  applyCoiDecision,
} from '../../apps/web/app/coiDecision';

/**
 * DEF-02 — COI Approve/Reject route through the shared confirm-with-reason
 * modal. This exercises the pure decision core behind that modal (the repo has
 * no jsdom/DOM test env): the rationale is required (commit disabled until a
 * reason is entered), approval is human-driven and never automatic, and every
 * commit writes an audit row.
 */
describe('DEF-02: COI confirm-with-reason decision core', () => {
  const carrier = buildMockCarriers()[0];
  const AT = '2026-07-13T12:00:00.000Z';

  it('commit is disabled until a non-empty rationale is entered', () => {
    // Mirrors the modal button: disabled={!canCommitCoiDecision(reason)}.
    expect(canCommitCoiDecision('')).toBe(false);
    expect(canCommitCoiDecision('   ')).toBe(false);
    expect(canCommitCoiDecision('COI verified against RMIS certificate')).toBe(true);
  });

  it('refuses to commit a decision without a reason (no auto-approve path)', () => {
    expect(() =>
      applyCoiDecision(carrier, { decision: 'approve', reason: '', actor: 'Tester', at: AT }),
    ).toThrow(/rationale/i);
  });

  it('approve clears the insurance hard gate and writes an audit row', () => {
    const { carrier: updated, auditLog } = applyCoiDecision(carrier, {
      decision: 'approve',
      reason: 'Auto/cargo limits meet minimums; certificate on file.',
      actor: 'Sam Ortiz (Safety Mgr)',
      at: AT,
    });

    expect(updated.gates.insurance_lapsed_or_below_min).toBe(false);
    expect(updated.coiOcr.review_status).toBe('approved');
    expect(updated.coiOcr.reviewed_by).toBe('Sam Ortiz (Safety Mgr)');
    expect(updated.coiOcr.rejection_reason).toBeUndefined();

    expect(auditLog.action_type).toBe('coi_ocr_review');
    expect(auditLog.performed_by).toBe('Sam Ortiz (Safety Mgr)');
    expect(auditLog.performed_at).toBe(AT);
    expect(auditLog.reason).toMatch(/minimums/);
  });

  it('reject forces the insurance gate (Red) and records the rejection reason', () => {
    const { carrier: updated, auditLog } = applyCoiDecision(carrier, {
      decision: 'reject',
      reason: 'Cargo limit below $100,000 minimum.',
      actor: 'Danica (Triage)',
      at: AT,
    });

    expect(updated.gates.insurance_lapsed_or_below_min).toBe(true);
    expect(updated.scoreResult.dispatch_band).toBe('red'); // hard gate forces red
    expect(updated.coiOcr.review_status).toBe('rejected');
    expect(updated.coiOcr.rejection_reason).toMatch(/below/);
    expect(auditLog.reason).toMatch(/below/);
  });

  it('is a no-op on the input (cancel = no side effects): source carrier is untouched', () => {
    const before = JSON.stringify(carrier);
    applyCoiDecision(carrier, { decision: 'approve', reason: 'x', actor: 'T', at: AT });
    // Never called on cancel; and even when called it returns a new object
    // rather than mutating — so a cancelled modal leaves state exactly as-is.
    expect(JSON.stringify(carrier)).toBe(before);
  });
});
