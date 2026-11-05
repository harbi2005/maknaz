import {
  carrierServiceSchema,
  createPricingRuleSchema,
  distanceBand,
  haversineKm,
  pricingPreviewSchema,
  pricingVersionSchema,
  round1,
  serviceAreasSchema,
  STRAIGHT_LINE_LABEL,
  type PricingVersionInput,
} from '@maknaz/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type CarrierPricingRuleVersion, type CarrierService } from '../../generated/prisma/client.js';
import { db, lockRow, transaction, type Tx } from '../../db.js';
import { auth, requireActiveOrg, requireOrg } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { AppError, notFound } from '../../lib/errors.js';
import { money, moneyOrNull, num, qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { bandsForDeal, dealGeo, findEligibleCarriers } from '../matching/matching.service.js';
import { currentPolicy, policyById } from '../policy/policy.js';
import { calculatePrice } from '../pricing/engine.js';

export const carriersRouter = Router();

const serviceDto = (s: CarrierService) => ({
  id: s.id,
  name: s.name,
  mode_code: s.mode_code,
  vehicle_type_code: s.vehicle_type_code,
  supported_cargo_classes: s.supported_cargo_classes,
  payload_tons_per_vehicle: qty(s.payload_tons_per_vehicle),
  vehicles_available: s.vehicles_available,
  min_shipment_tons: qty(s.min_shipment_tons),
  max_shipment_tons: qty(s.max_shipment_tons),
  includes_loading: s.includes_loading,
  includes_unloading: s.includes_unloading,
  is_active: s.is_active,
});

export const versionDto = (v: CarrierPricingRuleVersion) => ({
  id: v.id,
  version_no: v.version_no,
  pricing_model: v.pricing_model,
  base_fee: money(v.base_fee_halalas),
  rate_per_km: v.rate_per_km?.toFixed(4) ?? null,
  rate_per_ton: v.rate_per_ton?.toFixed(4) ?? null,
  rate_per_ton_km: v.rate_per_ton_km?.toFixed(4) ?? null,
  fixed_route_price: moneyOrNull(v.fixed_route_price_halalas),
  route_origin_region: v.route_origin_region,
  route_destination_region: v.route_destination_region,
  distance_basis: v.distance_basis,
  loading_fee: money(v.loading_fee_halalas),
  unloading_fee: money(v.unloading_fee_halalas),
  handling_fee: money(v.handling_fee_halalas),
  fee_basis: v.fee_basis,
  waiting_fee_per_hour: money(v.waiting_fee_per_hour_halalas),
  free_waiting_hours: v.free_waiting_hours.toFixed(1),
  minimum_charge: money(v.minimum_charge_halalas),
  valid_from: v.valid_from.toISOString(),
  valid_to: v.valid_to?.toISOString() ?? null,
  status: v.status,
  activated_at: v.activated_at?.toISOString() ?? null,
});

// ─── services (P-42) ────────────────────────────────────────────────────

carriersRouter.get('/carrier/services', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const rows = await db().carrierService.findMany({ where: { organization_id: org.id }, orderBy: { created_at: 'asc' } });
  res.json({ data: rows.map(serviceDto) });
});

async function assertModeEnabled(tx: Tx, mode: string, vehicle: string) {
  const m = await tx.transportationMode.findUnique({ where: { code: mode } });
  if (!m?.is_enabled) {
    // OD-16: only ROAD is enabled in the MVP; other modes exist in the data model only.
    throw new AppError(422, 'MODE_NOT_ENABLED', 'هذا النمط غير متاح في النسخة الحالية؛ النقل البري فقط.');
  }
  const v = await tx.vehicleType.findUnique({ where: { code: vehicle } });
  if (!v || v.mode_code !== mode) throw new AppError(422, 'VALIDATION_FAILED', 'نوع المركبة لا يتوافق مع نمط النقل.');
}

