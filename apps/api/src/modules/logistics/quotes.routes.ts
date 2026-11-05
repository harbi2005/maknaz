import { selectQuoteSchema, STRAIGHT_LINE_LABEL, submitQuoteSchema } from '@maknaz/shared';
import { Router, type Request } from 'express';
import { Prisma, type TransportQuote } from '../../generated/prisma/client.js';
import { db, lockRow, transaction } from '../../db.js';
import { auth, requireActiveOrg } from '../../lib/context.js';
import { addHours, now } from '../../lib/clock.js';
import { idempotent } from '../../lib/idempotency.js';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { money, qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { createInvoiceForDeal, simulatedRefund } from '../billing/billing.service.js';
import { bandsForDeal, dealGeo, eligibleCarrierDto, findEligibleCarriers, toPricingParams } from '../matching/matching.service.js';
import { notifyOrgs } from '../notifications/notify.js';
import { policyById } from '../policy/policy.js';
import { calculatePrice, type PricingSnapshot } from '../pricing/engine.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { cancelDeal, shipmentEvent } from '../trading/deals.service.js';

export const quotesRouter = Router();

export function quoteDto(q: TransportQuote & { carrier_name?: string | null; service?: { name: string; vehicle_type_code: string; includes_loading: boolean; includes_unloading: boolean } }, full: boolean) {
  const snap = q.pricing_snapshot as unknown as PricingSnapshot;
  const perTon = q.quantity_tons.gt(0)
    ? money(BigInt(new Prisma.Decimal(q.transport_total_halalas.toString()).div(q.quantity_tons).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0)))
    : null;
  return {
    id: q.id,
    deal_id: q.deal_id,
    status: q.status,
    carrier: { id: q.carrier_org_id, name_ar: q.carrier_name ?? null },
    total: money(q.transport_total_halalas),
    ...(full
      ? {
          per_ton: perTon,
          trips: q.trips,
          service: q.service
            ? { name: q.service.name, vehicle_type: q.service.vehicle_type_code, includes_loading: q.service.includes_loading, includes_unloading: q.service.includes_unloading }
            : null,
          proposed_pickup_at: q.proposed_pickup_at.toISOString(),
          estimated_transit_hours: q.estimated_transit_hours.toFixed(1),
          route_distance_km: q.route_distance_km.toFixed(1),
          route_distance_label: 'مسافة الطريق — يؤكدها الناقل',
          straight_line_km_to_mine: q.straight_line_km_to_mine.toFixed(1),
          straight_line_km_mine_to_factory: q.straight_line_km_mine_to_factory.toFixed(1),
          distance_label: STRAIGHT_LINE_LABEL,
          distance_band: q.distance_band,
          price_breakdown: { model: snap.model, pricing_rule_version_id: snap.pricing_rule_version_id, lines: snap.lines, conditional: snap.conditional, total: money(snap.total_halalas) },
          terms: q.terms,
          needs_admin_review: q.needs_admin_review,
          is_reassignment: q.is_reassignment,
        }
      : {}),
    expires_at: q.expires_at.toISOString(),
    created_at: q.created_at.toISOString(),
  };
}

/** Deadline a quote is valid until (BR-035): the deal's current carrier window. */
function currentWindow(deal: { status: string; carrier_deadline_at: Date; retry_deadline_at: Date | null }, reassignmentDeadline: Date | null) {
  if (deal.status === 'PAID') return reassignmentDeadline;
  return deal.status === 'PENDING_CARRIER_RETRY' ? deal.retry_deadline_at : deal.carrier_deadline_at;
}

