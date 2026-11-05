import { haversineKm, round1 } from '@maknaz/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { lockRow, type Tx } from '../../db.js';
import { addHours, now } from '../../lib/clock.js';
import { AppError, conflict, notFound, stateConflict, unprocessable } from '../../lib/errors.js';
import { nextReference } from '../../lib/references.js';
import { num } from '../../lib/serialize.js';
import { audit, type Actor } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import { currentPolicy } from '../policy/policy.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { notifyEligibleCarriers } from '../matching/matching.service.js';

const OPEN = ['SUBMITTED', 'COUNTERED'];

/**
 * BR-016: when a listing is deactivated or archived, open offers expire with reason
 * LISTING_INACTIVE; existing deals are untouched.
 */
export async function expireOpenOffersForListing(tx: Tx, listingId: string, actor: Actor) {
  const offers = await tx.purchaseOffer.findMany({ where: { listing_id: listingId, status: { in: OPEN } } });
  for (const o of offers) {
    await tx.offerNegotiationRound.updateMany({
      where: { offer_id: o.id, status: 'PENDING' },
      data: { status: 'EXPIRED', responded_at: now(), response_note: 'LISTING_INACTIVE' },
    });
    await tx.purchaseOffer.update({ where: { id: o.id }, data: { status: 'EXPIRED' } });
    await audit(tx, actor, {
      action: 'OFFER_EXPIRED',
      entityType: 'OFFER',
      entityId: o.id,
      before: { status: o.status },
      after: { status: 'EXPIRED', reason: 'LISTING_INACTIVE' },
    });
    await notifyOrgs(tx, [o.factory_org_id, o.mine_org_id], {
      eventType: 'OFFER_EXPIRED',
      titleAr: `انتهى عرض الشراء ${o.reference}`,
      bodyAr: 'أوقف المنجم عرض المادة، فانتهت عروض الشراء المفتوحة عليه.',
      entityType: 'OFFER',
      entityId: o.id,
      linkPath: `/offers/${o.id}`,
    });
  }
}

/** Expires a single round + its offer (deadline job or lazily on a late accept, BR-024). */
export async function expireRound(tx: Tx, roundId: string, actor: Actor): Promise<boolean> {
  const round = await tx.offerNegotiationRound.findUnique({ where: { id: roundId }, include: { offer: true } });
  if (!round || round.status !== 'PENDING') return false;
  const r = await tx.offerNegotiationRound.updateMany({
    where: { id: roundId, status: 'PENDING' },
    data: { status: 'EXPIRED', responded_at: now() },
  });
  if (r.count === 0) return false;
  await tx.purchaseOffer.updateMany({ where: { id: round.offer_id, status: { in: OPEN } }, data: { status: 'EXPIRED' } });
  await audit(tx, actor, {
    action: 'OFFER_EXPIRED',
    entityType: 'OFFER',
    entityId: round.offer_id,
    before: { status: round.offer.status, round_no: round.round_no },
    after: { status: 'EXPIRED' },
  });
  await notifyOrgs(tx, [round.offer.factory_org_id, round.offer.mine_org_id], {
    eventType: 'OFFER_EXPIRED',
    titleAr: `انتهت صلاحية عرض الشراء ${round.offer.reference}`,
    bodyAr: 'انقضت مهلة الرد على الجولة الحالية دون قرار.',
    entityType: 'OFFER',
    entityId: round.offer_id,
    linkPath: `/offers/${round.offer_id}`,
  });
  return true;
}

export interface AgreementInput {
  offerId: string;
  roundId: string;
  quantity: Prisma.Decimal;
  unitPriceHalalas: bigint;
  loadingWindowStart: Date;
  loadingWindowEnd: Date;
  actor: Actor;
}

/**
 * Commercial agreement (TRANSACTION_STATE_MACHINE §3 first row): atomic conditional
 * reservation (BR-028, ADR-007) then deal + reservation + shipment + carrier deadline,
 * all in the caller's transaction. Lock order: listing row via the conditional UPDATE.
 */
