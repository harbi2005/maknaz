import { adminCancelDealSchema, cancelDealSchema, DEAL_STATUSES } from '@maknaz/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { db, lockRow, transaction } from '../../db.js';
import { auth, requireAdmin, requireOrg } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { idempotent } from '../../lib/idempotency.js';
import { AppError, notFound } from '../../lib/errors.js';
import { money, qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest } from '../audit/audit.js';
import { assertCancellableByParty, cancelDeal } from './deals.service.js';

export const dealsRouter = Router();

const DEAL_INCLUDE = {
  shipment: true,
  invoice: { include: { payments: true, refunds: true } },
  selected_quote: true,
  quotes: { select: { id: true, status: true, carrier_org_id: true } },
} satisfies Prisma.DealInclude;
type DealFull = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>;

const STAGES = ['AGREEMENT', 'CARRIER', 'PAYMENT', 'PREPARATION', 'TRANSPORT', 'RECEIPT'] as const;

/** RTL stage bar (SCR-DEAL-02): commercial agreement → carrier → payment → preparation → transport → receipt. */
function stageOf(d: DealFull): (typeof STAGES)[number] | 'DONE' | 'CANCELLED' {
  if (d.status === 'CANCELLED') return 'CANCELLED';
  if (d.status === 'COMPLETED') return 'DONE';
  if (d.status === 'PENDING_CARRIER' || d.status === 'PENDING_CARRIER_RETRY') return 'CARRIER';
  if (d.status === 'AWAITING_PAYMENT') return 'PAYMENT';
  const s = d.shipment?.status;
  if (s === 'DELIVERED') return 'RECEIPT';
  if (d.status === 'IN_FULFILLMENT') return 'TRANSPORT';
  return 'PREPARATION';
}

function nextDeadline(d: DealFull): { type: string; at: string } | null {
  const s = d.shipment;
  const pick = (type: string, at: Date | null | undefined) => (at && at > now() ? { type, at: at.toISOString() } : null);
  switch (d.status) {
    case 'PENDING_CARRIER':
      return pick('CARRIER_CONFIRMATION', d.carrier_deadline_at);
    case 'PENDING_CARRIER_RETRY':
      return pick('CARRIER_RETRY', d.retry_deadline_at);
    case 'AWAITING_PAYMENT':
      return pick('PAYMENT', d.payment_deadline_at);
    case 'PAID':
      if (s?.status === 'PENDING_CARRIER') return pick('REASSIGNMENT', s.reassignment_deadline_at);
      if (s?.status === 'RECONFIRM_REQUIRED') return pick('CARRIER_RECONFIRM', s.reconfirm_deadline_at);
      return pick('PICKUP', s?.pickup_deadline_at);
    case 'IN_FULFILLMENT':
      return pick('EXPECTED_DELIVERY', s?.expected_delivery_at);
    default:
      return null;
  }
}

async function names(ids: (string | null | undefined)[]) {
  const rows = await db().organization.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } }, select: { id: true, legal_name_ar: true, type: true } });
  return new Map(rows.map((r) => [r.id, r.legal_name_ar]));
}

