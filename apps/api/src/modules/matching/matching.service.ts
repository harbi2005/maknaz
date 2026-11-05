import { distanceBand, haversineKm, round1, ROUTE_ESTIMATE_LABEL, STRAIGHT_LINE_LABEL, type DistanceBand } from '@maknaz/shared';
import { Prisma, type CarrierPricingRuleVersion, type CarrierService, type Deal } from '../../generated/prisma/client.js';
import type { Tx } from '../../db.js';
import { now } from '../../lib/clock.js';
import { money, num } from '../../lib/serialize.js';
import { notifyOrgs } from '../notifications/notify.js';
import { policyById, type PolicyValues } from '../policy/policy.js';
import { calculatePrice, type PricingParams } from '../pricing/engine.js';

export interface DealGeo {
  cargoClass: string;
  quantity: Prisma.Decimal;
  mine: { lat: number; lng: number; region_code: string };
  site: { lat: number; lng: number; region_code: string };
  straightLineMineToFactory: number;
}

export function dealGeo(deal: Deal): DealGeo {
  const s = deal.commercial_snapshot as {
    category: { cargo_class: string };
    mine: { lat: number; lng: number; region_code: string };
    delivery_site: { lat: number; lng: number; region_code: string };
    straight_line_km_mine_to_factory: string;
  };
  return {
    cargoClass: s.category.cargo_class,
    quantity: deal.quantity_tons,
    mine: s.mine,
    site: s.delivery_site,
    straightLineMineToFactory: Number(s.straight_line_km_mine_to_factory),
  };
}

export interface EligibleService {
  service: CarrierService;
  version: CarrierPricingRuleVersion;
}

export interface EligibleCarrier {
  carrierOrgId: string;
  carrierName: string;
  nearestLocation: { id: string; name: string; lat: number; lng: number };
  straightLineKmToMine: number;
  band: DistanceBand;
  services: EligibleService[];
}

/** Picks the version valid at `at` (ACTIVE, valid_from ≤ at < valid_to). */
function activeVersion(versions: CarrierPricingRuleVersion[], at: Date) {
  return versions.find((v) => v.status === 'ACTIVE' && v.valid_from <= at && (!v.valid_to || v.valid_to > at)) ?? null;
}

/**
 * BR-031 eligibility (all mandatory) + BR-032 banding by straight-line distance from the
 * carrier's nearest ACTIVE operating location to the mine. Proximity never overrides eligibility.
 */
export async function findEligibleCarriers(
  tx: Tx,
  geo: DealGeo,
  bands: string[],
  policy: PolicyValues,
  onlyOrgId?: string,
): Promise<EligibleCarrier[]> {
  const at = now();
  const orgs = await tx.organization.findMany({
    where: {
      type: 'CARRIER',
      status: 'ACTIVE',
      ...(onlyOrgId ? { id: onlyOrgId } : {}),
      service_areas: {
        some: { OR: [{ area_type: 'COUNTRY', country_code: 'SA' }, { area_type: 'REGION', region_code: geo.mine.region_code }] },
      },
    },
    include: {
      service_areas: true,
      operating_locations: { where: { is_active: true } },
      carrier_services: {
        where: {
          is_active: true,
          mode: { is_enabled: true },
          supported_cargo_classes: { has: geo.cargoClass },
          min_shipment_tons: { lte: geo.quantity },
          max_shipment_tons: { gte: geo.quantity },
        },
        include: { rules: { where: { is_active: true }, include: { versions: true } } },
      },
    },
  });

  const result: EligibleCarrier[] = [];
  for (const org of orgs) {
    const covers = (region: string) =>
      org.service_areas.some(
        (a) => (a.area_type === 'COUNTRY' && a.country_code === 'SA') || (a.area_type === 'REGION' && a.region_code === region),
      );
    if (!covers(geo.mine.region_code) || !covers(geo.site.region_code)) continue;
    if (org.operating_locations.length === 0) continue;

    const services: EligibleService[] = [];
    for (const service of org.carrier_services) {
      for (const rule of service.rules) {
        const v = activeVersion(rule.versions, at);
        if (!v) continue;
        if (v.pricing_model === 'FIXED_ROUTE' &&
          (v.route_origin_region !== geo.mine.region_code || v.route_destination_region !== geo.site.region_code)) continue;
        if (v.min_weight_tons && geo.quantity.lt(v.min_weight_tons)) continue;
        if (v.max_weight_tons && geo.quantity.gt(v.max_weight_tons)) continue;
        services.push({ service, version: v });
        break;
      }
    }
    if (services.length === 0) continue;

    let nearest = org.operating_locations[0]!;
    let best = Infinity;
    for (const loc of org.operating_locations) {
      const d = haversineKm({ lat: num(loc.lat)!, lng: num(loc.lng)! }, geo.mine);
      if (d < best) {
        best = d;
        nearest = loc;
      }
    }
    const km = round1(best);
    const band = distanceBand(km, policy.distance_band_limits_km);
    if (!bands.includes(band)) continue;
    result.push({
      carrierOrgId: org.id,
      carrierName: org.legal_name_ar,
      nearestLocation: { id: nearest.id, name: nearest.name, lat: num(nearest.lat)!, lng: num(nearest.lng)! },
      straightLineKmToMine: km,
      band,
      services,
    });
  }
  // BR-032 ordering: band, then distance.
  return result.sort((a, b) => a.band.localeCompare(b.band) || a.straightLineKmToMine - b.straightLineKmToMine);
}