carriersRouter.post('/carrier/services', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const input = parse(carrierServiceSchema, req.body);
  const s = await transaction(async (tx) => {
    await assertModeEnabled(tx, input.mode_code, input.vehicle_type_code);
    const created = await tx.carrierService.create({
      data: {
        ...input,
        organization_id: org.id,
        payload_tons_per_vehicle: new Prisma.Decimal(input.payload_tons_per_vehicle),
        min_shipment_tons: new Prisma.Decimal(input.min_shipment_tons),
        max_shipment_tons: new Prisma.Decimal(input.max_shipment_tons),
      },
    });
    await audit(tx, actorFromRequest(req), { action: 'SERVICE_CREATED', entityType: 'CARRIER_SERVICE', entityId: created.id, after: serviceDto(created) });
    return created;
  });
  res.status(201).json(serviceDto(s));
});

carriersRouter.patch('/carrier/services/:id', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const id = idParam(req.params.id);
  const before = await db().carrierService.findFirst({ where: { id, organization_id: org.id } });
  if (!before) throw notFound();
  const merged = parse(carrierServiceSchema, { ...serviceDto(before), ...req.body });
  const s = await transaction(async (tx) => {
    await assertModeEnabled(tx, merged.mode_code, merged.vehicle_type_code);
    const updated = await tx.carrierService.update({
      where: { id },
      data: {
        ...merged,
        payload_tons_per_vehicle: new Prisma.Decimal(merged.payload_tons_per_vehicle),
        min_shipment_tons: new Prisma.Decimal(merged.min_shipment_tons),
        max_shipment_tons: new Prisma.Decimal(merged.max_shipment_tons),
      },
    });
    await audit(tx, actorFromRequest(req), { action: 'SERVICE_UPDATED', entityType: 'CARRIER_SERVICE', entityId: id, before: serviceDto(before), after: serviceDto(updated) });
    return updated;
  });
  res.json(serviceDto(s));
});

carriersRouter.get('/transport-reference', async (_req, res) => {
  const [modes, vehicles] = await Promise.all([
    db().transportationMode.findMany({ orderBy: { code: 'asc' } }),
    db().vehicleType.findMany({ orderBy: { code: 'asc' } }),
  ]);
  res.json({ modes, vehicle_types: vehicles });
});

// ─── service areas (P-14) ───────────────────────────────────────────────

carriersRouter.get('/carrier/service-areas', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const rows = await db().carrierServiceArea.findMany({ where: { organization_id: org.id }, orderBy: { created_at: 'asc' } });
  res.json({ data: rows.map((a) => ({ id: a.id, area_type: a.area_type, region_code: a.region_code, country_code: a.country_code })) });
});

/** Replaces the set of served regions (UI: multi-select of administrative regions). */
carriersRouter.put('/carrier/service-areas', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const input = parse(serviceAreasSchema, req.body);
  const rows = await transaction(async (tx) => {
    const before = await tx.carrierServiceArea.findMany({ where: { organization_id: org.id, area_type: 'REGION' } });
    await tx.carrierServiceArea.deleteMany({ where: { organization_id: org.id, area_type: 'REGION' } });
    await tx.carrierServiceArea.createMany({
      data: [...new Set(input.region_codes)].map((r) => ({ organization_id: org.id, area_type: 'REGION', region_code: r })),
    });
    await audit(tx, actorFromRequest(req), {
      action: 'SERVICE_AREAS_REPLACED',
      entityType: 'ORGANIZATION',
      entityId: org.id,
      before: before.map((b) => b.region_code),
      after: input.region_codes,
    });
    return tx.carrierServiceArea.findMany({ where: { organization_id: org.id } });
  });
  res.json({ data: rows.map((a) => ({ id: a.id, area_type: a.area_type, region_code: a.region_code, country_code: a.country_code })) });
});

// ─── pricing rules & versions (P-42, P-43) ──────────────────────────────

