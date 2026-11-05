import { db, lockRow, transaction, type Tx } from '../../db.js';
import { addHours, now } from '../../lib/clock.js';
import { logger } from '../../lib/logger.js';
import { audit, systemActor } from '../audit/audit.js';
import { releaseCarrier } from '../logistics/shipments.service.js';
import { notifyEligibleCarriers } from '../matching/matching.service.js';
import { notifyAdmins, notifyOrgs } from '../notifications/notify.js';
import { policyById } from '../policy/policy.js';
import { cancelDeal, shipmentEvent } from '../trading/deals.service.js';
import { expireRound } from '../trading/offers.service.js';
import { scheduleDeadline } from './deadlines.js';
import { registerJob } from './runner.js';

const MAX_ATTEMPTS = 5;
const BATCH = 200;

type Outcome = 'DONE' | 'SKIPPED';
interface DeadlineRow {
  id: string;
  entity_type: string;
  entity_id: string;
  deadline_type: string;
  due_at: Date;
}

/** Executes one deadline; returns SKIPPED when the entity is no longer in the expected state (BR-073). */
async function execute(tx: Tx, d: DeadlineRow): Promise<Outcome> {
  const actor = systemActor(d.id);
  switch (d.deadline_type) {
    case 'OFFER_ROUND':
      return (await expireRound(tx, d.entity_id, actor)) ? 'DONE' : 'SKIPPED';

    case 'CARRIER_CONFIRMATION': {
      await lockRow(tx, 'deals', d.entity_id);
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: d.entity_id } });
      if (deal.status !== 'PENDING_CARRIER') return 'SKIPPED';
      const policy = await policyById(tx, deal.policy_version_id);
      const retryAt = addHours(deal.carrier_deadline_at, policy.carrier_retry_window_hours);
      // BR-037/038, OD-05: one retry window; valid quotes stay selectable until the new deadline.
      await tx.deal.update({ where: { id: deal.id }, data: { status: 'PENDING_CARRIER_RETRY', retry_deadline_at: retryAt, version: { increment: 1 } } });
      await tx.transportQuote.updateMany({ where: { deal_id: deal.id, status: 'SUBMITTED' }, data: { expires_at: retryAt } });
      await scheduleDeadline(tx, 'DEAL', deal.id, 'CARRIER_RETRY', retryAt);
      await audit(tx, actor, { action: 'DEAL_CARRIER_RETRY_STARTED', entityType: 'DEAL', entityId: deal.id, before: { status: 'PENDING_CARRIER' }, after: { status: 'PENDING_CARRIER_RETRY', retry_deadline_at: retryAt } });
      await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id], {
        eventType: 'CARRIER_RETRY_STARTED',
        titleAr: `فترة أخيرة لتأكيد الناقل ${deal.reference}`,
        bodyAr: 'لم يُؤكَّد ناقل خلال 24 ساعة؛ وُسّع نطاق البحث عن الناقلين لفترة أخيرة مدتها 24 ساعة.',
        entityType: 'DEAL',
        entityId: deal.id,
        linkPath: `/deals/${deal.id}`,
      });
      await notifyEligibleCarriers(tx, deal.id, true);
      return 'DONE';
    }

    case 'CARRIER_RETRY': {
      await lockRow(tx, 'deals', d.entity_id);
      const ok = await cancelDeal(tx, d.entity_id, 'NO_CARRIER_CONFIRMED', actor, { expectedStatuses: ['PENDING_CARRIER_RETRY'], faultParty: 'NONE' });
      return ok ? 'DONE' : 'SKIPPED';
    }

    case 'PAYMENT': {
      await lockRow(tx, 'deals', d.entity_id);
      const ok = await cancelDeal(tx, d.entity_id, 'PAYMENT_EXPIRED', actor, { expectedStatuses: ['AWAITING_PAYMENT'], faultParty: 'FACTORY' });
      return ok ? 'DONE' : 'SKIPPED';
    }

    case 'PAYMENT_REMINDER': {
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: d.entity_id } });
      if (deal.status !== 'AWAITING_PAYMENT') return 'SKIPPED';
      await notifyOrgs(tx, [deal.factory_org_id], {
        eventType: 'PAYMENT_REMINDER',
        titleAr: `تذكير بالدفع المحاكى ${deal.reference}`,
        bodyAr: 'تبقت ساعات قليلة على انتهاء مهلة الدفع؛ ستُلغى الصفقة تلقائيًا بعدها.',
        entityType: 'DEAL',
        entityId: deal.id,
        linkPath: `/deals/${deal.id}`,
      });
      return 'DONE';
    }

    case 'PICKUP_DEADLINE': {
      const s0 = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id } });
      await lockRow(tx, 'deals', s0.deal_id);
      await lockRow(tx, 'shipments', s0.id);
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id }, include: { deal: true } });
      if (!['SCHEDULED', 'READY_FOR_PICKUP', 'RECONFIRM_REQUIRED', 'PENDING_CARRIER'].includes(s.status) || s.deal.status !== 'PAID') return 'SKIPPED';
      const policy = await policyById(tx, s.deal.policy_version_id);
      // A later extension supersedes this row; double-check against the current deadline (BR-071).
      if (!s.pickup_deadline_at || now() < addHours(s.pickup_deadline_at, policy.pickup_grace_period_hours)) return 'SKIPPED';
      if (!policy.auto_cancellation_enabled) return 'SKIPPED';
      const ok = await cancelDeal(tx, s.deal_id, 'PICKUP_MISSED', actor, { faultParty: 'UNDETERMINED' });
      return ok ? 'DONE' : 'SKIPPED';
    }

    case 'CARRIER_RECONFIRM': {
      const s0 = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id } });
      await lockRow(tx, 'deals', s0.deal_id);
      await lockRow(tx, 'shipments', s0.id);
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id } });
      if (s.status !== 'RECONFIRM_REQUIRED' || !s.reconfirm_deadline_at || now() < s.reconfirm_deadline_at) return 'SKIPPED';
      return (await releaseCarrier(tx, s.id, 'TIMED_OUT', actor)) ? 'DONE' : 'SKIPPED';
    }

    case 'REASSIGNMENT': {
      const s0 = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id } });
      await lockRow(tx, 'deals', s0.deal_id);
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id }, include: { deal: true } });
      if (s.status !== 'PENDING_CARRIER' || s.deal.status !== 'PAID') return 'SKIPPED';
      const ok = await cancelDeal(tx, s.deal_id, 'NO_CARRIER_REASSIGNED', actor, { faultParty: 'CARRIER' });
      return ok ? 'DONE' : 'SKIPPED';
    }

    case 'DELIVERY_ETA': {
      const s0 = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id } });
      await lockRow(tx, 'deals', s0.deal_id);
      await lockRow(tx, 'shipments', s0.id);
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id }, include: { deal: true } });
      if (s.status !== 'IN_TRANSIT') return 'SKIPPED';
      // BR-072: in-transit shipments are never cancelled; they become DELAYED with alerts.
      await tx.shipment.update({ where: { id: s.id }, data: { status: 'DELAYED', version: { increment: 1 } } });
      await shipmentEvent(tx, s.id, 'IN_TRANSIT', 'DELAYED', actor, 'تجاوزت الشحنة موعد الوصول المتوقع ومهلة السماح');
      await audit(tx, actor, { action: 'SHIPMENT_DELAYED', entityType: 'SHIPMENT', entityId: s.id, before: { status: 'IN_TRANSIT' }, after: { status: 'DELAYED' } });
      const n = {
        eventType: 'SHIPMENT_DELAYED',
        titleAr: `الشحنة متأخرة ${s.deal.reference}`,
        bodyAr: 'تجاوزت الشحنة موعد الوصول المتوقع. لا يُلغى النقل؛ تابع مع الناقل.',
        entityType: 'SHIPMENT',
        entityId: s.id,
        linkPath: `/shipments/${s.id}`,
      };
      await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id, s.carrier_org_id], n);
      await notifyAdmins(tx, n);
      return 'DONE';
    }

    case 'DELIVERED_UNCONFIRMED': {
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: d.entity_id }, include: { deal: true } });
      if (s.status !== 'DELIVERED') return 'SKIPPED';
      await notifyAdmins(tx, {
        eventType: 'DELIVERED_UNCONFIRMED',
        titleAr: `تسليم غير مؤكد منذ 72 ساعة ${s.deal.reference}`,
        bodyAr: 'لم يؤكد المصنع الاستلام بعد؛ لا يوجد تأكيد تلقائي (OD-09).',
        entityType: 'SHIPMENT',
        entityId: s.id,
        linkPath: `/admin/deals/${s.deal_id}`,
      });
      return 'DONE';
    }
    default:
      return 'SKIPPED';
  }
}