/** P-45: an eligible carrier submits a binding quote. Price is computed server-side only (SEC-07). */
quotesRouter.post('/deals/:id/quotes', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'CARRIER');
  const dealId = idParam(req.params.id);
  const input = parse(submitQuoteSchema, req.body);
  const quoteId = await transaction(async (tx) => {
    if (!(await lockRow(tx, 'deals', dealId))) throw notFound();
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: { shipment: true } });
    const reassignment = deal.status === 'PAID' && deal.shipment?.status === 'PENDING_CARRIER';
    if (!['PENDING_CARRIER', 'PENDING_CARRIER_RETRY'].includes(deal.status) && !reassignment) {
      throw new AppError(409, 'INVALID_STATE', 'الصفقة لم تعد تقبل عروض نقل.');
    }
    const policy = await policyById(tx, deal.policy_version_id);
    const geo = dealGeo(deal);
    const [eligible] = await findEligibleCarriers(tx, geo, bandsForDeal(deal, policy), policy, org.id);
    if (!eligible) throw new AppError(403, 'NOT_ELIGIBLE', 'جهتك غير مؤهلة لهذه الشحنة (الخدمة أو المنطقة أو الحمولة أو التسعير الساري).');
    const svc = eligible.services.find((s) => s.service.id === input.service_id);
    if (!svc) throw unprocessable('SERVICE_NOT_ELIGIBLE', 'الخدمة المختارة غير مؤهلة لهذه الشحنة أو لا يوجد لها تسعير ساري.');
    const loc = await tx.carrierOperatingLocation.findFirst({ where: { id: input.operating_location_id, organization_id: org.id, is_active: true } });
    if (!loc) throw unprocessable('VALIDATION_FAILED', 'اختر موقع انطلاق تابعًا لجهتك.');
    const existing = await tx.transportQuote.findFirst({ where: { deal_id: dealId, carrier_org_id: org.id, status: 'SUBMITTED' } });
    if (existing) throw conflict('QUOTE_ALREADY_SUBMITTED', 'قدمت عرضًا على هذه الشحنة بالفعل؛ اسحبه أولًا لتقديم عرض جديد.');

    const pickup = new Date(input.proposed_pickup_at);
    if (pickup < deal.loading_window_start || pickup > deal.loading_window_end) {
      throw unprocessable('PICKUP_OUTSIDE_WINDOW', 'موعد الاستلام يجب أن يكون داخل نافذة التحميل التي حددها المنجم.', {
        window_start: deal.loading_window_start.toISOString(),
        window_end: deal.loading_window_end.toISOString(),
      });
    }
    if (reassignment) {
      if (pickup <= now() || (deal.shipment!.pickup_deadline_at && pickup > deal.shipment!.pickup_deadline_at)) {
        throw unprocessable('PICKUP_OUTSIDE_WINDOW', 'موعد الاستلام يجب ألا يتجاوز موعد الاستلام الحالي الذي حدده المنجم.', {
          pickup_deadline_at: deal.shipment!.pickup_deadline_at?.toISOString() ?? null,
        });
      }
    } else if (pickup < addHours(now(), policy.payment_window_hours)) {
      // BR-039 / OD-22: pickup may not precede the payment window.
      throw unprocessable('PICKUP_OUTSIDE_WINDOW', `موعد الاستلام يجب أن يكون بعد ${policy.payment_window_hours} ساعة على الأقل لإتاحة مهلة الدفع.`);
    }

    const straight = new Prisma.Decimal(geo.straightLineMineToFactory);
    const snapshot = calculatePrice(
      toPricingParams(svc.version),
      {
        weightTons: deal.quantity_tons,
        routeDistanceKm: new Prisma.Decimal(input.route_distance_km),
        payloadTonsPerVehicle: svc.service.payload_tons_per_vehicle,
        serviceMinTons: svc.service.min_shipment_tons,
        serviceMaxTons: svc.service.max_shipment_tons,
        straightLineKmMineToFactory: straight,
      },
      now(),
    );
    const expires = currentWindow(deal, deal.shipment?.reassignment_deadline_at ?? null)!;
    const q = await tx.transportQuote.create({
      data: {
        deal_id: dealId,
        carrier_org_id: org.id,
        service_id: svc.service.id,
        pricing_rule_version_id: svc.version.id,
        operating_location_id: loc.id,
        straight_line_km_to_mine: new Prisma.Decimal(eligible.straightLineKmToMine),
        straight_line_km_mine_to_factory: straight,
        route_distance_km: new Prisma.Decimal(input.route_distance_km),
        distance_band: eligible.band,
        quantity_tons: deal.quantity_tons,
        trips: snapshot.inputs.trips,
        proposed_pickup_at: pickup,
        estimated_transit_hours: new Prisma.Decimal(input.estimated_transit_hours),
        transport_total_halalas: BigInt(snapshot.total_halalas),
        pricing_snapshot: snapshot as unknown as Prisma.InputJsonValue,
        terms: input.terms ?? null,
        needs_admin_review: snapshot.warnings.includes('ROUTE_DISTANCE_REVIEW'),
        expires_at: expires,
        is_reassignment: reassignment,
        submitted_by: auth(req).userId,
      },
    });
    await audit(tx, actorFromRequest(req), {
      action: 'QUOTE_SUBMITTED',
      entityType: 'DEAL',
      entityId: dealId,
      after: { quote_id: q.id, total_halalas: q.transport_total_halalas, pricing_rule_version_id: q.pricing_rule_version_id },
    });
    await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id], {
      eventType: 'QUOTE_SUBMITTED',
      titleAr: `عرض نقل جديد على الصفقة ${deal.reference}`,
      bodyAr: 'قارن عروض الناقلين واختر أحدها قبل انتهاء المهلة.',
      entityType: 'DEAL',
      entityId: dealId,
      linkPath: `/deals/${dealId}`,
    });
    return q.id;
  });
  const q = await db().transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { service: true } });
  return { status: 201, body: quoteDto({ ...q, carrier_name: auth(req).org?.legalNameAr }, true) };
}));

