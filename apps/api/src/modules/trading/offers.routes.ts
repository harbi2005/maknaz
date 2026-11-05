import {
  acceptOfferSchema,
  counterOfferSchema,
  createOfferSchema,
  haversineKm,
  OFFER_STATUSES,
  respondNoteSchema,
  round1,
  STRAIGHT_LINE_LABEL,
} from '@maknaz/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type OfferNegotiationRound, type PurchaseOffer } from '../../generated/prisma/client.js';
import { db, transaction } from '../../db.js';
import { auth, requireActiveOrg, requireOrg } from '../../lib/context.js';
import { addHours, now } from '../../lib/clock.js';
import { idempotent } from '../../lib/idempotency.js';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { nextReference } from '../../lib/references.js';
import { money, num, qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import { currentPolicy } from '../policy/policy.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { assertLoadingWindow, createDealFromAgreement, expireRound, lockPendingRound } from './offers.service.js';

export const offersRouter = Router();

const roundDto = (r: OfferNegotiationRound) => ({
  id: r.id,
  round_no: r.round_no,
  proposed_by: r.proposed_by,
  quantity_tons: qty(r.quantity),
  unit_price: money(r.unit_price_halalas),
  material_value: money(BigInt(r.quantity.times(r.unit_price_halalas.toString()).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0))),
  loading_window_start: r.loading_window_start?.toISOString() ?? null,
  loading_window_end: r.loading_window_end?.toISOString() ?? null,
  message: r.message,
  status: r.status,
  expires_at: r.expires_at.toISOString(),
  responded_at: r.responded_at?.toISOString() ?? null,
  response_note: r.response_note,
  created_at: r.created_at.toISOString(),
});

type OfferFull = PurchaseOffer & {
  rounds: OfferNegotiationRound[];
  listing: { id: string; title: string; status: string; mine: { name: string; region_code: string; lat: Prisma.Decimal; lng: Prisma.Decimal }; total_quantity: Prisma.Decimal; reserved_quantity: Prisma.Decimal; sold_quantity: Prisma.Decimal; asking_price_halalas: bigint };
  delivery_site: { id: string; name: string; region_code: string; lat: Prisma.Decimal; lng: Prisma.Decimal };
  deal: { id: string; reference: string; status: string } | null;
};

async function orgNames(ids: string[]) {
  const rows = await db().organization.findMany({ where: { id: { in: ids } }, select: { id: true, legal_name_ar: true } });
  return new Map(rows.map((r) => [r.id, r.legal_name_ar]));
}

function offerDto(o: OfferFull, names: Map<string, string>) {
  const rounds = [...o.rounds].sort((a, b) => a.round_no - b.round_no);
  const current = rounds.find((r) => r.status === 'PENDING') ?? rounds[rounds.length - 1]!;
  const mine = { lat: num(o.listing.mine.lat)!, lng: num(o.listing.mine.lng)! };
  const site = { lat: num(o.delivery_site.lat)!, lng: num(o.delivery_site.lng)! };
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    listing: {
      id: o.listing.id,
      title: o.listing.title,
      status: o.listing.status,
      mine_name: o.listing.mine.name,
      mine_region: o.listing.mine.region_code,
      available: o.listing.total_quantity.minus(o.listing.reserved_quantity).minus(o.listing.sold_quantity).toFixed(3),
      asking_price: money(o.listing.asking_price_halalas),
    },
    factory: { id: o.factory_org_id, name_ar: names.get(o.factory_org_id) ?? null },
    mine_org: { id: o.mine_org_id, name_ar: names.get(o.mine_org_id) ?? null },
    delivery_site: { id: o.delivery_site.id, name: o.delivery_site.name, region_code: o.delivery_site.region_code },
    distance: { straight_line_km: round1(haversineKm(mine, site)).toFixed(1), label: STRAIGHT_LINE_LABEL },
    current_round: roundDto(current),
    rounds: rounds.map(roundDto),
    deal: o.deal,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}

const OFFER_INCLUDE = {
  rounds: true,
  listing: { include: { mine: true } },
  delivery_site: true,
  deal: { select: { id: true, reference: true, status: true } },
} as const;