function versionData(input: PricingVersionInput) {
  const dec = (v: string | null | undefined) => (v == null || v === '' ? null : new Prisma.Decimal(v));
  return {
    pricing_model: input.pricing_model,
    base_fee_halalas: BigInt(input.base_fee_halalas),
    rate_per_km: input.pricing_model === 'PER_KM' ? dec(input.rate_per_km) : null,
    rate_per_ton: input.pricing_model === 'PER_TON' ? dec(input.rate_per_ton) : null,
    rate_per_ton_km: input.pricing_model === 'PER_TON_KM' ? dec(input.rate_per_ton_km) : null,
    fixed_route_price_halalas: input.pricing_model === 'FIXED_ROUTE' && input.fixed_route_price_halalas != null ? BigInt(input.fixed_route_price_halalas) : null,
    route_origin_region: input.pricing_model === 'FIXED_ROUTE' ? (input.route_origin_region ?? null) : null,
    route_destination_region: input.pricing_model === 'FIXED_ROUTE' ? (input.route_destination_region ?? null) : null,
    distance_basis: input.distance_basis,
    loading_fee_halalas: BigInt(input.loading_fee_halalas),
    unloading_fee_halalas: BigInt(input.unloading_fee_halalas),
    handling_fee_halalas: BigInt(input.handling_fee_halalas),
    fee_basis: input.fee_basis,
    waiting_fee_per_hour_halalas: BigInt(input.waiting_fee_per_hour_halalas),
    free_waiting_hours: new Prisma.Decimal(input.free_waiting_hours),
    minimum_charge_halalas: BigInt(input.minimum_charge_halalas),
    valid_to: input.valid_to ? new Date(input.valid_to) : null,
  };
}

/**
 * DRAFT → ACTIVE. The previous ACTIVE version of the rule becomes SUPERSEDED (its validity
 * ends where the new one starts), so validity never overlaps (EXCLUDE constraint as backstop).
 * Quotes already submitted keep their snapshot (BR-078).
 */
async function activateVersion(tx: Tx, req: Request, ruleId: string, versionId: string) {
  if (!(await lockRow(tx, 'carrier_pricing_rule_versions', versionId))) throw notFound();
  const v = await tx.carrierPricingRuleVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (v.status !== 'DRAFT') throw new AppError(409, 'INVALID_STATE', 'يمكن تفعيل المسودات فقط.');
  const start = v.valid_from > now() ? v.valid_from : now();
  const previous = await tx.carrierPricingRuleVersion.findMany({ where: { rule_id: ruleId, status: 'ACTIVE' } });
  for (const p of previous) {
    await tx.carrierPricingRuleVersion.update({
      where: { id: p.id },
      data: { status: 'SUPERSEDED', valid_to: p.valid_from < start ? start : p.valid_from },
    });
  }
  await tx.$executeRaw`UPDATE carrier_pricing_rule_versions SET valid_from = ${start}, status = 'ACTIVE', activated_at = ${now()} WHERE id = ${versionId}::uuid`;
  await audit(tx, actorFromRequest(req), {
    action: 'PRICING_VERSION_ACTIVATED',
    entityType: 'PRICING_RULE',
    entityId: ruleId,
    before: { superseded: previous.map((p) => p.id) },
    after: { version_id: versionId, version_no: v.version_no, valid_from: start },
  });
}

const RULE_INCLUDE = { service: true, versions: { orderBy: { version_no: 'desc' as const } } } as const;

function ruleDto(r: Prisma.CarrierPricingRuleGetPayload<{ include: typeof RULE_INCLUDE }>) {
  const at = now();
  const active = r.versions.find((v) => v.status === 'ACTIVE' && v.valid_from <= at && (!v.valid_to || v.valid_to > at));
  return {
    id: r.id,
    name: r.name,
    is_active: r.is_active,
    service: serviceDto(r.service),
    active_version_id: active?.id ?? null,
    versions: r.versions.map(versionDto),
  };
}

carriersRouter.get('/carrier/pricing-rules', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const rows = await db().carrierPricingRule.findMany({ where: { organization_id: org.id }, include: RULE_INCLUDE, orderBy: { created_at: 'asc' } });
  res.json({ data: rows.map(ruleDto) });
});

