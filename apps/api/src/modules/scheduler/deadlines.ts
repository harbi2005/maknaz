import type { Tx } from '../../db.js';
import { now } from '../../lib/clock.js';

export type EntityType = 'DEAL' | 'SHIPMENT' | 'OFFER_ROUND';
export type DeadlineType =
  | 'CARRIER_CONFIRMATION'
  | 'CARRIER_RETRY'
  | 'PAYMENT'
  | 'PAYMENT_REMINDER'
  | 'PICKUP_DEADLINE'
  | 'CARRIER_RECONFIRM'
  | 'REASSIGNMENT'
  | 'DELIVERY_ETA'
  | 'OFFER_ROUND'
  | 'DELIVERED_UNCONFIRMED';

/**
 * ADR-006 / BR-073: registers a deadline row with a unique key. Re-scheduling the same
 * (entity, type) supersedes previous PENDING rows and uses the next sequence number.
 */
export async function scheduleDeadline(tx: Tx, entityType: EntityType, entityId: string, type: DeadlineType, dueAt: Date) {
  const last = await tx.scheduledDeadline.findFirst({
    where: { entity_type: entityType, entity_id: entityId, deadline_type: type },
    orderBy: { sequence: 'desc' },
  });
  await tx.scheduledDeadline.updateMany({
    where: { entity_type: entityType, entity_id: entityId, deadline_type: type, status: 'PENDING' },
    data: { status: 'SKIPPED', processed_at: now(), last_error: 'superseded' },
  });
  await tx.scheduledDeadline.create({
    data: { entity_type: entityType, entity_id: entityId, deadline_type: type, due_at: dueAt, sequence: (last?.sequence ?? 0) + 1 },
  });
}

/** Marks pending deadlines as SKIPPED (e.g. carrier deadline once the quote is selected). */
export async function skipDeadlines(tx: Tx, entityType: EntityType, entityId: string, types: DeadlineType[], note = 'no longer applicable') {
  await tx.scheduledDeadline.updateMany({
    where: { entity_type: entityType, entity_id: entityId, deadline_type: { in: types }, status: 'PENDING' },
    data: { status: 'SKIPPED', processed_at: now(), last_error: note },
  });
}