/** Party check (P-31): the factory that sent it or the mine org that received it; else 404. */
async function loadOfferForParty(req: Request, id: string): Promise<OfferFull> {
  const a = auth(req);
  const o = await db().purchaseOffer.findUnique({ where: { id }, include: OFFER_INCLUDE });
  if (!o) throw notFound();
  if (!a.isPlatformAdmin && a.org?.id !== o.factory_org_id && a.org?.id !== o.mine_org_id) throw notFound();
  return o as OfferFull;
}

async function respond(req: Request, id: string) {
  const o = await loadOfferForParty(req, id);
  return offerDto(o, await orgNames([o.factory_org_id, o.mine_org_id]));
}

/** P-30 / BR-020 / BR-021: factory submits round 1; no reservation yet (BR-027). */
offersRouter.post('/offers', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'FACTORY');
  const input = parse(createOfferSchema, req.body);
  const quantity = new Prisma.Decimal(input.quantity_tons);
  const offerId = await transaction(async (tx) => {
    const listing = await tx.materialListing.findUnique({ where: { id: input.listing_id }, include: { mine: { include: { organization: true } } } });
    if (!listing || listing.status !== 'ACTIVE' || listing.mine.organization.status !== 'ACTIVE') throw notFound();
    const site = await tx.factorySite.findFirst({ where: { id: input.delivery_site_id, organization_id: org.id, status: 'ACTIVE' } });
    if (!site) throw unprocessable('VALIDATION_FAILED', 'اختر موقع تسليم تابعًا لجهتك.');
    const avail = listing.total_quantity.minus(listing.reserved_quantity).minus(listing.sold_quantity);
    if (quantity.gt(avail)) {
      throw unprocessable('QUANTITY_EXCEEDS_AVAILABLE', 'الكمية المطلوبة أكبر من المتاح حاليًا.', { available: avail.toFixed(3) });
    }
    const open = await tx.purchaseOffer.findFirst({ where: { listing_id: listing.id, factory_org_id: org.id, status: { in: ['SUBMITTED', 'COUNTERED'] } } });
    if (open) throw conflict('OPEN_OFFER_EXISTS', 'لديك عرض شراء مفتوح على هذه المادة بالفعل.', { offer_id: open.id });
    const policy = await currentPolicy(tx);
    const offer = await tx.purchaseOffer.create({
      data: {
        reference: await nextReference(tx, 'OFR'),
        listing_id: listing.id,
        factory_org_id: org.id,
        mine_org_id: listing.organization_id,
        delivery_site_id: site.id,
        created_by: auth(req).userId,
      },
    });
    const round = await tx.offerNegotiationRound.create({
      data: {
        offer_id: offer.id,
        round_no: 1,
        proposed_by: 'FACTORY',
        quantity,
        unit_price_halalas: BigInt(input.unit_price_halalas),
        message: input.message ?? null,
        expires_at: addHours(now(), policy.values.offer_round_validity_hours),
        created_by: auth(req).userId,
      },
    });
    await scheduleDeadline(tx, 'OFFER_ROUND', round.id, 'OFFER_ROUND', round.expires_at);
    await audit(tx, actorFromRequest(req), {
      action: 'OFFER_SUBMITTED',
      entityType: 'OFFER',
      entityId: offer.id,
      after: { reference: offer.reference, quantity_tons: quantity, unit_price_halalas: round.unit_price_halalas },
    });
    await notifyOrgs(tx, [listing.organization_id], {
      eventType: 'OFFER_SUBMITTED',
      titleAr: `عرض شراء جديد ${offer.reference}`,
      bodyAr: `${quantity.toFixed(3)} طن على «${listing.title}». المهلة 48 ساعة.`,
      entityType: 'OFFER',
      entityId: offer.id,
      linkPath: `/offers/${offer.id}`,
    });
    return offer.id;
  });
  return { status: 201, body: await respond(req, offerId) };
}));

const listQuery = z.object({
  'filter[status]': z.enum(OFFER_STATUSES).optional(),
  'filter[open]': z.enum(['true']).optional(),
});

