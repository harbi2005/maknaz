import {
  confirmReceiptSchema,
  EXTENSION_REASON_LABELS,
  extensionSchema,
  noteSchema,
  pickupSchema,
  reconfirmSchema,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from '@maknaz/shared';
import { Router, type Request } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { db, lockRow, transaction, type Tx } from '../../db.js';
import { auth, requireActiveOrg, requireOrg } from '../../lib/context.js';
import { addHours, HOUR, now } from '../../lib/clock.js';
import { idempotent } from '../../lib/idempotency.js';
import { AppError, notFound, unprocessable } from '../../lib/errors.js';
import { qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit, type Actor } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import { policyById } from '../policy/policy.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { shipmentEvent } from '../trading/deals.service.js';
import { releaseCarrier } from './shipments.service.js';

export const shipmentsRouter = Router();

const SHIPMENT_INCLUDE = {
  deal: true,
  extensions: { orderBy: { sequence_no: 'asc' as const } },
  events: { orderBy: { occurred_at: 'asc' as const } },
  active_quote: { include: { service: true } },
} satisfies Prisma.ShipmentInclude;
type ShipmentFull = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;

async function shipmentDto(s: ShipmentFull, viewerOrgId: string | null, isAdmin: boolean) {
  const policy = await policyById(db() as unknown as Tx, s.deal.policy_version_id);
  const orgIds = [s.deal.factory_org_id, s.deal.mine_org_id, s.carrier_org_id, ...s.events.map((e) => e.actor_org_id)].filter((x): x is string => !!x);
  const orgs = new Map((await db().organization.findMany({ where: { id: { in: orgIds } } })).map((o) => [o.id, o.legal_name_ar]));
  const role = isAdmin ? 'ADMIN' : viewerOrgId === s.deal.factory_org_id ? 'FACTORY' : viewerOrgId === s.deal.mine_org_id ? 'MINE' : 'CARRIER';
  const graceEnd = s.pickup_deadline_at ? addHours(s.pickup_deadline_at, policy.pickup_grace_period_hours) : null;
  const beforePickup = ['SCHEDULED', 'READY_FOR_PICKUP', 'RECONFIRM_REQUIRED', 'PENDING_CARRIER'].includes(s.status);
  const canExtend =
    role === 'MINE' && beforePickup && s.deal.status === 'PAID' && !!s.pickup_deadline_at &&
    s.extension_count < policy.max_shipment_extensions && !!graceEnd && now() < graceEnd;
  const snap = s.deal.commercial_snapshot as { mine: { name: string }; delivery_site: { name: string }; listing: { title: string } };
  return {
    id: s.id,
    status: s.status,
    status_label: SHIPMENT_STATUS_LABELS[s.status as ShipmentStatus],
    viewer_role: role,
    deal: { id: s.deal.id, reference: s.deal.reference, status: s.deal.status, quantity_tons: qty(s.deal.quantity_tons) },
    material_title: snap.listing.title,
    origin: snap.mine.name,
    destination: snap.delivery_site.name,
    carrier: s.carrier_org_id ? { id: s.carrier_org_id, name_ar: orgs.get(s.carrier_org_id) ?? null } : null,
    pickup_window: { start: s.pickup_window_start.toISOString(), end: s.pickup_window_end.toISOString() },
    planned_pickup_at: s.planned_pickup_at?.toISOString() ?? null,
    pickup_deadline_at: s.pickup_deadline_at?.toISOString() ?? null,
    original_pickup_deadline_at: s.original_pickup_deadline_at?.toISOString() ?? null,
    auto_cancel_at: beforePickup && graceEnd && s.deal.status === 'PAID' ? graceEnd.toISOString() : null,
    extension_count: s.extension_count,
    extensions_remaining: Math.max(0, policy.max_shipment_extensions - s.extension_count),
    max_extension_hours: policy.max_extension_hours,
    reconfirm_deadline_at: s.reconfirm_deadline_at?.toISOString() ?? null,
    reassignment_deadline_at: s.reassignment_deadline_at?.toISOString() ?? null,
    expected_delivery_at: s.expected_delivery_at?.toISOString() ?? null,
    estimated_transit_hours: s.active_quote?.estimated_transit_hours.toFixed(1) ?? null,
    picked_up_at: s.picked_up_at?.toISOString() ?? null,
    handover_confirmed_at: s.handover_confirmed_at?.toISOString() ?? null,
    in_transit_at: s.in_transit_at?.toISOString() ?? null,
    delivered_at: s.delivered_at?.toISOString() ?? null,
    completed_at: s.completed_at?.toISOString() ?? null,
    loaded_tons: s.loaded_tons ? qty(s.loaded_tons) : null,
    received_tons: s.received_tons ? qty(s.received_tons) : null,
    extensions: s.extensions.map((e) => ({
      sequence_no: e.sequence_no,
      previous_deadline_at: e.previous_deadline_at.toISOString(),
      new_deadline_at: e.new_deadline_at.toISOString(),
      reason_code: e.reason_code,
      reason_label: EXTENSION_REASON_LABELS[e.reason_code as keyof typeof EXTENSION_REASON_LABELS],
      reason_text: e.reason_text,
      reconfirmation_status: e.reconfirmation_status,
      reconfirm_deadline_at: e.reconfirm_deadline_at?.toISOString() ?? null,
      decline_reason: e.decline_reason,
      created_at: e.created_at.toISOString(),
    })),
    events: s.events.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      from_status: e.from_status,
      to_status: e.to_status,
      actor_type: e.actor_type,
      actor_org_name: e.actor_org_id ? (orgs.get(e.actor_org_id) ?? null) : null,
      note: e.note,
      occurred_at: e.occurred_at.toISOString(),
    })),
    actions: {
      can_mark_ready: role === 'MINE' && s.status === 'SCHEDULED',
      can_extend: canExtend,
      can_confirm_handover: role === 'MINE' && ['PICKED_UP', 'IN_TRANSIT', 'DELAYED', 'DELIVERED'].includes(s.status) && !s.handover_confirmed_at,
      can_pickup: role === 'CARRIER' && ['SCHEDULED', 'READY_FOR_PICKUP'].includes(s.status),
      can_start_transit: role === 'CARRIER' && s.status === 'PICKED_UP',
      can_deliver: role === 'CARRIER' && ['IN_TRANSIT', 'DELAYED'].includes(s.status),
      can_reconfirm: role === 'CARRIER' && s.status === 'RECONFIRM_REQUIRED',
      can_confirm_receipt: role === 'FACTORY' && s.status === 'DELIVERED',
    },
  };
}

