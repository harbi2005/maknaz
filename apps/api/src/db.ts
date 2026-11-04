import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';
import { config } from './config.js';

export { Prisma };
export type Tx = Prisma.TransactionClient;

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({ connectionString: config().DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

const RETRYABLE_PG_CODES = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

function isRetryable(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? '');
  const code = (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code;
  return (code !== undefined && RETRYABLE_PG_CODES.has(code)) || /deadlock detected|could not serialize/i.test(text);
}

/**
 * Runs fn in a READ COMMITTED transaction (DATABASE_DESIGN §4.4) and retries once on
 * deadlock / serialization failure, then surfaces a retryable STATE_CONFLICT.
 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
    } catch (err) {
      if (attempt === 0 && isRetryable(err)) continue;
      if (isRetryable(err)) {
        const { AppError } = await import('./lib/errors.js');
        throw new AppError(409, 'STATE_CONFLICT', 'تعذر إكمال العملية بسبب تعارض متزامن، حاول مرة أخرى.', { retryable: true });
      }
      throw err;
    }
  }
}

/** SELECT ... FOR UPDATE on a single row by id. Table names are internal constants only. */
export async function lockRow(tx: Tx, table: LockableTable, id: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "${table}" WHERE id = $1::uuid FOR UPDATE`,
    id,
  );
  return rows.length > 0;
}

export type LockableTable =
  | 'deals'
  | 'shipments'
  | 'invoices'
  | 'material_listings'
  | 'purchase_offers'
  | 'offer_negotiation_rounds'
  | 'transport_quotes'
  | 'carrier_pricing_rule_versions'
  | 'organizations';
