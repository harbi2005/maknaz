import { CANCELLATION_REASON_LABELS, type CancellationReason } from '@maknaz/shared';
import { lockRow, type Tx } from '../../db.js';
import { now } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { audit, type Actor } from '../audit/audit.js';
import { simulatedRefund } from '../billing/billing.service.js';
import { notifyAdmins, notifyOrgs } from '../notifications/notify.js';
import { skipDeadlines } from '../scheduler/deadlines.js';

const NOT_CANCELLABLE_SHIPMENT = ['PICKED_UP', 'IN_TRANSIT', 'DELAYED', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

export async function shipmentEvent(
  tx: Tx,
  shipmentId: string,
  from: string | null,
  to: string | null,
  actor: Actor,
  note?: string | null,
  payload?: object,
  eventType = 'TRANSITION',
) {
  await tx.shipmentEvent.create({
    data: {
      shipment_id: shipmentId,
      event_type: eventType,
      from_status: from,
      to_status: to,
      actor_type: actor.type,
      actor_user_id: actor.userId,
      actor_org_id: actor.orgId,
      note: note ?? null,
      payload: payload ?? undefined,
      occurred_at: now(),
    },
  });
}

/**
 * Cancels a deal and applies every compensating effect in one transaction
 * (TRANSACTION_STATE_MACHINE §3, CANCELLATION_RULES): reservation released, quotes expired or
 * released, shipment cancelled, invoice expired or fully refunded (simulated), deadlines skipped.
 * The caller must already hold the deal row lock. Returns false if the deal was not cancellable.
 */
export async function cancelDeal(
  tx: Tx,
  dealId: string,
  reason: CancellationReason,
  actor: Actor,
  opts: { note?: string | null; faultParty?: string; expectedStatuses?: string[] } = {},
): Promise<boolean> {
  const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: { shipment: true, invoice: true, reservation: true } });
  if (['COMPLETED', 'CANCELLED', 'IN_FULFILLMENT'].includes(deal.status)) return false;
  if (opts.expectedStatuses && !opts.expectedStatuses.includes(deal.status)) return false;
  const shipment = deal.shipment;
  if (shipment) {
    await lockRow(tx, 'shipments', shipment.id);
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    // Shipments in motion are never cancelled (BR-072).
    if (NOT_CANCELLABLE_SHIPMENT.includes(s.status)) return false;
  }
  const at = now();
  const updated = await tx.deal.updateMany({
    where: { id: dealId, status: deal.status },
    data: {
      status: 'CANCELLED',
      cancelled_at: at,
      cancellation_reason: reason,
      cancellation_note: opts.note ?? null,
      cancellation_fault_party: opts.faultParty ?? (actor.type === 'SYSTEM' ? 'NONE' : 'UNDETERMINED'),
      cancelled_by: actor.userId,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return false;

  // Reservation → RELEASED (DATABASE_DESIGN §4.2), conditional on still being ACTIVE.
  if (deal.reservation && deal.reservation.status === 'ACTIVE') {
    const r = await tx.inventoryReservation.updateMany({
      where: { id: deal.reservation.id, status: 'ACTIVE' },
      data: { status: 'RELEASED', released_reason: reason, closed_at: at },
    });
    if (r.count === 1) {
      await tx.$executeRaw`UPDATE material_listings SET reserved_quantity = reserved_quantity - ${deal.reservation.quantity}::numeric, version = version + 1, updated_at = now() WHERE id = ${deal.listing_id}::uuid`;
    }
  }
  await tx.transportQuote.updateMany({ where: { deal_id: dealId, status: 'SUBMITTED' }, data: { status: 'EXPIRED' } });
  await tx.transportQuote.updateMany({ where: { deal_id: dealId, status: 'SELECTED' }, data: { status: 'RELEASED' } });

  if (shipment) {
    await tx.shipment.update({ where: { id: shipment.id }, data: { status: 'CANCELLED', cancelled_at: at, cancellation_reason: reason, version: { increment: 1 } } });
    await shipmentEvent(tx, shipment.id, shipment.status, 'CANCELLED', actor, CANCELLATION_REASON_LABELS[reason]);
    await skipDeadlines(tx, 'SHIPMENT', shipment.id, ['PICKUP_DEADLINE', 'CARRIER_RECONFIRM', 'REASSIGNMENT', 'DELIVERY_ETA'], 'deal cancelled');
  }
  await skipDeadlines(tx, 'DEAL', dealId, ['CARRIER_CONFIRMATION', 'CARRIER_RETRY', 'PAYMENT', 'PAYMENT_REMINDER'], 'deal cancelled');

  if (deal.invoice) {
    if (deal.invoice.payment_status === 'PAYMENT_PENDING') {
      await tx.invoice.update({ where: { id: deal.invoice.id }, data: { payment_status: 'PAYMENT_EXPIRED' } });
    } else {
      // Cancellation after payment and before pickup → full simulated refund (BR-046).
      await simulatedRefund(tx, deal.invoice.id, 'FULL_REMAINING', 'DEAL_CANCELLATION', dealId, `إلغاء الصفقة: ${CANCELLATION_REASON_LABELS[reason]}`, actor);
    }
  }

  await audit(tx, actor, {
    action: 'DEAL_CANCELLED',
    entityType: 'DEAL',
    entityId: dealId,
    before: { status: deal.status },
    after: { status: 'CANCELLED', reason, note: opts.note ?? null, fault_party: opts.faultParty ?? null },
  });
  await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id, shipment?.carrier_org_id], {
    eventType: 'DEAL_CANCELLED',
    titleAr: `أُلغيت الصفقة ${deal.reference}`,
    bodyAr: CANCELLATION_REASON_LABELS[reason],
    entityType: 'DEAL',
    entityId: dealId,
    linkPath: `/deals/${dealId}`,
  });
  if (actor.type === 'SYSTEM') {
    await notifyAdmins(tx, {
      eventType: 'DEAL_AUTO_CANCELLED',
      titleAr: `إلغاء تلقائي للصفقة ${deal.reference}`,
      bodyAr: CANCELLATION_REASON_LABELS[reason],
      entityType: 'DEAL',
      entityId: dealId,
      linkPath: `/admin/deals/${dealId}`,
    });
  }
  return true;
}

export function assertCancellableByParty(status: string) {
  if (['PAID', 'IN_FULFILLMENT'].includes(status)) {
    throw new AppError(409, 'CANCELLATION_REQUIRES_ADMIN', 'بعد الدفع لا يلغي الصفقة إلا إدارة المنصة؛ تواصل معها.');
  }
  if (['COMPLETED', 'CANCELLED'].includes(status)) throw new AppError(409, 'INVALID_STATE', 'الصفقة منتهية بالفعل.');
}