/** Creates a rule for a service with its first version (optionally activated right away). */
carriersRouter.post('/carrier/pricing-rules', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const input = parse(createPricingRuleSchema, req.body);
  const rule = await transaction(async (tx) => {
    const service = await tx.carrierService.findFirst({ where: { id: input.service_id, organization_id: org.id } });
    if (!service) throw new AppError(422, 'VALIDATION_FAILED', 'اختر خدمة تابعة لجهتك.');
    const r = await tx.carrierPricingRule.create({ data: { organization_id: org.id, service_id: service.id, name: input.name } });
    const v = await tx.carrierPricingRuleVersion.create({
      data: { ...versionData(input.version), rule_id: r.id, version_no: 1, valid_from: input.version.valid_from ? new Date(input.version.valid_from) : now() },
    });
    await audit(tx, actorFromRequest(req), { action: 'PRICING_RULE_CREATED', entityType: 'PRICING_RULE', entityId: r.id, after: versionDto(v) });
    if (input.version.activate) await activateVersion(tx, req, r.id, v.id);
    return tx.carrierPricingRule.findUniqueOrThrow({ where: { id: r.id }, include: RULE_INCLUDE });
  });
  res.status(201).json(ruleDto(rule));
});

async function ownRule(req: Request, ruleId: string) {
  const org = requireOrg(req, 'CARRIER');
  const r = await db().carrierPricingRule.findFirst({ where: { id: ruleId, organization_id: org.id } });
  if (!r) throw notFound();
  return r;
}

/** New DRAFT version (active versions are never edited — SCR-CAR-03). */
carriersRouter.post('/carrier/pricing-rules/:id/versions', async (req, res) => {
  const ruleId = idParam(req.params.id);
  await ownRule(req, ruleId);
  const input = parse(pricingVersionSchema, req.body);
  const rule = await transaction(async (tx) => {
    const last = await tx.carrierPricingRuleVersion.findFirst({ where: { rule_id: ruleId }, orderBy: { version_no: 'desc' } });
    const v = await tx.carrierPricingRuleVersion.create({
      data: { ...versionData(input), rule_id: ruleId, version_no: (last?.version_no ?? 0) + 1, valid_from: input.valid_from ? new Date(input.valid_from) : now() },
    });
    await audit(tx, actorFromRequest(req), { action: 'PRICING_VERSION_CREATED', entityType: 'PRICING_RULE', entityId: ruleId, after: versionDto(v) });
    if (input.activate) await activateVersion(tx, req, ruleId, v.id);
    return tx.carrierPricingRule.findUniqueOrThrow({ where: { id: ruleId }, include: RULE_INCLUDE });
  });
  res.status(201).json(ruleDto(rule));
});

carriersRouter.patch('/carrier/pricing-rules/:id/versions/:vid', async (req, res) => {
  const ruleId = idParam(req.params.id);
  await ownRule(req, ruleId);
  const vid = idParam(req.params.vid);
  const input = parse(pricingVersionSchema, req.body);
  const rule = await transaction(async (tx) => {
    const v = await tx.carrierPricingRuleVersion.findFirst({ where: { id: vid, rule_id: ruleId } });
    if (!v) throw notFound();
    if (v.status !== 'DRAFT') throw new AppError(409, 'INVALID_STATE', 'الإصدار الساري لا يُعدل؛ أنشئ إصدارًا جديدًا.');
    const updated = await tx.carrierPricingRuleVersion.update({
      where: { id: vid },
      data: { ...versionData(input), valid_from: input.valid_from ? new Date(input.valid_from) : v.valid_from },
    });
    await audit(tx, actorFromRequest(req), { action: 'PRICING_VERSION_UPDATED', entityType: 'PRICING_RULE', entityId: ruleId, before: versionDto(v), after: versionDto(updated) });
    if (input.activate) await activateVersion(tx, req, ruleId, vid);
    return tx.carrierPricingRule.findUniqueOrThrow({ where: { id: ruleId }, include: RULE_INCLUDE });
  });
  res.json(ruleDto(rule));
});

