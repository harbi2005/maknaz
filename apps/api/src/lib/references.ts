import type { Tx } from '../db.js';
import { now } from './clock.js';

export type ReferenceKind = 'OFR' | 'DEAL' | 'INV' | 'SIM-PAY' | 'SIM-REF';

/**
 * Human-readable references such as MKZ-OFR-2026-000014 (DATABASE_DESIGN §3.4).
 * The counter row is locked by the UPDATE, so references are unique and gap-free per year.
 */
export async function nextReference(tx: Tx, kind: ReferenceKind): Promise<string> {
  const year = now().getUTCFullYear();
  const name = `${kind}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO reference_counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = reference_counters.value + 1
    RETURNING value`;
  const n = rows[0]!.value;
  const prefix = kind.startsWith('SIM') ? kind : `MKZ-${kind}`;
  return `${prefix}-${year}-${String(n).padStart(6, '0')}`;
}
