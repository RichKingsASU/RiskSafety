// packages/fmcsa-adapter/src/index.ts
// FMCSA ADAPTER LAYER — the ONLY place raw FMCSA (MOTUS/QCMobile/DataHub/SMS)
// fields map to the internal RSOS schema. A MOTUS schema change must be a
// one-file edit here; never hard-wire legacy SAFER screens elsewhere (CLAUDE.md).
//
// STATUS: interface stub (Phase 0 scaffold). The full mapping, QCMobile client,
// and degraded-mode handling land in Phase 3 and depend on the field dictionary
// in docs/Forrest_RSOS_Project_Documentation.md (not yet available in-repo).
//
// Non-negotiable behavior to implement in Phase 3:
//   * On FMCSA failure: reuse the last snapshot and set integrations.status='degraded'.
//   * NEVER auto-approve on degraded/stale data.
//   * Persist a payload_hash on every snapshot for integrity.

export type SnapshotSource = 'qcmobile' | 'datahub' | 'sms';

/** Raw provider payload — shape is provider-specific and intentionally opaque here. */
export type RawFmcsaPayload = Record<string, unknown>;

/** Internal, schema-aligned carrier fields the rest of RSOS consumes. */
export interface NormalizedCarrierSnapshot {
  dot_number: string;
  mc_number?: string;
  legal_name: string;
  authority_status: 'active' | 'inactive' | 'revoked' | 'pending';
  safety_rating: 'satisfactory' | 'conditional' | 'unsatisfactory' | 'unrated';
  power_unit_count?: number;
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