carriersRouter.post('/carrier/pricing-rules/:id/versions/:vid/activate', async (req, res) => {
  const ruleId = idParam(req.params.id);
  await ownRule(req, ruleId);
  const vid = idParam(req.params.vid);
  const rule = await transaction(async (tx) => {
    const v = await tx.carrierPricingRuleVersion.findFirst({ where: { id: vid, rule_id: ruleId } });
    if (!v) throw notFound();
    await activateVersion(tx, req, ruleId, vid);
    return tx.carrierPricingRule.findUniqueOrThrow({ where: { id: ruleId }, include: RULE_INCLUDE });
  });
  res.json(ruleDto(rule));
});

/** Price preview with the same engine and snapshot format the factory will see. */
carriersRouter.post('/carrier/pricing-rules/:id/versions/:vid/preview', async (req, res) => {
  const ruleId = idParam(req.params.id);
  const rule = await ownRule(req, ruleId);
  const vid = idParam(req.params.vid);
  const input = parse(pricingPreviewSchema, req.body);
  const v = await db().carrierPricingRuleVersion.findFirst({ where: { id: vid, rule_id: ruleId } });
  if (!v) throw notFound();
  const service = await db().carrierService.findUniqueOrThrow({ where: { id: rule.service_id } });
  const snap = calculatePrice(
    v as never,
    {
      weightTons: new Prisma.Decimal(input.quantity_tons),
      routeDistanceKm: new Prisma.Decimal(input.route_distance_km),
      payloadTonsPerVehicle: service.payload_tons_per_vehicle,
      serviceMinTons: service.min_shipment_tons,
      serviceMaxTons: service.max_shipment_tons,
    },
    now(),
  );
  res.json({ ...snap, total: money(snap.total_halalas) });
});

// ─── discovery & opportunities (P-44) ───────────────────────────────────