/** P-46: carrier withdraws its SUBMITTED quote. */
quotesRouter.post('/quotes/:id/withdraw', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'CARRIER');
  const id = idParam(req.params.id);
  const q = await transaction(async (tx) => {
    const quote = await tx.transportQuote.findFirst({ where: { id, carrier_org_id: org.id } });
    if (!quote) throw notFound();
    const r = await tx.transportQuote.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN' } });
    if (r.count === 0) throw new AppError(409, 'INVALID_STATE', 'لا يمكن سحب هذا العرض في حالته الحالية.');
    await audit(tx, actorFromRequest(req), { action: 'QUOTE_WITHDRAWN', entityType: 'DEAL', entityId: quote.deal_id, after: { quote_id: id } });
    return tx.transportQuote.findUniqueOrThrow({ where: { id }, include: { service: true } });
  });
  return { status: 200, body: quoteDto(q, true) };
}));

async function dealForParty(req: Request, dealId: string) {
  const a = auth(req);
  const deal = await db().deal.findUnique({ where: { id: dealId }, include: { shipment: true } });
  if (!deal) throw notFound();
  const isParty = a.isPlatformAdmin || a.org?.id === deal.factory_org_id || a.org?.id === deal.mine_org_id || (!!a.org && a.org.id === deal.shipment?.carrier_org_id);
  return { deal, isParty, a };
}

/** P-47: factory/admin see all quotes; mine sees totals and carriers only; carrier sees its own. */
quotesRouter.get('/deals/:id/quotes', async (req, res) => {
  const { deal, isParty, a } = await dealForParty(req, idParam(req.params.id));
  const isCarrier = a.org?.type === 'CARRIER';
  if (!isParty && !isCarrier) throw notFound();
  const quotes = await db().transportQuote.findMany({
    where: { deal_id: deal.id, ...(isCarrier ? { carrier_org_id: a.org!.id } : {}) },
    include: { service: true },
    orderBy: { transport_total_halalas: 'asc' },
  });
  if (isCarrier && quotes.length === 0 && !isParty) throw notFound();
  const names = new Map((await db().organization.findMany({ where: { id: { in: quotes.map((q) => q.carrier_org_id) } } })).map((o) => [o.id, o.legal_name_ar]));
  const full = a.isPlatformAdmin || a.org?.id === deal.factory_org_id || isCarrier;
  res.json({ data: quotes.map((q) => quoteDto({ ...q, carrier_name: names.get(q.carrier_org_id) ?? null }, full)) });
});