export async function dealDto(d: DealFull, viewer: { orgId: string | null; isAdmin: boolean }) {
  const n = await names([d.factory_org_id, d.mine_org_id, d.shipment?.carrier_org_id]);
  const snap = d.commercial_snapshot as Record<string, unknown> & { listing: { title: string }; category: { name_ar: string; cargo_class: string }; mine: { name: string; region_code: string; lat: number; lng: number }; delivery_site: { name: string; region_code: string; lat: number; lng: number }; straight_line_km_mine_to_factory: string };
  const transport = d.selected_quote?.transport_total_halalas ?? null;
  const role = viewer.isAdmin ? 'ADMIN' : viewer.orgId === d.factory_org_id ? 'FACTORY' : viewer.orgId === d.mine_org_id ? 'MINE' : 'CARRIER';
  const submittedQuotes = d.quotes.filter((q) => q.status === 'SUBMITTED').length;
  const s = d.shipment;
  const awaitingAdjustment = d.invoice ? await pendingAdjustment(d.invoice.id) : null;
  return {
    id: d.id,
    reference: d.reference,
    status: d.status,
    stage: stageOf(d),
    viewer_role: role,
    parties: {
      factory: { id: d.factory_org_id, name_ar: n.get(d.factory_org_id) ?? null },
      mine: { id: d.mine_org_id, name_ar: n.get(d.mine_org_id) ?? null },
      carrier: s?.carrier_org_id ? { id: s.carrier_org_id, name_ar: n.get(s.carrier_org_id) ?? null } : null,
    },
    material: { title: snap.listing.title, category_name: snap.category.name_ar, cargo_class: snap.category.cargo_class, listing_id: d.listing_id },
    route: {
      mine: snap.mine,
      delivery_site: snap.delivery_site,
      straight_line_km: snap.straight_line_km_mine_to_factory,
      distance_label: 'مسافة مباشرة تقريبية',
      route_distance_km: d.selected_quote?.route_distance_km.toFixed(1) ?? null,
    },
    commercial: {
      quantity_tons: qty(d.quantity_tons),
      unit_price: money(d.unit_price_halalas),
      material_total: money(d.material_total_halalas),
      specifications_at_agreement: (snap as { specifications?: unknown[] }).specifications ?? [],
    },
    transport: transport != null ? { total: money(transport), quote_id: d.selected_quote_id } : null,
    grand_total: transport != null ? money(d.material_total_halalas + transport) : null,
    loading_window: { start: d.loading_window_start.toISOString(), end: d.loading_window_end.toISOString() },
    deadlines: {
      carrier_deadline_at: d.carrier_deadline_at.toISOString(),
      retry_deadline_at: d.retry_deadline_at?.toISOString() ?? null,
      payment_deadline_at: d.payment_deadline_at?.toISOString() ?? null,
      next: nextDeadline(d),
    },
    quotes_summary: { submitted: submittedQuotes, total: d.quotes.length },
    shipment: s
      ? {
          id: s.id,
          status: s.status,
          planned_pickup_at: s.planned_pickup_at?.toISOString() ?? null,
          pickup_deadline_at: s.pickup_deadline_at?.toISOString() ?? null,
          reassignment_deadline_at: s.reassignment_deadline_at?.toISOString() ?? null,
        }
      : null,
    invoice: d.invoice
      ? {
          id: d.invoice.id,
          reference: d.invoice.reference,
          payment_status: d.invoice.payment_status,
          grand_total: money(d.invoice.grand_total_halalas),
          payment_deadline_at: d.invoice.payment_deadline_at.toISOString(),
          pending_adjustment: awaitingAdjustment,
        }
      : null,
    cancellation: d.status === 'CANCELLED'
      ? { reason: d.cancellation_reason, note: d.cancellation_note, fault_party: d.cancellation_fault_party, cancelled_at: d.cancelled_at?.toISOString() ?? null }
      : null,
    actions: {
      can_cancel: (role === 'FACTORY' || role === 'MINE') && ['PENDING_CARRIER', 'PENDING_CARRIER_RETRY', 'AWAITING_PAYMENT'].includes(d.status),
      can_select_quote: role === 'FACTORY' && (['PENDING_CARRIER', 'PENDING_CARRIER_RETRY'].includes(d.status) || (d.status === 'PAID' && s?.status === 'PENDING_CARRIER')),
      can_pay: role === 'FACTORY' && d.status === 'AWAITING_PAYMENT',
      can_admin_cancel: role === 'ADMIN' && !['COMPLETED', 'CANCELLED', 'IN_FULFILLMENT'].includes(d.status),
    },
    simulation: true,
    agreed_at: d.agreed_at.toISOString(),
    confirmed_at: d.confirmed_at?.toISOString() ?? null,
    paid_at: d.paid_at?.toISOString() ?? null,
    completed_at: d.completed_at?.toISOString() ?? null,
    offer_id: d.offer_id,
  };
}

async function pendingAdjustment(invoiceId: string) {
  const items = await db().invoiceItem.findMany({ where: { invoice_id: invoiceId, item_type: 'ADJUSTMENT' }, include: { payments: true } });
  const unpaid = items.find((i) => i.line_total_halalas > 0n && !i.payments.some((p) => p.status === 'COMPLETED'));
  return unpaid ? { invoice_item_id: unpaid.id, amount: money(unpaid.line_total_halalas) } : null;
}