/** Mines near the carrier's operating locations, banded by straight-line distance. */
carriersRouter.get('/carrier/nearby-mines', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const policy = await currentPolicy();
  const locs = await db().carrierOperatingLocation.findMany({ where: { organization_id: org.id, is_active: true } });
  const mines = await db().mine.findMany({
    where: { status: 'ACTIVE', organization: { status: 'ACTIVE' } },
    include: { organization: true, _count: { select: { listings: { where: { status: 'ACTIVE' } } } } },
    take: 1000,
  });
  const data = mines
    .map((m) => {
      const p = { lat: num(m.lat)!, lng: num(m.lng)! };
      let best = Infinity;
      let from: (typeof locs)[number] | null = null;
      for (const l of locs) {
        const d = haversineKm({ lat: num(l.lat)!, lng: num(l.lng)! }, p);
        if (d < best) {
          best = d;
          from = l;
        }
      }
      if (!from) return null;
      const km = round1(best);
      return {
        mine: { id: m.id, name: m.name, region_code: m.region_code, lat: p.lat, lng: p.lng, organization_name: m.organization.legal_name_ar, active_listings: m._count.listings },
        nearest_location: { id: from.id, name: from.name },
        straight_line_km: km.toFixed(1),
        distance_band: distanceBand(km, policy.values.distance_band_limits_km),
        distance_label: STRAIGHT_LINE_LABEL,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(a.straight_line_km) - Number(b.straight_line_km));
  res.json({ data, has_locations: locs.length > 0 });
});

const oppQuery = z.object({ 'filter[band]': z.string().max(20).optional(), 'filter[region]': z.string().max(30).optional() });

async function opportunitiesFor(orgId: string, dealId?: string) {
  const deals = await db().deal.findMany({
    where: {
      ...(dealId ? { id: dealId } : {}),
      OR: [
        { status: { in: ['PENDING_CARRIER', 'PENDING_CARRIER_RETRY'] } },
        // Reassignment after payment (BR-065): the shipment is back to PENDING_CARRIER.
        { status: 'PAID', shipment: { status: 'PENDING_CARRIER' } },
      ],
    },
    include: { shipment: true, quotes: { where: { carrier_org_id: orgId } } },
    orderBy: { created_at: 'desc' },
    take: 200,
  });
  const out = [];
  for (const d of deals) {
    const policy = await policyById(db() as unknown as Tx, d.policy_version_id);
    const geo = dealGeo(d);
    const [e] = await findEligibleCarriers(db() as unknown as Tx, geo, bandsForDeal(d, policy), policy, orgId);
    if (!e) continue;
    const myQuote = d.quotes.find((q) => ['SUBMITTED', 'SELECTED'].includes(q.status)) ?? null;
    const deadline = d.status === 'PAID' ? d.shipment?.reassignment_deadline_at : (d.retry_deadline_at ?? d.carrier_deadline_at);
    out.push({ deal: d, eligible: e, geo, policy, myQuote, deadline });
  }
  return out;
}

function opportunityDto(o: Awaited<ReturnType<typeof opportunitiesFor>>[number]) {
  const snap = o.deal.commercial_snapshot as { listing: { title: string }; category: { name_ar: string; cargo_class: string }; mine: { name: string; region_code: string; lat: number; lng: number }; delivery_site: { name: string; region_code: string; lat: number; lng: number }; loading_conditions: string };
  const estimate = new Prisma.Decimal(o.geo.straightLineMineToFactory).times(o.policy.route_estimate_factor).toDecimalPlaces(1);
  // SCR-OPP-02: no competitor prices and no material price are exposed to carriers.
  return {
    deal_id: o.deal.id,
    reference: o.deal.reference,
    status: o.deal.status,
    is_reassignment: o.deal.status === 'PAID',
    material: { title: snap.listing.title, category_name: snap.category.name_ar, cargo_class: snap.category.cargo_class },
    quantity_tons: qty(o.deal.quantity_tons),
    origin: { mine_name: snap.mine.name, region_code: snap.mine.region_code, lat: snap.mine.lat, lng: snap.mine.lng },
    destination: { site_name: snap.delivery_site.name, region_code: snap.delivery_site.region_code, lat: snap.delivery_site.lat, lng: snap.delivery_site.lng },
    loading_conditions: snap.loading_conditions,
    loading_window_start: o.deal.loading_window_start.toISOString(),
    loading_window_end: o.deal.loading_window_end.toISOString(),
    distance_band: o.eligible.band,
    straight_line_km_to_mine: o.eligible.straightLineKmToMine.toFixed(1),
    straight_line_km_mine_to_factory: o.geo.straightLineMineToFactory.toFixed(1),
    route_estimate_km: estimate.toFixed(1),
    distance_label: STRAIGHT_LINE_LABEL,
    nearest_location: o.eligible.nearestLocation,
    eligible_services: o.eligible.services.map((s) => ({
      id: s.service.id,
      name: s.service.name,
      vehicle_type: s.service.vehicle_type_code,
      payload_tons_per_vehicle: qty(s.service.payload_tons_per_vehicle),
      pricing_model: s.version.pricing_model,
      includes_loading: s.service.includes_loading,
      includes_unloading: s.service.includes_unloading,
    })),
    deadline_at: o.deadline?.toISOString() ?? null,
    my_quote: o.myQuote ? { id: o.myQuote.id, status: o.myQuote.status, total: money(o.myQuote.transport_total_halalas) } : null,
  };
}

carriersRouter.get('/carrier/opportunities', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const q = parse(oppQuery, req.query);
  const bands = q['filter[band]']?.split(',').filter(Boolean);
  const list = (await opportunitiesFor(org.id))
    .filter((o) => !bands?.length || bands.includes(o.eligible.band))
    .filter((o) => !q['filter[region]'] || o.geo.mine.region_code === q['filter[region]']);
  const hasPricing = (await db().carrierPricingRuleVersion.count({ where: { status: 'ACTIVE', rule: { organization_id: org.id, is_active: true } } })) > 0;
  res.json({ data: list.map(opportunityDto), has_active_pricing: hasPricing });
});

carriersRouter.get('/carrier/opportunities/:dealId', async (req, res) => {
  const org = requireActiveOrg(req, 'CARRIER');
  const [o] = await opportunitiesFor(org.id, idParam(req.params.dealId));
  if (!o) throw notFound();
  const locations = await db().carrierOperatingLocation.findMany({ where: { organization_id: org.id, is_active: true } });
  res.json({ ...opportunityDto(o), operating_locations: locations.map((l) => ({ id: l.id, name: l.name })) });
});

export { auth };