async function loadForParty(req: Request, id: string) {
  const a = auth(req);
  const s = await db().shipment.findUnique({ where: { id }, include: SHIPMENT_INCLUDE });
  if (!s) throw notFound();
  const party = a.isPlatformAdmin || a.org?.id === s.deal.factory_org_id || a.org?.id === s.deal.mine_org_id || (!!a.org && a.org.id === s.carrier_org_id);
  if (!party) throw notFound();
  return { s, a };
}

async function respond(req: Request, id: string) {
  const { s, a } = await loadForParty(req, id);
  return shipmentDto(s, a.org?.id ?? null, a.isPlatformAdmin);
}

shipmentsRouter.get('/shipments', async (req, res) => {
  const org = requireOrg(req);
  const where: Prisma.ShipmentWhereInput =
    org.type === 'FACTORY' ? { deal: { factory_org_id: org.id } } : org.type === 'MINE' ? { deal: { mine_org_id: org.id } } : { carrier_org_id: org.id };
  const rows = await db().shipment.findMany({ where: { ...where, deal: { ...(where.deal as object), status: { in: ['PAID', 'IN_FULFILLMENT', 'COMPLETED', 'AWAITING_PAYMENT'] } } }, include: SHIPMENT_INCLUDE, orderBy: { updated_at: 'desc' }, take: 200 });
  res.json({ data: await Promise.all(rows.map((s) => shipmentDto(s, org.id, false))) });
});

