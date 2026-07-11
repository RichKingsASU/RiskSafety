// packages/fmcsa-adapter/src/index.ts
// FMCSA ADAPTER LAYER — the ONLY place raw FMCSA (MOTUS/QCMobile/DataHub/SMS)
// fields map to the internal RSOS schema. A MOTUS schema change must be a
// one-file edit here; never hard-wire legacy SAFER screens elsewhere (CLAUDE.md).
//
// STATUS: interface stub (Phase 0 scaffold). The shape below is now aligned to the
// fmcsa_snapshots table dictionary (docs/Forrest_RSOS_Project_Documentation.md §4.13),
// which is in-repo. The concrete mapping, QCMobile client, and degraded-mode handling
// still land in Phase 3 and depend on the LIVE MOTUS field names.
//
// Non-negotiable behavior to implement in Phase 3:
//   * On FMCSA failure: reuse the last snapshot and set integrations.status='degraded'.
//   * NEVER auto-approve on degraded/stale data.
//   * Persist a payload_hash on every snapshot for integrity.

import type {
  SnapshotSource,
  AuthorityStatus,
  SafetyRating,
} from '@forrest/shared';

export type { SnapshotSource } from '@forrest/shared';

/** Raw provider payload — shape is provider-specific and intentionally opaque here. */
export type RawFmcsaPayload = Record<string, unknown>;

/** Internal, schema-aligned carrier fields the rest of RSOS consumes.
 *  Mirrors the persisted fmcsa_snapshots row (minus DB-managed id/timestamps). */
export interface NormalizedCarrierSnapshot {
  dot_number: string;
  mc_number?: string;
  legal_name: string;
  authority_status: AuthorityStatus;
  safety_rating: SafetyRating;
  power_unit_count?: number;
  /** Insurance shown here is the FMCSA *filing* (with lag), not the COI certificate. */
  insurance_on_file?: Record<string, number>;
  oos_rate?: number;
  /** Monthly SMS/BASIC percentiles when the source is 'sms'. */
  basic_scores?: Record<string, number>;
  snapshot_date: string; // ISO date
  source: SnapshotSource;
  payload_hash: string;
}

/**
 * Map a raw FMCSA payload to the internal snapshot shape.
 * TODO(Phase 3): implement against the MOTUS/QCMobile field dictionary. This is
 * the single mapping site — keep all field translation inside this function.
 */
export function normalizeCarrier(
  _raw: RawFmcsaPayload,
  _source: SnapshotSource,
): NormalizedCarrierSnapshot {
  throw new Error(
    'fmcsa-adapter.normalizeCarrier not implemented — Phase 3 (needs field dictionary).',
  );
}