export function bandsForDeal(deal: Deal, policy: PolicyValues): string[] {
  const reassignment = deal.status === 'PAID';
  return deal.status === 'PENDING_CARRIER_RETRY' || reassignment ? policy.retry_matching_bands : policy.initial_matching_bands;
}

export function toPricingParams(v: CarrierPricingRuleVersion): PricingParams {
  return v as unknown as PricingParams;
}

/** Non-binding indicative price using the labelled route estimate (straight line × 1.3, OD-10). */
export function indicativePrice(e: EligibleService, geo: DealGeo, policy: PolicyValues) {
  const estimate = new Prisma.Decimal(geo.straightLineMineToFactory).times(policy.route_estimate_factor).toDecimalPlaces(1);
  try {
    const snap = calculatePrice(
      toPricingParams(e.version),
      {
        weightTons: geo.quantity,
        routeDistanceKm: estimate,
        payloadTonsPerVehicle: e.service.payload_tons_per_vehicle,
        serviceMinTons: e.service.min_shipment_tons,
        serviceMaxTons: e.service.max_shipment_tons,
      },
      now(),
    );
    return { ...money(snap.total_halalas), label: 'تقدير من قاعدة الناقل — غير ملزم', route_estimate_km: estimate.toFixed(1), route_estimate_label: ROUTE_ESTIMATE_LABEL };
  } catch {
    return null;
  }
}

export function eligibleCarrierDto(e: EligibleCarrier, geo: DealGeo, policy: PolicyValues, hasQuote: boolean) {
  return {
    carrier: { id: e.carrierOrgId, name_ar: e.carrierName },
    nearest_location: { id: e.nearestLocation.id, name: e.nearestLocation.name },
    straight_line_km_to_mine: e.straightLineKmToMine.toFixed(1),
    distance_band: e.band,
    distance_label: STRAIGHT_LINE_LABEL,
    services: e.services.map((s) => ({
      id: s.service.id,
      name: s.service.name,
      vehicle_type: s.service.vehicle_type_code,
      payload_tons_per_vehicle: s.service.payload_tons_per_vehicle.toFixed(3),
      pricing_model: s.version.pricing_model,
    })),
    indicative_price: e.services[0] ? indicativePrice(e.services[0], geo, policy) : null,
    has_submitted_quote: hasQuote,
  };
}

/** BUSINESS_RULES §9: notify eligible carriers about a new (or retry/reassignment) opportunity. */
export async function notifyEligibleCarriers(tx: Tx, dealId: string, retry: boolean) {
  const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
  const policy = await policyById(tx, deal.policy_version_id);
  const eligible = await findEligibleCarriers(tx, dealGeo(deal), bandsForDeal(deal, policy), policy);
  await notifyOrgs(tx, eligible.map((e) => e.carrierOrgId), {
    eventType: retry ? 'OPPORTUNITY_RETRY' : 'OPPORTUNITY_NEW',
    titleAr: retry ? `فرصة شحن (فترة أخيرة) ${deal.reference}` : `فرصة شحن جديدة ${deal.reference}`,
    bodyAr: `${deal.quantity_tons.toFixed(3)} طن — قدّم عرضك الملزم قبل انتهاء المهلة.`,
    entityType: 'DEAL',
    entityId: deal.id,
    linkPath: `/carrier/opportunities/${deal.id}`,
  });
}