shipmentsRouter.get('/shipments/:id', async (req, res) => {
  res.json(await respond(req, idParam(req.params.id)));
});

shipmentsRouter.get('/shipments/:id/events', async (req, res) => {
  const body = await respond(req, idParam(req.params.id));
  res.json({ data: body.events });
});

shipmentsRouter.get('/shipments/:id/extensions', async (req, res) => {
  const body = await respond(req, idParam(req.params.id));
  res.json({ data: body.extensions });
});

type Party = 'MINE' | 'CARRIER' | 'FACTORY';

/**
 * Locks deal → shipment (TRANSACTION_STATE_MACHINE §0.6) and checks the caller is the right
 * party. Carriers must be the *assigned* carrier (BR-053, SEC-11) — otherwise 404.
 */
async function lockShipmentFor(tx: Tx, req: Request, id: string, party: Party) {
  const org = requireActiveOrg(req, party);
  const peek = await tx.shipment.findUnique({ where: { id }, select: { deal_id: true } });
  if (!peek) throw notFound();
  await lockRow(tx, 'deals', peek.deal_id);
  await lockRow(tx, 'shipments', id);
  const s = await tx.shipment.findUniqueOrThrow({ where: { id }, include: { deal: true, active_quote: true } });
  const owner = party === 'MINE' ? s.deal.mine_org_id : party === 'FACTORY' ? s.deal.factory_org_id : s.carrier_org_id;
  if (owner !== org.id) throw notFound();
  return { s, actor: actorFromRequest(req) as Actor };
}

function requireStatus(current: string, allowed: string[], code = 'INVALID_STATE', msg = 'لا تسمح حالة الشحنة الحالية بهذا الإجراء.') {
  if (!allowed.includes(current)) throw new AppError(409, code, msg, { details: { status: current } });
}