/** P-48: eligible carriers ranked by band then distance, with non-binding indicative prices. */
quotesRouter.get('/deals/:id/eligible-carriers', async (req, res) => {
  const { deal, a } = await dealForParty(req, idParam(req.params.id));
  if (!a.isPlatformAdmin && a.org?.id !== deal.factory_org_id && a.org?.id !== deal.mine_org_id) throw notFound();
  const policy = await policyById(db() as never, deal.policy_version_id);
  const geo = dealGeo(deal);
  const bands = bandsForDeal(deal, policy);
  const eligible = await findEligibleCarriers(db() as never, geo, bands, policy);
  const quoted = new Set((await db().transportQuote.findMany({ where: { deal_id: deal.id, status: 'SUBMITTED' } })).map((q) => q.carrier_org_id));
  res.json({
    data: eligible.map((e) => eligibleCarrierDto(e, geo, policy, quoted.has(e.carrierOrgId))),
    matching_scope: { bands, is_retry_window: deal.status === 'PENDING_CARRIER_RETRY' },
  });
});

/**
 * P-49: the factory selects one valid quote → three-party confirmation (BR-039/040) in a
 * single transaction; or, after payment, a replacement carrier (BR-065/066, P-69).
 */
quotesRouter.post('/deals/:id/quotes/:qid/select', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'FACTORY');
  const dealId = idParam(req.params.id);
  const quoteId = idParam(req.params.qid);
  const { accept_price_difference } = parse(selectQuoteSchema, req.body);
  const result = await transaction(async (tx) => {
    if (!(await lockRow(tx, 'deals', dealId))) throw notFound();
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: { shipment: true, reservation: true, invoice: { include: { items: true } } } });
    if (deal.factory_org_id !== org.id) throw notFound();
    const shipment = deal.shipment!;
    await lockRow(tx, 'shipments', shipment.id);
    const reassignment = deal.status === 'PAID' && shipment.status === 'PENDING_CARRIER';
    if (!['PENDING_CARRIER', 'PENDING_CARRIER_RETRY'].includes(deal.status) && !reassignment) {
      throw new AppError(409, 'STATE_CONFLICT', 'تم اختيار ناقل لهذه الصفقة بالفعل أو تغيرت حالتها.', { retryable: true });
    }
    if (deal.reservation?.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE', 'لا يوجد حجز نشط لهذه الصفقة.');
    if (!(await lockRow(tx, 'transport_quotes', quoteId))) throw notFound();
    const quote = await tx.transportQuote.findUniqueOrThrow({ where: { id: quoteId } });
    if (quote.deal_id !== dealId) throw notFound();
    if (quote.status !== 'SUBMITTED' || quote.expires_at <= now()) {
      throw new AppError(409, 'QUOTE_NOT_AVAILABLE', 'عرض النقل لم يعد متاحًا (مسحوب أو منتهٍ).');
    }
    const carrier = await tx.organization.findUniqueOrThrow({ where: { id: quote.carrier_org_id } });
    if (carrier.status !== 'ACTIVE') throw new AppError(409, 'CARRIER_NOT_ACTIVE', 'جهة الناقل لم تعد نشطة.');
    const policy = await policyById(tx, deal.policy_version_id);
    const actor = actorFromRequest(req);

    await tx.transportQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } });
    await tx.transportQuote.updateMany({ where: { deal_id: dealId, status: 'SUBMITTED', id: { not: quoteId } }, data: { status: 'NOT_SELECTED' } });
    await tx.shipmentLeg.updateMany({ where: { shipment_id: shipment.id }, data: { carrier_org_id: quote.carrier_org_id } });

    if (!reassignment) {
      if (quote.proposed_pickup_at < addHours(now(), policy.payment_window_hours)) {
        throw unprocessable('PICKUP_OUTSIDE_WINDOW', 'موعد الاستلام في هذا العرض أقرب من مهلة الدفع؛ لا يمكن اختياره.');
      }
      const invoice = await createInvoiceForDeal(tx, deal, quote, policy.payment_window_hours);
      await tx.deal.update({
        where: { id: dealId },
        data: { status: 'AWAITING_PAYMENT', selected_quote_id: quoteId, confirmed_at: now(), payment_deadline_at: invoice.payment_deadline_at, version: { increment: 1 } },
      });
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: 'CARRIER_CONFIRMED', carrier_org_id: quote.carrier_org_id, active_quote_id: quoteId, planned_pickup_at: quote.proposed_pickup_at, version: { increment: 1 } },
      });
      await shipmentEvent(tx, shipment.id, shipment.status, 'CARRIER_CONFIRMED', actor, `اختار المصنع عرض ${carrier.legal_name_ar}`);
      await skipDeadlines(tx, 'DEAL', dealId, ['CARRIER_CONFIRMATION', 'CARRIER_RETRY'], 'three-party confirmed');
      await scheduleDeadline(tx, 'DEAL', dealId, 'PAYMENT', invoice.payment_deadline_at);
      const reminder = addHours(invoice.payment_deadline_at, -policy.payment_reminder_before_hours);
      if (reminder > now()) await scheduleDeadline(tx, 'DEAL', dealId, 'PAYMENT_REMINDER', reminder);
      await audit(tx, actor, {
        action: 'THREE_PARTY_CONFIRMED',
        entityType: 'DEAL',
        entityId: dealId,
        before: { status: deal.status },
        after: { status: 'AWAITING_PAYMENT', quote_id: quoteId, invoice_id: invoice.id, grand_total_halalas: invoice.grand_total_halalas },
      });
      await audit(tx, actor, { action: 'INVOICE_GENERATED', entityType: 'INVOICE', entityId: invoice.id, after: { reference: invoice.reference, grand_total_halalas: invoice.grand_total_halalas } });
      await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id, quote.carrier_org_id], {
        eventType: 'THREE_PARTY_CONFIRMED',
        titleAr: `اكتمل التأكيد الثلاثي ${deal.reference}`,
        bodyAr: `صدرت الفاتورة المحاكاة ${invoice.reference}. مهلة الدفع ${policy.payment_window_hours} ساعة.`,
        entityType: 'DEAL',
        entityId: dealId,
        linkPath: `/deals/${dealId}`,
      });
      const others = await tx.transportQuote.findMany({ where: { deal_id: dealId, status: 'NOT_SELECTED' }, select: { carrier_org_id: true } });
      await notifyOrgs(tx, others.map((o) => o.carrier_org_id), {
        eventType: 'QUOTE_NOT_SELECTED',
        titleAr: `لم يُختر عرضك على ${deal.reference}`,
        bodyAr: 'اختار المصنع عرض ناقل آخر.',
        entityType: 'DEAL',
        entityId: dealId,
      });
      return { kind: 'confirmed' as const, invoiceId: invoice.id };
    }

    // Reassignment after payment (BR-066): compare with the transport amount already billed.
    const invoice = deal.invoice!;
    const billedTransport = invoice.transport_total_halalas + invoice.additional_charges_halalas +
      invoice.items.filter((i) => i.item_type === 'ADJUSTMENT').reduce((s, i) => s + i.line_total_halalas, 0n);
    const diff = quote.transport_total_halalas - billedTransport;
    if (diff > 0n && !accept_price_difference) {
      throw unprocessable('PRICE_DIFFERENCE_NOT_ACCEPTED', 'سعر الناقل البديل أعلى من النقل المفوتر؛ يلزم موافقتك الصريحة على الفرق.', {
        difference: money(diff),
      });
    }
    await tx.deal.update({ where: { id: dealId }, data: { selected_quote_id: quoteId, version: { increment: 1 } } });
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: 'SCHEDULED', carrier_org_id: quote.carrier_org_id, active_quote_id: quoteId, planned_pickup_at: quote.proposed_pickup_at, reassignment_deadline_at: null, version: { increment: 1 } },
    });
    await shipmentEvent(tx, shipment.id, 'PENDING_CARRIER', 'SCHEDULED', actor, `أُسند ناقل بديل: ${carrier.legal_name_ar}`);
    await skipDeadlines(tx, 'SHIPMENT', shipment.id, ['REASSIGNMENT'], 'carrier reassigned');
    if (diff !== 0n) {
      const item = await tx.invoiceItem.create({
        data: {
          invoice_id: invoice.id,
          item_type: 'ADJUSTMENT',
          description_ar: diff > 0n ? 'فرق سعر النقل بعد إعادة الإسناد (يتطلب دفعة محاكاة إضافية)' : 'فرق سعر النقل بعد إعادة الإسناد (استرجاع محاكى)',
          line_total_halalas: diff,
          source_quote_id: quoteId,
        },
      });
      if (diff < 0n) {
        await simulatedRefund(tx, invoice.id, -diff, 'REASSIGNMENT_PRICE_DIFFERENCE', item.id, 'فرق سعر النقل بعد إعادة الإسناد', actor);
      }
    }
    await audit(tx, actor, {
      action: 'CARRIER_REASSIGNED',
      entityType: 'DEAL',
      entityId: dealId,
      after: { quote_id: quoteId, price_difference_halalas: diff, accepted_difference: accept_price_difference },
    });
    await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id, quote.carrier_org_id], {
      eventType: 'CARRIER_REASSIGNED',
      titleAr: `أُسند ناقل بديل للصفقة ${deal.reference}`,
      bodyAr: diff > 0n ? 'يلزم دفع فرق سعر النقل (محاكاة) من صفحة الفاتورة.' : 'استمرت الشحنة بالموعد الحالي.',
      entityType: 'DEAL',
      entityId: dealId,
      linkPath: `/deals/${dealId}`,
    });
    return { kind: 'reassigned' as const, invoiceId: invoice.id };
  });
  const deal = await db().deal.findUniqueOrThrow({ where: { id: dealId }, include: { shipment: true, invoice: true } });
  return {
    status: 200,
    body: {
      deal: { id: deal.id, status: deal.status, confirmed_at: deal.confirmed_at?.toISOString() ?? null, payment_deadline_at: deal.payment_deadline_at?.toISOString() ?? null },
      shipment: { id: deal.shipment!.id, status: deal.shipment!.status, planned_pickup_at: deal.shipment!.planned_pickup_at?.toISOString() ?? null },
      invoice: deal.invoice ? { id: deal.invoice.id, reference: deal.invoice.reference, grand_total: money(deal.invoice.grand_total_halalas), simulation: true } : null,
      result: result.kind,
    },
  };
}));

/** Factory declines a higher reassignment price → cancellation with full refund (BR-066). */
quotesRouter.post('/deals/:id/reassignment/decline', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'FACTORY');
  const dealId = idParam(req.params.id);
  await transaction(async (tx) => {
    if (!(await lockRow(tx, 'deals', dealId))) throw notFound();
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: { shipment: true } });
    if (deal.factory_org_id !== org.id) throw notFound();
    if (deal.status !== 'PAID' || deal.shipment?.status !== 'PENDING_CARRIER') {
      throw new AppError(409, 'INVALID_STATE', 'لا توجد إعادة إسناد جارية لهذه الصفقة.');
    }
    await cancelDeal(tx, dealId, 'REASSIGNMENT_PRICE_DECLINED', actorFromRequest(req), { faultParty: 'CARRIER' });
  });
  return { status: 200, body: { deal: { id: dealId, status: 'CANCELLED' } } };
}));

export { qty };
