import type { Tx } from '../../db.js';
import { addHours, now } from '../../lib/clock.js';
import { audit, type Actor } from '../audit/audit.js';
import { notifyAdmins, notifyOrgs } from '../notifications/notify.js';
import { policyById } from '../policy/policy.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { shipmentEvent } from '../trading/deals.service.js';
import { notifyEligibleCarriers } from '../matching/matching.service.js';

/**
 * BR-065: the carrier declined or missed reconfirmation. The new pickup deadline stays (mine's
 * authority), the selected quote is RELEASED, the shipment returns to PENDING_CARRIER and a
 * 24h reassignment window opens. The deal stays PAID. Caller holds deal + shipment locks.
 */
export async function releaseCarrier(tx: Tx, shipmentId: string, outcome: 'DECLINED' | 'TIMED_OUT', actor: Actor, reason?: string | null) {
  const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { deal: true } });
  if (s.status !== 'RECONFIRM_REQUIRED') return false;
  const policy = await policyById(tx, s.deal.policy_version_id);
  const deadline = addHours(now(), policy.reassignment_window_hours);
  const releasedCarrier = s.carrier_org_id;
  if (s.active_quote_id) {
    await tx.transportQuote.updateMany({ where: { id: s.active_quote_id, status: 'SELECTED' }, data: { status: 'RELEASED' } });
  }
  await tx.shipment.update({
    where: { id: shipmentId },
    data: { status: 'PENDING_CARRIER', carrier_org_id: null, active_quote_id: null, reconfirm_deadline_at: null, reassignment_deadline_at: deadline, version: { increment: 1 } },
  });
  await tx.shipmentLeg.updateMany({ where: { shipment_id: shipmentId }, data: { carrier_org_id: null } });
  await tx.shipmentExtension.updateMany({
    where: { shipment_id: shipmentId, reconfirmation_status: 'PENDING' },
    data: { reconfirmation_status: outcome, decline_reason: reason ?? null, reconfirmed_at: now(), reconfirmed_by: actor.userId },
  });
  await skipDeadlines(tx, 'SHIPMENT', shipmentId, ['CARRIER_RECONFIRM'], `carrier ${outcome.toLowerCase()}`);
  await scheduleDeadline(tx, 'SHIPMENT', shipmentId, 'REASSIGNMENT', deadline);
  await shipmentEvent(tx, shipmentId, 'RECONFIRM_REQUIRED', 'PENDING_CARRIER', actor,
    outcome === 'DECLINED' ? `اعتذر الناقل: ${reason ?? ''}` : 'انقضت مهلة إعادة التأكيد دون رد الناقل');
  await audit(tx, actor, {
    action: outcome === 'DECLINED' ? 'CARRIER_RECONFIRM_DECLINED' : 'CARRIER_RECONFIRM_TIMED_OUT',
    entityType: 'SHIPMENT',
    entityId: shipmentId,
    before: { status: 'RECONFIRM_REQUIRED', carrier_org_id: releasedCarrier },
    after: { status: 'PENDING_CARRIER', reassignment_deadline_at: deadline },
  });
  await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id, releasedCarrier], {
    eventType: 'CARRIER_RELEASED',
    titleAr: `يجري إسناد ناقل بديل للصفقة ${s.deal.reference}`,
    bodyAr: `الموعد الحالي يبقى ساريًا. مهلة إعادة الإسناد حتى ${deadline.toISOString()}.`,
    entityType: 'SHIPMENT',
    entityId: shipmentId,
    linkPath: `/deals/${s.deal_id}`,
  });
  if (outcome === 'DECLINED') {
    await notifyAdmins(tx, {
      eventType: 'CARRIER_RELEASED',
      titleAr: `اعتذار ناقل عن شحنة ${s.deal.reference}`,
      bodyAr: reason ?? '',
      entityType: 'SHIPMENT',
      entityId: shipmentId,
      linkPath: `/admin/deals/${s.deal_id}`,
    });
  }
  await notifyEligibleCarriers(tx, s.deal_id, true);
  return true;
}