export async function createDealFromAgreement(tx: Tx, a: AgreementInput) {
  const offer = await tx.purchaseOffer.findUniqueOrThrow({
    where: { id: a.offerId },
    include: { listing: { include: { category: true, mine: true, specifications: true } }, delivery_site: true },
  });
  const listing = offer.listing;

  // BR-028: single conditional UPDATE; zero rows => insufficient quantity, nothing else changes.
  const reserved = await tx.$executeRaw`
    UPDATE material_listings
       SET reserved_quantity = reserved_quantity + ${a.quantity}::numeric, version = version + 1, updated_at = now()
     WHERE id = ${listing.id}::uuid AND status = 'ACTIVE'
       AND total_quantity - reserved_quantity - sold_quantity >= ${a.quantity}::numeric`;
  if (reserved === 0) {
    const fresh = await tx.materialListing.findUniqueOrThrow({ where: { id: listing.id } });
    const avail = fresh.total_quantity.minus(fresh.reserved_quantity).minus(fresh.sold_quantity);
    throw conflict('INSUFFICIENT_QUANTITY', 'الكمية المتاحة لا تكفي لقبول هذا العرض؛ ربما حُجزت لصفقة أخرى.', {
      requested: a.quantity.toFixed(3),
      available: avail.toFixed(3),
      listing_status: fresh.status,
    });
  }

  const policy = await currentPolicy(tx);
  const agreedAt = now();
  const mineLoc = { lat: num(listing.mine.lat)!, lng: num(listing.mine.lng)! };
  const siteLoc = { lat: num(offer.delivery_site.lat)!, lng: num(offer.delivery_site.lng)! };
  const materialTotal = BigInt(a.quantity.times(a.unitPriceHalalas.toString()).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0));

  const deal = await tx.deal.create({
    data: {
      reference: await nextReference(tx, 'DEAL'),
      offer_id: offer.id,
      accepted_round_id: a.roundId,
      listing_id: listing.id,
      mine_id: listing.mine_id,
      factory_org_id: offer.factory_org_id,
      mine_org_id: offer.mine_org_id,
      delivery_site_id: offer.delivery_site_id,
      quantity_tons: a.quantity,
      unit_price_halalas: a.unitPriceHalalas,
      material_total_halalas: materialTotal,
      // BR-078: frozen commercial snapshot at agreement time.
      commercial_snapshot: {
        listing: { id: listing.id, title: listing.title, physical_state: listing.physical_state },
        category: { code: listing.category.code, name_ar: listing.category.name_ar, cargo_class: listing.category.cargo_class },
        specifications: listing.specifications.map((s) => ({
          property_name: s.property_name,
          value_numeric: s.value_numeric?.toString() ?? null,
          value_text: s.value_text,
          unit: s.unit,
          verification_status: s.verification_status,
        })),
        mine: { id: listing.mine.id, name: listing.mine.name, region_code: listing.mine.region_code, ...mineLoc },
        delivery_site: { id: offer.delivery_site.id, name: offer.delivery_site.name, region_code: offer.delivery_site.region_code, ...siteLoc },
        straight_line_km_mine_to_factory: round1(haversineKm(mineLoc, siteLoc)).toFixed(1),
        loading_conditions: listing.loading_conditions,
      },
      loading_window_start: a.loadingWindowStart,
      loading_window_end: a.loadingWindowEnd,
      status: 'PENDING_CARRIER',
      agreed_at: agreedAt,
      carrier_deadline_at: addHours(agreedAt, policy.values.carrier_confirmation_window_hours),
      policy_version_id: policy.id,
    },
  });
  await tx.inventoryReservation.create({ data: { listing_id: listing.id, deal_id: deal.id, quantity: a.quantity } });
  const shipment = await tx.shipment.create({
    data: { deal_id: deal.id, pickup_window_start: a.loadingWindowStart, pickup_window_end: a.loadingWindowEnd },
  });
  await tx.shipmentLeg.create({
    data: {
      shipment_id: shipment.id,
      leg_no: 1,
      mode_code: 'ROAD',
      origin_kind: 'MINE',
      origin_id: listing.mine_id,
      destination_kind: 'FACTORY_SITE',
      destination_id: offer.delivery_site_id,
    },
  });
  await tx.shipmentEvent.create({
    data: {
      shipment_id: shipment.id,
      event_type: 'TRANSITION',
      to_status: 'PENDING_CARRIER',
      actor_type: a.actor.type,
      actor_user_id: a.actor.userId,
      actor_org_id: a.actor.orgId,
      note: 'أُنشئت الشحنة مع الاتفاق التجاري',
    },
  });
  await scheduleDeadline(tx, 'DEAL', deal.id, 'CARRIER_CONFIRMATION', deal.carrier_deadline_at);
  await audit(tx, a.actor, {
    action: 'DEAL_CREATED',
    entityType: 'DEAL',
    entityId: deal.id,
    after: {
      reference: deal.reference,
      status: deal.status,
      quantity_tons: deal.quantity_tons,
      unit_price_halalas: deal.unit_price_halalas,
      material_total_halalas: deal.material_total_halalas,
    },
  });
  await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id], {
    eventType: 'DEAL_CREATED',
    titleAr: `تم الاتفاق التجاري ${deal.reference}`,
    bodyAr: 'حُجزت الكمية. الخطوة التالية: عروض الناقلين ثم اختيار المصنع لأحدها خلال 24 ساعة.',
    entityType: 'DEAL',
    entityId: deal.id,
    linkPath: `/deals/${deal.id}`,
  });
  await notifyEligibleCarriers(tx, deal.id, false);
  return deal;
}

/** Shared guards for responding to a round. */
export async function lockPendingRound(tx: Tx, offerId: string, expectedOfferStatus: 'SUBMITTED' | 'COUNTERED', actor: Actor) {
  if (!(await lockRow(tx, 'purchase_offers', offerId))) throw notFound();
  const offer = await tx.purchaseOffer.findUniqueOrThrow({ where: { id: offerId } });
  const round = await tx.offerNegotiationRound.findFirst({ where: { offer_id: offerId, status: 'PENDING' } });
  if (offer.status !== expectedOfferStatus || !round) {
    throw new AppError(409, 'INVALID_STATE', 'لا تسمح حالة العرض الحالية بهذا الإجراء.', { details: { status: offer.status } });
  }
  if (round.expires_at <= now()) {
    return { offer, round, expired: true as const };
  }
  return { offer, round, expired: false as const, actor };
}

export function assertLoadingWindow(start: Date, end: Date, leadHours: number) {
  if (start.getTime() < addHours(now(), leadHours).getTime()) {
    throw unprocessable('LOADING_WINDOW_TOO_SOON', `بداية نافذة التحميل يجب أن تكون بعد ${leadHours} ساعة على الأقل، لإتاحة وقت لتأكيد الناقل والدفع.`, {
      min_start: addHours(now(), leadHours).toISOString(),
    });
  }
  if (end <= start) throw unprocessable('VALIDATION_FAILED', 'نهاية نافذة التحميل يجب أن تكون بعد بدايتها.');
}

export { skipDeadlines, stateConflict };