/**
 * Picks due PENDING deadlines in due order (catch-up after downtime, BR-077) and executes each in
 * its own transaction with FOR UPDATE SKIP LOCKED, so concurrent workers never double-process.
 */
export async function processDueDeadlines(limit = BATCH): Promise<{ processed: number; failed: number }> {
  const due = await db().scheduledDeadline.findMany({
    where: { status: 'PENDING', due_at: { lte: now() } },
    orderBy: { due_at: 'asc' },
    take: limit,
    select: { id: true },
  });
  let processed = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      await transaction(async (tx) => {
        const rows = await tx.$queryRaw<DeadlineRow[]>`
          SELECT id, entity_type, entity_id, deadline_type, due_at FROM scheduled_deadlines
           WHERE id = ${id}::uuid AND status = 'PENDING' FOR UPDATE SKIP LOCKED`;
        const row = rows[0];
        if (!row) return;
        const outcome = await execute(tx, row);
        await tx.scheduledDeadline.update({ where: { id }, data: { status: outcome, processed_at: now(), attempts: { increment: 1 } } });
      });
      processed++;
    } catch (err) {
      failed++;
      const current = await db().scheduledDeadline.findUnique({ where: { id } });
      const attempts = (current?.attempts ?? 0) + 1;
      await db().scheduledDeadline.update({
        where: { id },
        data: {
          attempts,
          last_error: String((err as Error)?.message ?? err).slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          // Exponential backoff for the retry.
          due_at: attempts >= MAX_ATTEMPTS ? undefined : new Date(now().getTime() + 2 ** attempts * 30_000),
        },
      });
      logger.error({ err, deadline_id: id, attempts }, 'deadline processing failed');
    }
  }
  return { processed, failed };
}

/** Removes expired idempotency records (daily maintenance, ARCHITECTURE §9). */
export async function cleanupIdempotency() {
  await db().idempotencyRecord.deleteMany({ where: { expires_at: { lt: now() } } });
}

registerJob(() => processDueDeadlines());
registerJob(() => cleanupIdempotency());
