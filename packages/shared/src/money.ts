// ADR-004: money is stored as integer halalas. These helpers never use floating point.

export interface Money {
  amount_halalas: number;
  currency: 'SAR';
  display: string;
}

/** Formats integer halalas as "25,200.00" (Western Arabic digits, UI_UX §1.1). */
export function formatHalalas(amount: number | bigint): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(assertSafeInteger(amount));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const riyals = abs / 100n;
  const halalas = abs % 100n;
  const grouped = riyals.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${halalas.toString().padStart(2, '0')}`;
}

export function toMoney(amount: number | bigint): Money {
  const n = typeof amount === 'bigint' ? Number(amount) : assertSafeInteger(amount);
  return { amount_halalas: n, currency: 'SAR', display: formatHalalas(amount) };
}

function assertSafeInteger(n: number): number {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Money amounts must be safe integers of halalas, got ${n}`);
  }
  return n;
}
