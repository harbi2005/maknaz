import { toMoney, type Money } from '@maknaz/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Dec = Prisma.Decimal;

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const isoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Decimal → fixed string ("600.000"), the API representation for quantities (API_SPECIFICATION §5). */
export const qty = (d: Dec | null | undefined, places = 3): string | null => (d == null ? null : d.toFixed(places));

export const num = (d: Dec | null | undefined): number | null => (d == null ? null : d.toNumber());

export const money = (v: bigint | number): Money => toMoney(v);

export const moneyOrNull = (v: bigint | number | null | undefined): Money | null => (v == null ? null : toMoney(v));

/** JSON-safe deep conversion for audit snapshots (bigint and Decimal are not JSON-native). */
export function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v && typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function' && 'd' in v) {
        return (v as Dec).toString();
      }
      return v;
    }),
  );
}