offersRouter.get('/offers', async (req, res) => {
  const org = requireOrg(req, 'FACTORY', 'MINE');
  const q = parse(listQuery, req.query);
  const rows = await db().purchaseOffer.findMany({
    where: {
      ...(org.type === 'FACTORY' ? { factory_org_id: org.id } : { mine_org_id: org.id }),
      ...(q['filter[status]'] ? { status: q['filter[status]'] } : {}),
      ...(q['filter[open]'] ? { status: { in: ['SUBMITTED', 'COUNTERED'] } } : {}),
    },
    include: OFFER_INCLUDE,
    orderBy: { updated_at: 'desc' },
    take: 200,
  });
  const names = await orgNames([...new Set(rows.flatMap((r) => [r.factory_org_id, r.mine_org_id]))]);
  res.json({ data: rows.map((r) => offerDto(r as OfferFull, names)) });
});

offersRouter.get('/offers/:id', async (req, res) => {
  res.json(await respond(req, idParam(req.params.id)));
});

/** Ownership for writes: the acting org must be the right party, else 404 (SEC-02). */
async function assertParty(req: Request, id: string, party: 'FACTORY' | 'MINE') {
  const org = requireActiveOrg(req, party);
  const o = await db().purchaseOffer.findUnique({ where: { id } });
  if (!o || (party === 'FACTORY' ? o.factory_org_id : o.mine_org_id) !== org.id) throw notFound();
  return o;
}

async function handleExpired(roundId: string, req: Request) {
  await transaction((tx) => expireRound(tx, roundId, actorFromRequest(req)));
  throw new AppError(409, 'ROUND_EXPIRED', 'انتهت صلاحية هذه الجولة؛ لم يعد بالإمكان قبولها.');
}

