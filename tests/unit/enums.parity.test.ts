// tests/unit/enums.parity.test.ts
// Guardrail: the TypeScript enum mirror (@forrest/shared/enums) must stay in
// lockstep with the Postgres enums declared in the migrations. If someone adds a
// DB enum value without updating the shared dictionary (or vice-versa), this fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '@forrest/shared/enums';
import {
  AUTHORITY_STATUS, SAFETY_RATING, QUALITY_BAND, DISPATCH_BAND,
} from '@forrest/shared/enums';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const sql =
  readFileSync(migrationsDir + '0001_init.sql', 'utf8') +
  '\n' +
  readFileSync(migrationsDir + '0002_schema.sql', 'utf8');

/** Parse every `create type <name> as enum ('a','b',...);` from the migrations. */
function parseDbEnums(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /create\s+type\s+(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    const labels = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    out[name] = labels;
  }
  return out;
}

const dbEnums = parseDbEnums(sql);

// DB enum name -> the shared TS const array that must equal it.
const MAP: Record<string, readonly string[]> = {
  authority_status: AUTHORITY_STATUS,
  safety_rating: SAFETY_RATING,
  quality_band: QUALITY_BAND,
  dispatch_band: DISPATCH_BAND,
  carrier_status: E.CARRIER_STATUS,
  severity_level: E.SEVERITY_LEVEL,
  safety_event_type: E.SAFETY_EVENT_TYPE,
  severity_class: E.SEVERITY_CLASS,
  snapshot_source: E.SNAPSHOT_SOURCE,
  ab5_status: E.AB5_STATUS,
  qualification_status: E.QUALIFICATION_STATUS,
  equipment_status: E.EQUIPMENT_STATUS,
  policy_type: E.POLICY_TYPE,
  policy_source: E.POLICY_SOURCE,
  certificate_type: E.CERTIFICATE_TYPE,
  certificate_status: E.CERTIFICATE_STATUS,
  document_entity_type: E.DOCUMENT_ENTITY_TYPE,
  doc_type: E.DOC_TYPE,
  claim_type: E.CLAIM_TYPE,
  claim_status: E.CLAIM_STATUS,
  at_fault: E.AT_FAULT,
  incident_type: E.INCIDENT_TYPE,
  incident_status: E.INCIDENT_STATUS,
  task_type: E.TASK_TYPE,
  task_status: E.TASK_STATUS,
  value_tier: E.VALUE_TIER,
  load_check_result: E.LOAD_CHECK_RESULT,
  link_type: E.LINK_TYPE,
  remediation_decision: E.REMEDIATION_DECISION,
  fleet_event_type: E.FLEET_EVENT_TYPE,
  fleet_source: E.FLEET_SOURCE,
  integration_name: E.INTEGRATION_NAME,
  integration_auth_type: E.INTEGRATION_AUTH_TYPE,
  integration_status: E.INTEGRATION_STATUS,
  notification_type: E.NOTIFICATION_TYPE,
  notification_channel: E.NOTIFICATION_CHANNEL,
  notification_severity: E.NOTIFICATION_SEVERITY,
};

describe('DB enum ↔ TS enum parity', () => {
  it('parsed a reasonable number of DB enums from the migrations', () => {
    expect(Object.keys(dbEnums).length).toBeGreaterThanOrEqual(35);
  });

  for (const [dbName, tsArr] of Object.entries(MAP)) {
    it(`${dbName} matches its shared TS array (same labels, same order)`, () => {
      expect(dbEnums[dbName], `migration is missing enum ${dbName}`).toBeDefined();
      expect(tsArr).toEqual(dbEnums[dbName]);
    });
  }

  it('every DB enum has a TS mirror (no orphan DB enums)', () => {
    const unmapped = Object.keys(dbEnums).filter((n) => !(n in MAP));
    expect(unmapped, `DB enums without a TS mirror: ${unmapped.join(', ')}`).toEqual([]);
  });
});