/** P-61: mine marks the material ready (SCHEDULED → READY_FOR_PICKUP). */
shipmentsRouter.post('/shipments/:id/ready', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const { note } = parse(noteSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'MINE');
    requireStatus(s.status, ['SCHEDULED']);
    await tx.shipment.update({ where: { id }, data: { status: 'READY_FOR_PICKUP', ready_at: now(), version: { increment: 1 } } });
    await shipmentEvent(tx, id, s.status, 'READY_FOR_PICKUP', actor, note ?? 'المادة جاهزة للاستلام');
    await audit(tx, actor, { action: 'SHIPMENT_READY', entityType: 'SHIPMENT', entityId: id, before: { status: s.status }, after: { status: 'READY_FOR_PICKUP' } });
    await notifyOrgs(tx, [s.carrier_org_id], {
      eventType: 'SHIPMENT_READY',
      titleAr: `المادة جاهزة للاستلام ${s.deal.reference}`,
      bodyAr: 'أكد المنجم جاهزية المادة.',
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/** P-63: assigned carrier records pickup (→ PICKED_UP, deal IN_FULFILLMENT). */
shipmentsRouter.post('/shipments/:id/pickup', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const input = parse(pickupSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'CARRIER');
    requireStatus(s.status, ['SCHEDULED', 'READY_FOR_PICKUP']);
    const policy = await policyById(tx, s.deal.policy_version_id);
    if (s.pickup_deadline_at && now() > addHours(s.pickup_deadline_at, policy.pickup_grace_period_hours)) {
      throw new AppError(409, 'DEADLINE_PASSED', 'انقضى موعد الاستلام ومهلة السماح.');
    }
    const at = now();
    const transit = s.active_quote ? s.active_quote.estimated_transit_hours.toNumber() : 24;
    const expected = new Date(at.getTime() + transit * HOUR);
    await tx.shipment.update({
      where: { id },
      data: { status: 'PICKED_UP', picked_up_at: at, expected_delivery_at: expected, loaded_tons: input.loaded_tons ? new Prisma.Decimal(input.loaded_tons) : null, version: { increment: 1 } },
    });
    await tx.deal.update({ where: { id: s.deal_id }, data: { status: 'IN_FULFILLMENT', version: { increment: 1 } } });
    await skipDeadlines(tx, 'SHIPMENT', id, ['PICKUP_DEADLINE', 'CARRIER_RECONFIRM'], 'picked up');
    await scheduleDeadline(tx, 'SHIPMENT', id, 'DELIVERY_ETA', addHours(expected, policy.delivery_grace_period_hours));
    await shipmentEvent(tx, id, s.status, 'PICKED_UP', actor, input.note ?? null, { loaded_tons: input.loaded_tons ?? null, vehicles_count: input.vehicles_count ?? null });
    await audit(tx, actor, { action: 'SHIPMENT_PICKED_UP', entityType: 'SHIPMENT', entityId: id, before: { status: s.status }, after: { status: 'PICKED_UP', loaded_tons: input.loaded_tons ?? null } });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id], {
      eventType: 'SHIPMENT_PICKED_UP',
      titleAr: `تم استلام الشحنة من المنجم ${s.deal.reference}`,
      bodyAr: `الوصول المتوقع: ${expected.toISOString()}`,
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/** P-62: optional supporting handover confirmation by the mine (OD-19). */
shipmentsRouter.post('/shipments/:id/handover-confirm', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const { note } = parse(noteSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'MINE');
    requireStatus(s.status, ['PICKED_UP', 'IN_TRANSIT', 'DELAYED', 'DELIVERED']);
    if (s.handover_confirmed_at) throw new AppError(409, 'INVALID_STATE', 'أُكدت المناولة من قبل.');
    await tx.shipment.update({ where: { id }, data: { handover_confirmed_at: now() } });
    await shipmentEvent(tx, id, null, null, actor, note ?? 'أكد المنجم المناولة', undefined, 'NOTE');
    await audit(tx, actor, { action: 'HANDOVER_CONFIRMED', entityType: 'SHIPMENT', entityId: id, after: { note } });
  });
  return { status: 200, body: await respond(req, id) };
}));