/** P-32: factory withdraws while SUBMITTED. */
offersRouter.post('/offers/:id/withdraw', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'FACTORY');
  await transaction(async (tx) => {
    const { offer, round } = await lockPendingRound(tx, id, 'SUBMITTED', actorFromRequest(req));
    await tx.offerNegotiationRound.update({ where: { id: round.id }, data: { status: 'WITHDRAWN', responded_at: now(), responded_by: auth(req).userId } });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    await skipDeadlines(tx, 'OFFER_ROUND', round.id, ['OFFER_ROUND']);
    await audit(tx, actorFromRequest(req), { action: 'OFFER_WITHDRAWN', entityType: 'OFFER', entityId: id, before: { status: offer.status }, after: { status: 'WITHDRAWN' } });
    await notifyOrgs(tx, [offer.mine_org_id], {
      eventType: 'OFFER_WITHDRAWN',
      titleAr: `سحب المصنع عرض الشراء ${offer.reference}`,
      bodyAr: 'لم يعد العرض بحاجة إلى رد.',
      entityType: 'OFFER',
      entityId: id,
      linkPath: `/offers/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/** P-33: mine accepts round 1 → reservation + deal (BR-027/028). */
offersRouter.post('/offers/:id/accept', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'MINE');
  const input = parse(acceptOfferSchema, req.body);
  const start = new Date(input.loading_window_start);
  const end = new Date(input.loading_window_end);
  const policy = await currentPolicy();
  assertLoadingWindow(start, end, policy.values.min_loading_lead_hours);
  const result = await transaction(async (tx) => {
    const g = await lockPendingRound(tx, id, 'SUBMITTED', actorFromRequest(req));
    if (g.expired) return { expiredRound: g.round.id };
    await tx.offerNegotiationRound.update({
      where: { id: g.round.id },
      data: { status: 'ACCEPTED', responded_at: now(), responded_by: auth(req).userId, loading_window_start: undefined },
    });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'ACCEPTED' } });
    await skipDeadlines(tx, 'OFFER_ROUND', g.round.id, ['OFFER_ROUND']);
    await audit(tx, actorFromRequest(req), { action: 'OFFER_ACCEPTED', entityType: 'OFFER', entityId: id, before: { status: 'SUBMITTED' }, after: { status: 'ACCEPTED', round_no: 1 } });
    const deal = await createDealFromAgreement(tx, {
      offerId: id,
      roundId: g.round.id,
      quantity: g.round.quantity,
      unitPriceHalalas: g.round.unit_price_halalas,
      loadingWindowStart: start,
      loadingWindowEnd: end,
      actor: actorFromRequest(req),
    });
    return { deal };
  });
  if ('expiredRound' in result) await handleExpired(result.expiredRound!, req);
  const deal = (result as { deal: { id: string; reference: string; status: string; carrier_deadline_at: Date } }).deal;
  return {
    status: 201,
    body: { deal: { id: deal.id, reference: deal.reference, status: deal.status, carrier_deadline_at: deal.carrier_deadline_at.toISOString() }, offer: await respond(req, id) },
  };
}));

/** P-34: mine rejects round 1. */
offersRouter.post('/offers/:id/reject', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'MINE');
  const { note } = parse(respondNoteSchema, req.body);
  await transaction(async (tx) => {
    const { offer, round } = await lockPendingRound(tx, id, 'SUBMITTED', actorFromRequest(req));
    await tx.offerNegotiationRound.update({ where: { id: round.id }, data: { status: 'REJECTED', responded_at: now(), responded_by: auth(req).userId, response_note: note ?? null } });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'REJECTED' } });
    await skipDeadlines(tx, 'OFFER_ROUND', round.id, ['OFFER_ROUND']);
    await audit(tx, actorFromRequest(req), { action: 'OFFER_REJECTED', entityType: 'OFFER', entityId: id, before: { status: 'SUBMITTED' }, after: { status: 'REJECTED', note } });
    await notifyOrgs(tx, [offer.factory_org_id], {
      eventType: 'OFFER_REJECTED',
      titleAr: `رفض المنجم عرض الشراء ${offer.reference}`,
      bodyAr: note ? `ملاحظة المنجم: ${note}` : 'يمكنك تقديم عرض جديد على المادة.',
      entityType: 'OFFER',
      entityId: id,
      linkPath: `/offers/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));

/** P-35 / BR-022: one counter-offer, different price, quantity may only decrease. */
offersRouter.post('/offers/:id/counter', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'MINE');
  const input = parse(counterOfferSchema, req.body);
  const start = new Date(input.loading_window_start);
  const end = new Date(input.loading_window_end);
  const policy = await currentPolicy();
  assertLoadingWindow(start, end, policy.values.min_loading_lead_hours);
  const result = await transaction(async (tx) => {
    const g = await lockPendingRound(tx, id, 'SUBMITTED', actorFromRequest(req));
    if (g.expired) return { expiredRound: g.round.id };
    const existing2 = await tx.offerNegotiationRound.count({ where: { offer_id: id, round_no: 2 } });
    if (existing2 > 0) throw conflict('COUNTER_ALREADY_SENT', 'أُرسل عرض مقابل لهذا العرض من قبل.');
    const qty2 = new Prisma.Decimal(input.quantity_tons);
    if (BigInt(input.unit_price_halalas) === g.round.unit_price_halalas) {
      throw unprocessable('COUNTER_PRICE_UNCHANGED', 'العرض المقابل يجب أن يكون بسعر مختلف عن سعر المصنع.');
    }
    if (qty2.gt(g.round.quantity)) {
      throw unprocessable('QUANTITY_EXCEEDS_ORIGINAL', 'يجوز خفض الكمية في العرض المقابل ولا يجوز زيادتها.', { max: g.round.quantity.toFixed(3) });
    }
    await tx.offerNegotiationRound.update({ where: { id: g.round.id }, data: { status: 'COUNTERED', responded_at: now(), responded_by: auth(req).userId } });
    const r2 = await tx.offerNegotiationRound.create({
      data: {
        offer_id: id,
        round_no: 2,
        proposed_by: 'MINE',
        quantity: qty2,
        unit_price_halalas: BigInt(input.unit_price_halalas),
        loading_window_start: start,
        loading_window_end: end,
        message: input.message ?? null,
        expires_at: addHours(now(), policy.values.offer_round_validity_hours),
        created_by: auth(req).userId,
      },
    });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'COUNTERED' } });
    await skipDeadlines(tx, 'OFFER_ROUND', g.round.id, ['OFFER_ROUND']);
    await scheduleDeadline(tx, 'OFFER_ROUND', r2.id, 'OFFER_ROUND', r2.expires_at);
    await audit(tx, actorFromRequest(req), {
      action: 'OFFER_COUNTERED',
      entityType: 'OFFER',
      entityId: id,
      before: { status: 'SUBMITTED', unit_price_halalas: g.round.unit_price_halalas, quantity: g.round.quantity },
      after: { status: 'COUNTERED', unit_price_halalas: r2.unit_price_halalas, quantity: r2.quantity },
    });
    await notifyOrgs(tx, [g.offer.factory_org_id], {
      eventType: 'OFFER_COUNTERED',
      titleAr: `عرض مقابل من المنجم ${g.offer.reference}`,
      bodyAr: 'راجع السعر والكمية ونافذة التحميل، ثم اقبل أو ارفض خلال 48 ساعة.',
      entityType: 'OFFER',
      entityId: id,
      linkPath: `/offers/${id}`,
    });
    return { ok: true };
  });
  if ('expiredRound' in result) await handleExpired(result.expiredRound!, req);
  return { status: 201, body: await respond(req, id) };
}));