const listQuery = z.object({
  'filter[status]': z.enum(DEAL_STATUSES).optional(),
  'filter[group]': z.enum(['active', 'completed', 'cancelled']).optional(),
});

function groupWhere(group?: string): Prisma.DealWhereInput {
  if (group === 'completed') return { status: 'COMPLETED' };
  if (group === 'cancelled') return { status: 'CANCELLED' };
  if (group === 'active') return { status: { notIn: ['COMPLETED', 'CANCELLED'] } };
  return {};
}

/** P-40 list: deals where the organization is a party (the carrier only once assigned). */
dealsRouter.get('/deals', async (req, res) => {
  const org = requireOrg(req);
  const q = parse(listQuery, req.query);
  const partyWhere: Prisma.DealWhereInput =
    org.type === 'FACTORY' ? { factory_org_id: org.id } : org.type === 'MINE' ? { mine_org_id: org.id } : { shipment: { carrier_org_id: org.id } };
  const rows = await db().deal.findMany({
    where: { ...partyWhere, ...groupWhere(q['filter[group]']), ...(q['filter[status]'] ? { status: q['filter[status]'] } : {}) },
    include: DEAL_INCLUDE,
    orderBy: { updated_at: 'desc' },
    take: 200,
  });
  res.json({ data: await Promise.all(rows.map((d) => dealDto(d, { orgId: org.id, isAdmin: false }))) });
});

async function loadDeal(req: Request, id: string) {
  const a = auth(req);
  const d = await db().deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
  if (!d) throw notFound();
  const party = a.isPlatformAdmin || a.org?.id === d.factory_org_id || a.org?.id === d.mine_org_id || (!!a.org && a.org.id === d.shipment?.carrier_org_id);
  if (!party) throw notFound();
  return { d, a };
}

dealsRouter.get('/deals/:id', async (req, res) => {
  const { d, a } = await loadDeal(req, idParam(req.params.id));
  res.json(await dealDto(d, { orgId: a.org?.id ?? null, isAdmin: a.isPlatformAdmin }));
});

/** P-41: factory or mine cancel before payment; afterwards only the admin (OD-08). */
dealsRouter.post('/deals/:id/cancel', idempotent(async (req) => {
  const org = requireOrg(req, 'FACTORY', 'MINE');
  const id = idParam(req.params.id);
  const { reason_text } = parse(cancelDealSchema, req.body);
  await transaction(async (tx) => {
    if (!(await lockRow(tx, 'deals', id))) throw notFound();
    const d = await tx.deal.findUniqueOrThrow({ where: { id } });
    if (d.factory_org_id !== org.id && d.mine_org_id !== org.id) throw notFound();
    assertCancellableByParty(d.status);
    const isFactory = org.type === 'FACTORY';
    const ok = await cancelDeal(tx, id, isFactory ? 'CANCELLED_BY_FACTORY' : 'CANCELLED_BY_MINE', actorFromRequest(req), {
      note: reason_text,
      faultParty: isFactory ? 'FACTORY' : 'MINE',
    });
    if (!ok) throw new AppError(409, 'STATE_CONFLICT', 'تغيرت حالة الصفقة؛ أعد تحميل الصفحة.', { retryable: true });
  });
  const { d, a } = await loadDeal(req, id);
  return { status: 200, body: await dealDto(d, { orgId: a.org?.id ?? null, isAdmin: false }) };
}));

// ─── admin oversight (SCR-ADM-03) ───────────────────────────────────────

dealsRouter.get('/admin/deals', async (req, res) => {
  requireAdmin(req);
  const q = parse(listQuery, req.query);
  const rows = await db().deal.findMany({
    where: { ...groupWhere(q['filter[group]']), ...(q['filter[status]'] ? { status: q['filter[status]'] } : {}) },
    include: DEAL_INCLUDE,
    orderBy: { updated_at: 'desc' },
    take: 300,
  });
  res.json({ data: await Promise.all(rows.map((d) => dealDto(d, { orgId: null, isAdmin: true }))) });
});

