import { expect } from 'vitest';
import { db } from '../src/db.js';
import { HOUR, now } from '../src/lib/clock.js';
import { ensureReferenceData } from '../src/seed/reference.js';
import { orgClient, type Client } from './helpers.js';

export const iso = (msFromNow: number) => new Date(now().getTime() + msFromNow).toISOString();

export async function createCarrier(opts: { ratePerTonKm?: string; lat?: number; lng?: number } = {}) {
  const c = await orgClient('CARRIER', {
    site: { name: 'ساحة اختبار', location_kind: 'FLEET_YARD', region_code: 'MAKKAH', lat: opts.lat ?? 21.4, lng: opts.lng ?? 40.3 },
  });
  const svc = await c.client.post('/carrier/services', {
    name: 'قلابات',
    vehicle_type_code: 'DUMP_TRUCK',
    supported_cargo_classes: ['BULK_SOLID'],
    payload_tons_per_vehicle: '34',
    vehicles_available: 10,
    min_shipment_tons: '10',
    max_shipment_tons: '5000',
    includes_loading: true,
  });
  expect(svc.status).toBe(201);
  const rule = await c.client.post('/carrier/pricing-rules', {
    service_id: svc.body.id,
    name: 'أساسي',
    version: { pricing_model: 'PER_TON_KM', rate_per_ton_km: opts.ratePerTonKm ?? '0.2000', activate: true },
  });
  expect(rule.status).toBe(201);
  expect(rule.body.active_version_id).toBeTruthy();
  const loc = await c.client.get('/carrier/operating-locations');
  return { ...c, serviceId: svc.body.id as string, locationId: loc.body.data[0].id as string };
}

export interface World {
  mine: Client;
  mineOrgId: string;
  mineId: string;
  listingId: string;
  factory: Client;
  factoryOrgId: string;
  siteId: string;
  carrier: Awaited<ReturnType<typeof createCarrier>>;
}

/** A mine with a published SLAG listing, a factory with a site, and one eligible carrier. */
export async function createWorld(totalTons = '2000'): Promise<World> {
  await ensureReferenceData();
  const mine = await orgClient('MINE');
  const mines = await mine.client.get('/mines?filter[org]=mine');
  const mineId = mines.body.data[0].id;
  const slag = await db().materialCategory.findUniqueOrThrow({ where: { code: 'SLAG' } });
  const listing = await mine.client.post('/material-listings', {
    mine_id: mineId,
    category_id: slag.id,
    title: 'خبث اختبار',
    physical_state: 'GRANULAR',
    total_quantity: totalTons,
    asking_price_halalas: 4500,
    loading_conditions: 'تحميل من الساحة',
    specifications: [{ property_name: 'Fe', value_numeric: 40, unit: '%', verification_status: 'DECLARED' }],
  });
  expect(listing.status).toBe(201);
  expect((await mine.client.post(`/material-listings/${listing.body.id}/publish`)).status).toBe(200);

  const factory = await orgClient('FACTORY');
  const sites = await factory.client.get('/factory-sites');
  const carrier = await createCarrier();
  return {
    mine: mine.client,
    mineOrgId: mine.orgId,
    mineId,
    listingId: listing.body.id,
    factory: factory.client,
    factoryOrgId: factory.orgId,
    siteId: sites.body.data[0].id,
    carrier,
  };
}

export const WINDOW = () => ({ loading_window_start: iso(72 * HOUR), loading_window_end: iso(120 * HOUR) });

export async function submitOffer(w: World, qty = '600', price = 4000) {
  const r = await w.factory.post('/offers', { listing_id: w.listingId, quantity_tons: qty, unit_price_halalas: price, delivery_site_id: w.siteId });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

/** Offer accepted directly by the mine → deal PENDING_CARRIER. */
export async function createDeal(w: World, qty = '600') {
  const offerId = await submitOffer(w, qty);
  const r = await w.mine.post(`/offers/${offerId}/accept`, WINDOW());
  expect(r.status).toBe(201);
  return r.body.deal.id as string;
}

export async function submitQuote(w: World, dealId: string, carrier = w.carrier, pickupHours = 80, routeKm = '180') {
  const r = await carrier.client.post(`/deals/${dealId}/quotes`, {
    service_id: carrier.serviceId,
    operating_location_id: carrier.locationId,
    route_distance_km: routeKm,
    proposed_pickup_at: iso(pickupHours * HOUR),
    estimated_transit_hours: 6,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

/** Deal → quote → selection → simulated payment: returns ids for shipment-stage tests. */
export async function createPaidDeal(w: World, qty = '600') {
  const dealId = await createDeal(w, qty);
  const quote = await submitQuote(w, dealId);
  const sel = await w.factory.post(`/deals/${dealId}/quotes/${quote.id}/select`, {});
  expect(sel.status, JSON.stringify(sel.body)).toBe(200);
  const pay = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`, {});
  expect(pay.status, JSON.stringify(pay.body)).toBe(201);
  return { dealId, quoteId: quote.id as string, invoiceId: sel.body.invoice.id as string, shipmentId: sel.body.shipment.id as string };
}
