// tests/unit/dispatch-block-dormancy.test.ts
//
// GOVERNANCE GUARANTEE (CLAUDE.md rule #4, Open Question Q15):
// Dispatch blocking ships DORMANT/advisory behind FEATURE_DISPATCH_BLOCK_ENFORCING
// (default false). RED / DNU are a strong recommendation and stored state — NOT a
// live block — until the team ratifies enforcing mode.
//
// Dormancy means more than "the switch is off": it means NO enforcement path is
// wired to the flag at all. This suite asserts:
//   1. the flag defaults off,
//   2. red / dnu are pure advisory computed state (the engine returns them as data,
//      it does not throw / block / reject on them),
//   3. no source file READS the flag to drive behavior (only its declaration
//      references it) — so wiring enforcement to the flag makes this suite fail
//      even if the flag itself is left "off".

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { FEATURE_FLAGS_DEFAULT } from '@forrest/shared/constants';
import { computeScore, type GateInputs, type ScoreInputs } from '@forrest/scoring';

const FLAG = 'FEATURE_DISPATCH_BLOCK_ENFORCING';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

// The one file allowed to name the flag: its declaration. This test file names it
// too (as string literals), so it is excluded from the scan.
const DECLARATION_FILE = join('packages', 'shared', 'src', 'constants.ts');
const THIS_FILE = relative(repoRoot, fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
const SCAN_EXTS = ['.ts', '.tsx', '.mjs', '.cjs', '.js'];

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(repoRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const rel = join(relative(repoRoot, entry.parentPath ?? entry.path), entry.name);
    if (rel.split(sep).some((seg) => SKIP_DIRS.has(seg))) continue;
    if (rel.includes('.generated.')) continue;
    if (!SCAN_EXTS.some((ext) => entry.name.endsWith(ext))) continue;
    out.push(rel);
  }
  return out;
}

describe('dispatch-block enforcement is dormant', () => {
  it('the flag defaults off', () => {
    expect(FEATURE_FLAGS_DEFAULT[FLAG]).toBe(false);
  });

  it('scans actual source files (sanity: the scan is not empty)', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain(DECLARATION_FILE);
  });

  it('no source file reads the flag to drive behavior — only its declaration names it', () => {
    const references = sourceFiles().filter((rel) => {
      if (rel === DECLARATION_FILE || rel === THIS_FILE) return false;
      return readFileSync(join(repoRoot, rel), 'utf8').includes(FLAG);
    });
    // If this fails, an enforcement (or any) path was wired to the flag. Dispatch
    // blocking must ship dormant: no live path may depend on this flag until Q15
    // is ratified. If a legitimate ADVISORY-DISPLAY read is later added, update
    // this test to assert that read gates display only — never a block/reject.
    expect(references).toEqual([]);
  });
});

describe('red / dnu are advisory computed state, not a live block', () => {
  const goodInputs: ScoreInputs = {
    fleet_size_score: 90,
    vehicle_oos_score: 90,
    driver_oos_score: 90,
    accident_rate_score: 90,
    confidence_modifier: 1,
  };
  const cleanGates: GateInputs = {
    authority_status: 'active',
    safety_rating: 'satisfactory',
    insurance_lapsed_or_below_min: false,
    on_dnu: false,
    confirmed_fraud: false,
    has_open_material_flag: false,
    is_thin_file: false,
  };

  it('a hard-gated carrier is scored to red without throwing / blocking', () => {
    // authority revoked is a hard gate -> forced red. The engine RETURNS this as
    // data; it never raises or rejects. Red is a recommendation, not an action.
    let result!: ReturnType<typeof computeScore>;
    expect(() => {
      result = computeScore(goodInputs, { ...cleanGates, authority_status: 'revoked' });
    }).not.toThrow();
    expect(result.dispatch_band).toBe('red');
    expect(result.hard_gate_triggered).toBe(true);
    // Even a top-tier composite still reads red under a hard gate — proving red is
    // downstream state, not a filter that removes the carrier from the result.
    expect(result.overall_score).toBeGreaterThanOrEqual(80);
  });

  it('a carrier already on the DNU list is scored to red without throwing / blocking', () => {
    let result!: ReturnType<typeof computeScore>;
    expect(() => {
      result = computeScore(goodInputs, { ...cleanGates, on_dnu: true });
    }).not.toThrow();
    expect(result.dispatch_band).toBe('red');
  });

  it('an excellent, clean carrier is green — banding is live and not blocked', () => {
    const result = computeScore(goodInputs, cleanGates);
    expect(result.dispatch_band).toBe('green');
    expect(result.hard_gate_triggered).toBe(false);
  });
});
