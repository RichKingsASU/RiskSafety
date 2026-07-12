// packages/shared/src/governance-config.ts
// Typed, PURE reader over the effective-dated governance_config rows (see
// supabase/migrations/0006_governance_config.sql). No DB dependency: a caller
// fetches the rows (server-side, as of a decision's timestamp) and passes them
// in; this module resolves the active row and derives the governance flags.
//
// EMPTY config -> flags equal today's code-constant behavior byte-for-byte:
//   dispatch bands provisional, Blue Wire disabled, no weights. No value is ever
//   invented here — unset means null/false, never a guessed number (CLAUDE.md #1/#4,
//   check-guardrails #7). The canonical scoring formula (packages/scoring) is not
//   touched by this layer.

/** The two pending-decision config keys stored in governance_config. */
export type GovernanceConfigKey = 'dispatch_thresholds' | 'blue_wire_weights';

/** One governance_config row (mirrors the table; timestamps as ISO strings). */
export interface GovernanceConfigRow {
  config_key: GovernanceConfigKey;
  /** Payload shape depends on config_key; see the typed getters below. */
  value: unknown;
  enabled: boolean;
  /** ISO-8601 timestamp (timestamptz). */
  effective_from: string;
}

/** dispatch_thresholds value shape (Q1). */
export interface DispatchThresholds {
  green_min: number;
  yellow_min: number;
}

/** blue_wire_weights value shape (Q2): signal name -> non-negative weight. */
export type BlueWireWeights = Readonly<Record<string, number>>;

const toMillis = (t: Date | string): number =>
  typeof t === 'string' ? Date.parse(t) : t.getTime();

/**
 * Active config for a key AS OF a timestamp: the row with the greatest
 * effective_from <= asOf. Returns null when none applies (empty config, or every
 * row is future-dated). Reading as-of the decision time — not "now" — is the audit
 * property: a past decision must resolve the thresholds that were in force then.
 */
export function configActiveAsOf(
  rows: readonly GovernanceConfigRow[],
  key: GovernanceConfigKey,
  asOf: Date | string,
): GovernanceConfigRow | null {
  const ts = toMillis(asOf);
  let best: GovernanceConfigRow | null = null;
  let bestT = -Infinity;
  for (const r of rows) {
    if (r.config_key !== key) continue;
    const t = toMillis(r.effective_from);
    if (t <= ts && t > bestT) {
      best = r;
      bestT = t;
    }
  }
  return best;
}

/**
 * Dispatch bands are PROVISIONAL while no dispatch_thresholds config is active as
 * of the given time (Q1 unratified). Empty config -> true (today's behavior).
 */
export function dispatchBandsProvisional(
  rows: readonly GovernanceConfigRow[],
  asOf: Date | string,
): boolean {
  return configActiveAsOf(rows, 'dispatch_thresholds', asOf) === null;
}

/**
 * Active dispatch thresholds as of a time, else null (never invented). Callers
 * that have no active row fall back to their existing code default — this layer
 * does not manufacture cutoffs.
 */
export function dispatchThresholds(
  rows: readonly GovernanceConfigRow[],
  asOf: Date | string,
): DispatchThresholds | null {
  const r = configActiveAsOf(rows, 'dispatch_thresholds', asOf);
  return r === null ? null : (r.value as DispatchThresholds);
}

/**
 * Blue Wire is ENABLED only when an active blue_wire_weights row exists AND is
 * explicitly enabled. Empty/disabled -> false (today's behavior).
 */
export function blueWireEnabled(
  rows: readonly GovernanceConfigRow[],
  asOf: Date | string,
): boolean {
  const r = configActiveAsOf(rows, 'blue_wire_weights', asOf);
  return r !== null && r.enabled === true;
}

/**
 * Active Blue Wire weights, else null. Null-equivalent until an active AND
 * explicitly-enabled weights row exists — a disabled row never yields weights, so
 * Blue Wire cannot contribute with unset/invented numbers.
 */
export function blueWireWeights(
  rows: readonly GovernanceConfigRow[],
  asOf: Date | string,
): BlueWireWeights | null {
  const r = configActiveAsOf(rows, 'blue_wire_weights', asOf);
  if (r === null || r.enabled !== true) return null;
  return r.value as BlueWireWeights;
}