/** P-36 accept: factory accepts the counter-offer → reservation + deal with round-2 window. */
offersRouter.post('/offers/:id/counter/accept', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'FACTORY');
  const result = await transaction(async (tx) => {
    const g = await lockPendingRound(tx, id, 'COUNTERED', actorFromRequest(req));
    if (g.expired) return { expiredRound: g.round.id };
    await tx.offerNegotiationRound.update({ where: { id: g.round.id }, data: { status: 'ACCEPTED', responded_at: now(), responded_by: auth(req).userId } });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'ACCEPTED' } });
    await skipDeadlines(tx, 'OFFER_ROUND', g.round.id, ['OFFER_ROUND']);
    await audit(tx, actorFromRequest(req), { action: 'OFFER_ACCEPTED', entityType: 'OFFER', entityId: id, before: { status: 'COUNTERED' }, after: { status: 'ACCEPTED', round_no: 2 } });
    const deal = await createDealFromAgreement(tx, {
      offerId: id,
      roundId: g.round.id,
      quantity: g.round.quantity,
      unitPriceHalalas: g.round.unit_price_halalas,
      loadingWindowStart: g.round.loading_window_start!,
      loadingWindowEnd: g.round.loading_window_end!,
      actor: actorFromRequest(req),
    });
    return { deal };
  });
  if ('expiredRound' in result) await handleExpired(result.expiredRound!, req);
  const deal = (result as { deal: { id: string; reference: string; status: string; carrier_deadline_at: Date } }).deal;
  return {
    status: 201,
    body: { deal: { id: deal.id, reference: deal.reference, status: deal.status, carrier_deadline_at: deal.carrier_deadline_at.toISOString() }, offer: await respond(req, id) },
  };
}));

/** P-36 reject: factory rejects the counter-offer; it may submit a new offer afterwards (BR-023). */
offersRouter.post('/offers/:id/counter/reject', idempotent(async (req) => {
  const id = idParam(req.params.id);
  await assertParty(req, id, 'FACTORY');
  const { note } = parse(respondNoteSchema, req.body);
  await transaction(async (tx) => {
    const { offer, round } = await lockPendingRound(tx, id, 'COUNTERED', actorFromRequest(req));
    await tx.offerNegotiationRound.update({ where: { id: round.id }, data: { status: 'REJECTED', responded_at: now(), responded_by: auth(req).userId, response_note: note ?? null } });
    await tx.purchaseOffer.update({ where: { id }, data: { status: 'REJECTED' } });
    await skipDeadlines(tx, 'OFFER_ROUND', round.id, ['OFFER_ROUND']);
    await audit(tx, actorFromRequest(req), { action: 'OFFER_REJECTED', entityType: 'OFFER', entityId: id, before: { status: 'COUNTERED' }, after: { status: 'REJECTED', note } });
    await notifyOrgs(tx, [offer.mine_org_id], {
      eventType: 'OFFER_REJECTED',
      titleAr: `رفض المصنع العرض المقابل ${offer.reference}`,
      bodyAr: note ? `ملاحظة المصنع: ${note}` : 'انتهى التفاوض على هذا العرض.',
      entityType: 'OFFER',
      entityId: id,
      linkPath: `/offers/${id}`,
    });
  });
  return { status: 200, body: await respond(req, id) };
}));