shipmentsRouter.post('/shipments/:id/in-transit', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const { note } = parse(noteSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'CARRIER');
    requireStatus(s.status, ['PICKED_UP']);
    await tx.shipment.update({ where: { id }, data: { status: 'IN_TRANSIT', in_transit_at: now(), version: { increment: 1 } } });
    await shipmentEvent(tx, id, s.status, 'IN_TRANSIT', actor, note ?? null);
    await audit(tx, actor, { action: 'SHIPMENT_IN_TRANSIT', entityType: 'SHIPMENT', entityId: id, before: { status: s.status }, after: { status: 'IN_TRANSIT' } });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id], {
      eventType: 'SHIPMENT_IN_TRANSIT',
      titleAr: `الشحنة في الطريق ${s.deal.reference}`,
      bodyAr: 'غادرت الشحنة نحو موقع المصنع.',
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

shipmentsRouter.post('/shipments/:id/deliver', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const { note } = parse(noteSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'CARRIER');
    requireStatus(s.status, ['IN_TRANSIT', 'DELAYED']);
    const policy = await policyById(tx, s.deal.policy_version_id);
    const at = now();
    await tx.shipment.update({ where: { id }, data: { status: 'DELIVERED', delivered_at: at, version: { increment: 1 } } });
    await skipDeadlines(tx, 'SHIPMENT', id, ['DELIVERY_ETA'], 'delivered');
    await scheduleDeadline(tx, 'SHIPMENT', id, 'DELIVERED_UNCONFIRMED', addHours(at, policy.delivered_unconfirmed_alert_hours));
    await shipmentEvent(tx, id, s.status, 'DELIVERED', actor, note ?? null);
    await audit(tx, actor, { action: 'SHIPMENT_DELIVERED', entityType: 'SHIPMENT', entityId: id, before: { status: s.status }, after: { status: 'DELIVERED' } });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id], {
      eventType: 'SHIPMENT_DELIVERED',
      titleAr: `وصلت الشحنة ${s.deal.reference}`,
      bodyAr: 'أكد استلام المادة لإغلاق الصفقة.',
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/** P-66 / BR-055: only the factory confirms receipt → COMPLETED, reservation CONSUMED. */
shipmentsRouter.post('/shipments/:id/confirm-receipt', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const input = parse(confirmReceiptSchema, req.body);
  await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'FACTORY');
    requireStatus(s.status, ['DELIVERED']);
    const at = now();
    await tx.shipment.update({
      where: { id },
      data: { status: 'COMPLETED', completed_at: at, received_tons: input.received_tons ? new Prisma.Decimal(input.received_tons) : null, version: { increment: 1 } },
    });
    await tx.deal.update({ where: { id: s.deal_id }, data: { status: 'COMPLETED', completed_at: at, version: { increment: 1 } } });
    const reservation = await tx.inventoryReservation.findUniqueOrThrow({ where: { deal_id: s.deal_id } });
    const r = await tx.inventoryReservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE' }, data: { status: 'CONSUMED', closed_at: at } });
    if (r.count === 1) {
      await tx.$executeRaw`UPDATE material_listings SET reserved_quantity = reserved_quantity - ${reservation.quantity}::numeric, sold_quantity = sold_quantity + ${reservation.quantity}::numeric, version = version + 1, updated_at = now() WHERE id = ${s.deal.listing_id}::uuid`;
    }
    if (s.active_quote_id) await tx.transportQuote.updateMany({ where: { id: s.active_quote_id, status: 'SELECTED' }, data: { status: 'FULFILLED' } });
    await skipDeadlines(tx, 'SHIPMENT', id, ['DELIVERED_UNCONFIRMED'], 'receipt confirmed');
    await shipmentEvent(tx, id, s.status, 'COMPLETED', actor, input.note ?? 'أكد المصنع الاستلام', { received_tons: input.received_tons ?? null });
    await audit(tx, actor, { action: 'RECEIPT_CONFIRMED', entityType: 'DEAL', entityId: s.deal_id, before: { status: s.deal.status }, after: { status: 'COMPLETED', received_tons: input.received_tons ?? null } });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id, s.carrier_org_id], {
      eventType: 'DEAL_COMPLETED',
      titleAr: `اكتملت الصفقة ${s.deal.reference}`,
      bodyAr: 'أكد المصنع استلام المادة وأُغلقت الصفقة.',
      entityType: 'DEAL',
      entityId: s.deal_id,
      linkPath: `/deals/${s.deal_id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/**
 * P-67 / BR-060..064: ONLY the mine of the deal extends the pickup deadline. No factory approval
 * (BR-063). Max 2 extensions, each ≤ 72h, only before deadline + grace, never after pickup.
 */
shipmentsRouter.post('/shipments/:id/extensions', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const a = auth(req);
  if (a.org && a.org.type !== 'MINE') throw new AppError(403, 'FORBIDDEN_ROLE', 'تمديد موعد الاستلام صلاحية المنجم وحده.');
  const input = parse(extensionSchema, req.body);
  const newDeadline = new Date(input.new_pickup_deadline_at);
  const ext = await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'MINE');
    if (['PICKED_UP', 'IN_TRANSIT', 'DELAYED', 'DELIVERED', 'COMPLETED'].includes(s.status)) {
      throw new AppError(409, 'SHIPMENT_ALREADY_PICKED_UP', 'لا يمكن التمديد بعد استلام الناقل للشحنة.');
    }
    requireStatus(s.status, ['SCHEDULED', 'READY_FOR_PICKUP', 'RECONFIRM_REQUIRED', 'PENDING_CARRIER']);
    if (s.deal.status !== 'PAID' || !s.pickup_deadline_at) {
      throw new AppError(409, 'INVALID_STATE', 'التمديد متاح بعد الدفع وتحديد موعد الاستلام.');
    }
    const policy = await policyById(tx, s.deal.policy_version_id);
    if (s.extension_count >= policy.max_shipment_extensions) {
      throw unprocessable('EXTENSION_LIMIT_REACHED', `استُخدم الحد الأقصى للتمديد (${policy.max_shipment_extensions}).`);
    }
    const current = s.pickup_deadline_at;
    if (now() >= addHours(current, policy.pickup_grace_period_hours)) {
      throw new AppError(409, 'DEADLINE_PASSED', 'انقضى موعد الاستلام ومهلة السماح؛ لم يعد التمديد ممكنًا.');
    }
    const diffMs = newDeadline.getTime() - current.getTime();
    if (diffMs <= 0 || diffMs > policy.max_extension_hours * HOUR) {
      throw unprocessable('EXTENSION_TOO_LONG', `الموعد الجديد يجب أن يكون بعد الموعد الحالي وبحد أقصى ${policy.max_extension_hours} ساعة.`, {
        current_deadline_at: current.toISOString(),
        max_new_deadline_at: addHours(current, policy.max_extension_hours).toISOString(),
      });
    }
    const hasCarrier = s.status !== 'PENDING_CARRIER' && !!s.carrier_org_id;
    let reconfirmAt: Date | null = null;
    if (hasCarrier) {
      // BR-064: min(now + 12h, new deadline − 2h); if already past, now + 1h.
      const a1 = addHours(now(), policy.carrier_reconfirm_window_hours);
      const a2 = addHours(newDeadline, -policy.carrier_reconfirm_lead_hours);
      reconfirmAt = a1 < a2 ? a1 : a2;
      if (reconfirmAt <= now()) reconfirmAt = addHours(now(), policy.carrier_reconfirm_min_hours);
    }
    await tx.shipmentExtension.updateMany({ where: { shipment_id: id, reconfirmation_status: 'PENDING' }, data: { reconfirmation_status: 'SUPERSEDED' } });
    const e = await tx.shipmentExtension.create({
      data: {
        shipment_id: id,
        sequence_no: s.extension_count + 1,
        previous_deadline_at: current,
        new_deadline_at: newDeadline,
        reason_code: input.reason_code,
        reason_text: input.reason_text,
        requested_by: auth(req).userId,
        affected_carrier_org_id: s.carrier_org_id,
        reconfirmation_status: hasCarrier ? 'PENDING' : 'NOT_REQUIRED',
        reconfirm_deadline_at: reconfirmAt,
      },
    });
    await tx.shipment.update({
      where: { id },
      data: {
        pickup_deadline_at: newDeadline,
        original_pickup_deadline_at: s.original_pickup_deadline_at ?? current,
        extension_count: { increment: 1 },
        ...(hasCarrier ? { status: 'RECONFIRM_REQUIRED', reconfirm_deadline_at: reconfirmAt } : {}),
        version: { increment: 1 },
      },
    });
    await scheduleDeadline(tx, 'SHIPMENT', id, 'PICKUP_DEADLINE', addHours(newDeadline, policy.pickup_grace_period_hours));
    if (hasCarrier && reconfirmAt) await scheduleDeadline(tx, 'SHIPMENT', id, 'CARRIER_RECONFIRM', reconfirmAt);
    await shipmentEvent(tx, id, s.status, hasCarrier ? 'RECONFIRM_REQUIRED' : s.status, actor, `تمديد ${e.sequence_no}: ${input.reason_text}`, {
      previous_deadline_at: current.toISOString(),
      new_deadline_at: newDeadline.toISOString(),
    });
    await audit(tx, actor, {
      action: 'SHIPMENT_EXTENDED',
      entityType: 'SHIPMENT',
      entityId: id,
      before: { pickup_deadline_at: current, extension_count: s.extension_count, status: s.status },
      after: { pickup_deadline_at: newDeadline, extension_count: s.extension_count + 1, reason_code: input.reason_code, reason_text: input.reason_text },
    });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id, s.carrier_org_id], {
      eventType: 'SHIPMENT_EXTENDED',
      titleAr: `مدّد المنجم موعد الاستلام ${s.deal.reference}`,
      bodyAr: hasCarrier ? 'مطلوب من الناقل إعادة تأكيد جاهزيته للموعد الجديد.' : 'الموعد الجديد سارٍ لإعادة الإسناد.',
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
    return e;
  });
  const body = await respond(req, id);
  return {
    status: 201,
    body: {
      extension: {
        sequence_no: ext.sequence_no,
        previous_deadline_at: ext.previous_deadline_at.toISOString(),
        new_deadline_at: ext.new_deadline_at.toISOString(),
        reconfirmation_status: ext.reconfirmation_status,
        reconfirm_deadline_at: ext.reconfirm_deadline_at?.toISOString() ?? null,
      },
      shipment: body,
    },
  };
}));

/** P-68: assigned carrier confirms or declines after an extension (no option to change the date). */
shipmentsRouter.post('/shipments/:id/reconfirm', idempotent(async (req) => {
  const id = idParam(req.params.id);
  const input = parse(reconfirmSchema, req.body);
  const declined = await transaction(async (tx) => {
    const { s, actor } = await lockShipmentFor(tx, req, id, 'CARRIER');
    requireStatus(s.status, ['RECONFIRM_REQUIRED']);
    if (s.reconfirm_deadline_at && now() >= s.reconfirm_deadline_at) {
      throw new AppError(409, 'RECONFIRM_WINDOW_CLOSED', 'انقضت مهلة إعادة التأكيد.');
    }
    if (input.decision === 'DECLINE') {
      await releaseCarrier(tx, id, 'DECLINED', actor, input.reason);
      return true;
    }
    await tx.shipment.update({ where: { id }, data: { status: 'SCHEDULED', reconfirm_deadline_at: null, version: { increment: 1 } } });
    await tx.shipmentExtension.updateMany({
      where: { shipment_id: id, reconfirmation_status: 'PENDING' },
      data: { reconfirmation_status: 'CONFIRMED', reconfirmed_at: now(), reconfirmed_by: auth(req).userId },
    });
    await skipDeadlines(tx, 'SHIPMENT', id, ['CARRIER_RECONFIRM'], 'reconfirmed');
    await shipmentEvent(tx, id, 'RECONFIRM_REQUIRED', 'SCHEDULED', actor, 'أكد الناقل جاهزيته للموعد الجديد');
    await audit(tx, actor, { action: 'CARRIER_RECONFIRMED', entityType: 'SHIPMENT', entityId: id, before: { status: 'RECONFIRM_REQUIRED' }, after: { status: 'SCHEDULED' } });
    await notifyOrgs(tx, [s.deal.factory_org_id, s.deal.mine_org_id], {
      eventType: 'CARRIER_RECONFIRMED',
      titleAr: `أكد الناقل الموعد الجديد ${s.deal.reference}`,
      bodyAr: 'الشحنة مجدولة على الموعد الممدد.',
      entityType: 'SHIPMENT',
      entityId: id,
      linkPath: `/shipments/${id}`,
    });
    return false;
  });
  if (declined) {
    // The carrier is no longer a party to the shipment, so it only receives the outcome.
    const s = await db().shipment.findUniqueOrThrow({ where: { id } });
    return { status: 200, body: { id, status: s.status, reassignment_deadline_at: s.reassignment_deadline_at?.toISOString() ?? null, released: true } };
  }
  return { status: 200, body: await respond(req, id) };
}));