/** Admin cancellation before pickup with a mandatory reason and fault party (P-41). */
dealsRouter.post('/admin/deals/:id/cancel', idempotent(async (req) => {
  requireAdmin(req);
  const id = idParam(req.params.id);
  const input = parse(adminCancelDealSchema, req.body);
  await transaction(async (tx) => {
    if (!(await lockRow(tx, 'deals', id))) throw notFound();
    const ok = await cancelDeal(tx, id, 'ADMIN_CANCELLED', actorFromRequest(req), { note: input.reason_text, faultParty: input.fault_party });
    if (!ok) throw new AppError(409, 'INVALID_STATE', 'لا يمكن إلغاء الصفقة في حالتها الحالية (بعد الاستلام لا يوجد مسار إلغاء).');
  });
  const { d } = await loadDeal(req, id);
  return { status: 200, body: await dealDto(d, { orgId: null, isAdmin: true }) };
}));

/** Basic operational report + "needs attention" queue (SCR-ADM-03). */
dealsRouter.get('/admin/attention', async (req, res) => {
  requireAdmin(req);
  const policy = (await db().systemPolicyVersion.findFirst({ where: { is_current: true } }))?.values as { delivered_unconfirmed_alert_hours?: number } | undefined;
  const alertHours = policy?.delivered_unconfirmed_alert_hours ?? 72;
  const [byStatus, delayed, unconfirmed, failedJobs, suspendedWithDeals, pendingOrgs, reviewQuotes, totals] = await Promise.all([
    db().deal.groupBy({ by: ['status'], _count: { _all: true } }),
    db().shipment.findMany({ where: { status: 'DELAYED' }, include: { deal: { select: { id: true, reference: true } } } }),
    db().shipment.findMany({
      where: { status: 'DELIVERED', delivered_at: { lt: new Date(now().getTime() - alertHours * 3_600_000) } },
      include: { deal: { select: { id: true, reference: true } } },
    }),
    db().scheduledDeadline.findMany({ where: { status: 'FAILED' }, orderBy: { due_at: 'desc' }, take: 50 }),
    db().organization.findMany({ where: { status: 'SUSPENDED' } }),
    db().organization.count({ where: { status: 'PENDING_REVIEW' } }),
    db().transportQuote.findMany({ where: { needs_admin_review: true, status: { in: ['SUBMITTED', 'SELECTED'] } }, select: { id: true, deal_id: true, route_distance_km: true, straight_line_km_mine_to_factory: true } }),
    db().deal.aggregate({ where: { status: 'COMPLETED' }, _sum: { quantity_tons: true, material_total_halalas: true }, _count: { _all: true } }),
  ]);
  const suspended = [];
  for (const o of suspendedWithDeals) {
    const deals = await db().deal.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, OR: [{ factory_org_id: o.id }, { mine_org_id: o.id }, { shipment: { carrier_org_id: o.id } }] },
      select: { id: true, reference: true, status: true },
    });
    if (deals.length) suspended.push({ organization: { id: o.id, name_ar: o.legal_name_ar }, deals });
  }
  res.json({
    deals_by_status: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    completed_totals: {
      deals: totals._count._all,
      tons: totals._sum.quantity_tons?.toFixed(3) ?? '0.000',
      material_value: money(totals._sum.material_total_halalas ?? 0n),
    },
    pending_organizations: pendingOrgs,
    delayed_shipments: delayed.map((s) => ({ shipment_id: s.id, deal: s.deal, expected_delivery_at: s.expected_delivery_at?.toISOString() ?? null })),
    delivered_unconfirmed: unconfirmed.map((s) => ({ shipment_id: s.id, deal: s.deal, delivered_at: s.delivered_at?.toISOString() ?? null })),
    failed_jobs: failedJobs.map((j) => ({ id: j.id, entity_type: j.entity_type, entity_id: j.entity_id, deadline_type: j.deadline_type, last_error: j.last_error })),
    suspended_with_open_deals: suspended,
    route_distance_reviews: reviewQuotes.map((q) => ({ quote_id: q.id, deal_id: q.deal_id, route_km: q.route_distance_km.toFixed(1), straight_km: q.straight_line_km_mine_to_factory.toFixed(1) })),
  });
});
