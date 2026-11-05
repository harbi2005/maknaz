import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { advanceClock, HOUR, resetClock } from '../src/lib/clock.js';
import { processDueDeadlines } from '../src/modules/scheduler/processor.js';
import { orgClient } from './helpers.js';
import { createCarrier, createDeal, createPaidDeal, createWorld, iso, submitOffer, submitQuote, WINDOW } from './world.js';

afterEach(() => resetClock());

const listing = (id: string) => db().materialListing.findUniqueOrThrow({ where: { id } });

describe('E2E business lifecycle (AC-01..18)', () => {
  it('runs offer → counter → agreement → carrier → three-party → payment → shipment → completion', async () => {
    const w = await createWorld();

    // Factory offers, mine counters (round 2), factory accepts the counter.
    const offerId = await submitOffer(w, '600', 4000);
    const counter = await w.mine.post(`/offers/${offerId}/counter`, { unit_price_halalas: 4200, quantity_tons: '600', ...WINDOW() });
    expect(counter.status).toBe(201);
    expect(counter.body.status).toBe('COUNTERED');
    // BR-022: only one counter-offer.
    expect((await w.mine.post(`/offers/${offerId}/counter`, { unit_price_halalas: 4300, quantity_tons: '600', ...WINDOW() })).status).toBe(409);
    const agreed = await w.factory.post(`/offers/${offerId}/counter/accept`);
    expect(agreed.status).toBe(201);
    const dealId = agreed.body.deal.id;
    expect(agreed.body.deal.status).toBe('PENDING_CARRIER');

    // BR-027: quantity reserved at agreement.
    let l = await listing(w.listingId);
    expect(l.reserved_quantity.toFixed(3)).toBe('600.000');

    // BR-041: no invoice before three-party confirmation.
    let deal = await w.factory.get(`/deals/${dealId}`);
    expect(deal.body.invoice).toBeNull();
    expect(deal.body.commercial.material_total.amount_halalas).toBe(2_520_000);

    const eligible = await w.factory.get(`/deals/${dealId}/eligible-carriers`);
    expect(eligible.body.data.map((e: { carrier: { id: string } }) => e.carrier.id)).toContain(w.carrier.orgId);
    expect(eligible.body.data[0].distance_label).toBe('مسافة مباشرة تقريبية');

    // Carrier sees the opportunity without the material price, then quotes (price computed server-side).
    const opp = await w.carrier.client.get(`/carrier/opportunities/${dealId}`);
    expect(opp.status).toBe(200);
    expect(JSON.stringify(opp.body)).not.toContain('unit_price');
    const quote = await submitQuote(w, dealId);
    expect(quote.total.amount_halalas).toBe(2_160_000);

    const sel = await w.factory.post(`/deals/${dealId}/quotes/${quote.id}/select`, { unit_price: 1, total: 1 });
    expect(sel.status).toBe(200);
    expect(sel.body.deal.status).toBe('AWAITING_PAYMENT');
    expect(sel.body.invoice.grand_total.amount_halalas).toBe(4_680_000);
    expect(sel.body.shipment.status).toBe('CARRIER_CONFIRMED');

    // Simulated payment is idempotent (BR-043).
    const key = `pay-${Date.now()}`;
    const pay1 = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`, { amount_halalas: 1 }, { idem: key });
    expect(pay1.status).toBe(201);
    expect(pay1.body.payment.amount.amount_halalas).toBe(4_680_000); // client amount ignored (SEC-06)
    expect(pay1.body.payment.simulated_reference).toMatch(/^SIM-PAY-/);
    const replay = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`, { amount_halalas: 1 }, { idem: key });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.payment.id).toBe(pay1.body.payment.id);
    const reused = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`, { kind: 'PRIMARY', x: 2 }, { idem: key });
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const again = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`, {});
    expect(again.body.error.code).toBe('ALREADY_PAID');
    expect(await db().simulatedPayment.count({ where: { invoice_id: sel.body.invoice.id } })).toBe(1);

    const inv = await w.mine.get(`/invoices/${sel.body.invoice.id}`);
    expect(inv.body.is_simulated).toBe(true);
    expect(inv.body.simulation_label).toContain('DEMO / SIMULATION');

    // Shipment progression by authorised parties only.
    const shipmentId = sel.body.shipment.id;
    expect((await w.carrier.client.post(`/shipments/${shipmentId}/deliver`)).status).toBe(409);
    expect((await w.mine.post(`/shipments/${shipmentId}/ready`)).body.status).toBe('READY_FOR_PICKUP');
    expect((await w.factory.post(`/shipments/${shipmentId}/pickup`)).status).toBe(403);
    const picked = await w.carrier.client.post(`/shipments/${shipmentId}/pickup`, { loaded_tons: '600' });
    expect(picked.body.status).toBe('PICKED_UP');
    expect((await w.factory.get(`/deals/${dealId}`)).body.status).toBe('IN_FULFILLMENT');
    expect((await w.carrier.client.post(`/shipments/${shipmentId}/in-transit`)).body.status).toBe('IN_TRANSIT');
    expect((await w.carrier.client.post(`/shipments/${shipmentId}/deliver`)).body.status).toBe('DELIVERED');
    expect((await w.mine.post(`/shipments/${shipmentId}/confirm-receipt`)).status).toBe(403);
    const done = await w.factory.post(`/shipments/${shipmentId}/confirm-receipt`, { received_tons: '600' });
    expect(done.body.status).toBe('COMPLETED');

    deal = await w.factory.get(`/deals/${dealId}`);
    expect(deal.body.status).toBe('COMPLETED');
    l = await listing(w.listingId);
    expect(l.reserved_quantity.toFixed(3)).toBe('0.000');
    expect(l.sold_quantity.toFixed(3)).toBe('600.000');
    const res = await db().inventoryReservation.findUniqueOrThrow({ where: { deal_id: dealId } });
    expect(res.status).toBe('CONSUMED');
    const shipment = await w.factory.get(`/shipments/${shipmentId}`);
    expect(shipment.body.events.map((e: { to_status: string }) => e.to_status)).toEqual(
      expect.arrayContaining(['PENDING_CARRIER', 'CARRIER_CONFIRMED', 'SCHEDULED', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']),
    );
  });
});

describe('negotiation rules', () => {
  it('rejection lets the factory submit a new offer; one open offer per listing (BR-021/023)', async () => {
    const w = await createWorld();
    const first = await submitOffer(w);
    const dup = await w.factory.post('/offers', { listing_id: w.listingId, quantity_tons: '10', unit_price_halalas: 4000, delivery_site_id: w.siteId });
    expect(dup.body.error.code).toBe('OPEN_OFFER_EXISTS');
    expect((await w.mine.post(`/offers/${first}/reject`, { note: 'السعر منخفض' })).body.status).toBe('REJECTED');
    await submitOffer(w);
  });

  it('rejects quantities above the available amount and counter-offers that raise quantity', async () => {
    const w = await createWorld('100');
    const big = await w.factory.post('/offers', { listing_id: w.listingId, quantity_tons: '101', unit_price_halalas: 4000, delivery_site_id: w.siteId });
    expect(big.body.error.code).toBe('QUANTITY_EXCEEDS_AVAILABLE');
    const id = await submitOffer(w, '50');
    const more = await w.mine.post(`/offers/${id}/counter`, { unit_price_halalas: 4100, quantity_tons: '60', ...WINDOW() });
    expect(more.body.error.code).toBe('QUANTITY_EXCEEDS_ORIGINAL');
    const same = await w.mine.post(`/offers/${id}/counter`, { unit_price_halalas: 4000, quantity_tons: '50', ...WINDOW() });
    expect(same.body.error.code).toBe('COUNTER_PRICE_UNCHANGED');
  });

  it('expires a round after 48h through the deadline worker (BR-024)', async () => {
    const w = await createWorld();
    const id = await submitOffer(w);
    advanceClock(49 * HOUR);
    await processDueDeadlines(10_000);
    expect((await w.factory.get(`/offers/${id}`)).body.status).toBe('EXPIRED');
    expect((await w.mine.post(`/offers/${id}/accept`, WINDOW())).status).toBe(409);
  });

  it('settles concurrent acceptance of the last tonnes atomically (BR-028/029, TS-040)', async () => {
    const w = await createWorld('600');
    const factory2 = await orgClient('FACTORY');
    const site2 = (await factory2.client.get('/factory-sites')).body.data[0].id;
    const a = await submitOffer(w, '600');
    const b = (await factory2.client.post('/offers', { listing_id: w.listingId, quantity_tons: '600', unit_price_halalas: 4000, delivery_site_id: site2 })).body.id;
    const [ra, rb] = await Promise.all([w.mine.post(`/offers/${a}/accept`, WINDOW()), w.mine.post(`/offers/${b}/accept`, WINDOW())]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect([ra.body, rb.body].find((x) => x.error)?.error.code).toBe('INSUFFICIENT_QUANTITY');
    const l = await listing(w.listingId);
    expect(l.reserved_quantity.toFixed(3)).toBe('600.000');
  });
});

describe('deadlines and cancellation (BR-037, BR-044, BR-071, OD-08)', () => {
  it('moves to the retry window after 24h, then cancels and releases the reservation', async () => {
    const w = await createWorld();
    const dealId = await createDeal(w);
    advanceClock(25 * HOUR);
    await processDueDeadlines(10_000);
    expect((await w.factory.get(`/deals/${dealId}`)).body.status).toBe('PENDING_CARRIER_RETRY');
    advanceClock(24 * HOUR);
    await processDueDeadlines(10_000);
    const d = await w.factory.get(`/deals/${dealId}`);
    expect(d.body.status).toBe('CANCELLED');
    expect(d.body.cancellation.reason).toBe('NO_CARRIER_CONFIRMED');
    expect((await listing(w.listingId)).reserved_quantity.toFixed(3)).toBe('0.000');
  });

  it('cancels when the simulated payment window lapses (PAYMENT_EXPIRED)', async () => {
    const w = await createWorld();
    const dealId = await createDeal(w);
    const q = await submitQuote(w, dealId);
    const sel = await w.factory.post(`/deals/${dealId}/quotes/${q.id}/select`);
    advanceClock(25 * HOUR);
    const late = await w.factory.post(`/invoices/${sel.body.invoice.id}/simulated-payments`);
    expect(late.body.error.code).toBe('PAYMENT_EXPIRED');
    await processDueDeadlines(10_000);
    const d = await w.factory.get(`/deals/${dealId}`);
    expect(d.body.status).toBe('CANCELLED');
    expect(d.body.cancellation.reason).toBe('PAYMENT_EXPIRED');
    expect(d.body.invoice.payment_status).toBe('PAYMENT_EXPIRED');
  });

  it('lets parties cancel before payment only; the admin cancels after payment with a full simulated refund', async () => {
    const w = await createWorld();
    const pre = await createDeal(w, '100');
    expect((await w.mine.post(`/deals/${pre}/cancel`, { reason_text: 'توقف التشغيل مؤقتًا' })).body.status).toBe('CANCELLED');

    const paid = await createPaidDeal(w, '200');
    const denied = await w.factory.post(`/deals/${paid.dealId}/cancel`, { reason_text: 'لم نعد بحاجة' });
    expect(denied.body.error.code).toBe('CANCELLATION_REQUIRES_ADMIN');
    const { adminClient } = await import('./helpers.js');
    const admin = await adminClient();
    const r = await admin.post(`/admin/deals/${paid.dealId}/cancel`, { reason_text: 'إلغاء إداري للاختبار', fault_party: 'NONE' });
    expect(r.body.status).toBe('CANCELLED');
    const inv = await w.factory.get(`/invoices/${paid.invoiceId}`);
    expect(inv.body.refunds).toHaveLength(1);
    expect(inv.body.refunded_total.amount_halalas).toBe(inv.body.paid_total.amount_halalas);
    expect(inv.body.payment_status).toBe('SIMULATED_REFUND_COMPLETED');
  });

  it('auto-cancels a missed pickup after the 2h grace with a full refund (PICKUP_MISSED)', async () => {
    const w = await createWorld();
    const paid = await createPaidDeal(w);
    advanceClock(83 * HOUR);
    await processDueDeadlines(10_000);
    const d = await w.factory.get(`/deals/${paid.dealId}`);
    expect(d.body.status).toBe('CANCELLED');
    expect(d.body.cancellation.reason).toBe('PICKUP_MISSED');
    expect((await w.factory.get(`/invoices/${paid.invoiceId}`)).body.refunds).toHaveLength(1);
  });

  it('marks an overdue in-transit shipment DELAYED, never cancelled (BR-072)', async () => {
    const w = await createWorld();
    const paid = await createPaidDeal(w);
    await w.carrier.client.post(`/shipments/${paid.shipmentId}/pickup`);
    await w.carrier.client.post(`/shipments/${paid.shipmentId}/in-transit`);
    advanceClock(9 * HOUR);
    await processDueDeadlines(10_000);
    expect((await w.factory.get(`/shipments/${paid.shipmentId}`)).body.status).toBe('DELAYED');
    expect((await w.factory.get(`/deals/${paid.dealId}`)).body.status).toBe('IN_FULFILLMENT');
  });
});

describe('shipment extensions — mine only (BR-060..066, SEC-09/10)', () => {
  it('enforces who may extend, the 72h cap, and the 2-extension limit', async () => {
    const w = await createWorld();
    const paid = await createPaidDeal(w);
    const ship = (await w.mine.get(`/shipments/${paid.shipmentId}`)).body;
    const base = new Date(ship.pickup_deadline_at).getTime();
    const body = (h: number) => ({ new_pickup_deadline_at: new Date(base + h * HOUR).toISOString(), reason_code: 'MATERIAL_NOT_READY', reason_text: 'تأخر تجهيز الدفعة بسبب صيانة' });

    expect((await w.factory.post(`/shipments/${paid.shipmentId}/extensions`, body(24))).body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await w.carrier.client.post(`/shipments/${paid.shipmentId}/extensions`, body(24))).body.error.code).toBe('FORBIDDEN_ROLE');
    const otherMine = await orgClient('MINE');
    expect((await otherMine.client.post(`/shipments/${paid.shipmentId}/extensions`, body(24))).status).toBe(404);
    expect((await w.mine.post(`/shipments/${paid.shipmentId}/extensions`, body(73))).body.error.code).toBe('EXTENSION_TOO_LONG');

    const e1 = await w.mine.post(`/shipments/${paid.shipmentId}/extensions`, body(24));
    expect(e1.status).toBe(201);
    expect(e1.body.shipment.status).toBe('RECONFIRM_REQUIRED');
    expect(e1.body.extension.reconfirmation_status).toBe('PENDING');
    expect((await w.carrier.client.post(`/shipments/${paid.shipmentId}/reconfirm`, { decision: 'CONFIRM' })).body.status).toBe('SCHEDULED');

    const e2 = await w.mine.post(`/shipments/${paid.shipmentId}/extensions`, { ...body(48), new_pickup_deadline_at: new Date(base + 48 * HOUR).toISOString() });
    expect(e2.status).toBe(201);
    const e3 = await w.mine.post(`/shipments/${paid.shipmentId}/extensions`, { ...body(60), new_pickup_deadline_at: new Date(base + 60 * HOUR).toISOString() });
    expect(e3.body.error.code).toBe('EXTENSION_LIMIT_REACHED');
  });

  it('releases a declining carrier, reassigns at a lower price and refunds the difference (BR-065/066)', async () => {
    const w = await createWorld();
    const paid = await createPaidDeal(w);
    const ship = (await w.mine.get(`/shipments/${paid.shipmentId}`)).body;
    await w.mine.post(`/shipments/${paid.shipmentId}/extensions`, {
      new_pickup_deadline_at: new Date(new Date(ship.pickup_deadline_at).getTime() + 24 * HOUR).toISOString(),
      reason_code: 'EQUIPMENT_ISSUE',
      reason_text: 'تعطل الكسارة الرئيسية',
    });
    const declined = await w.carrier.client.post(`/shipments/${paid.shipmentId}/reconfirm`, { decision: 'DECLINE', reason: 'لا تتوفر مركبات' });
    expect(declined.body.status).toBe('PENDING_CARRIER');
    expect(declined.body.reassignment_deadline_at).toBeTruthy();
    // The released carrier can no longer act on the shipment (SEC-11).
    expect((await w.carrier.client.post(`/shipments/${paid.shipmentId}/pickup`)).status).toBe(404);

    const cheaper = await createCarrier({ ratePerTonKm: '0.1500' });
    const q2 = await submitQuote(w, paid.dealId, cheaper, 82);
    const sel = await w.factory.post(`/deals/${paid.dealId}/quotes/${q2.id}/select`, {});
    expect(sel.status, JSON.stringify(sel.body)).toBe(200);
    expect(sel.body.shipment.status).toBe('SCHEDULED');
    const inv = await w.factory.get(`/invoices/${paid.invoiceId}`);
    expect(inv.body.refunds[0].amount.amount_halalas).toBe(2_160_000 - 1_620_000);
  });
});

describe('authorization on the transaction flow (RBAC_MATRIX §5)', () => {
  it('hides other parties offers and deals with 404 (SEC-01/02/14)', async () => {
    const w = await createWorld();
    const offerId = await submitOffer(w);
    const outsider = await orgClient('FACTORY');
    expect((await outsider.client.get(`/offers/${offerId}`)).status).toBe(404);
    const otherMine = await orgClient('MINE');
    expect((await otherMine.client.post(`/offers/${offerId}/accept`, WINDOW())).status).toBe(404);
    expect((await w.factory.post(`/offers/${offerId}/withdraw`)).body.status).toBe('WITHDRAWN');
    const paid = await createPaidDeal(w, '100');
    expect((await outsider.client.get(`/deals/${paid.dealId}`)).status).toBe(404);
    expect((await outsider.client.get(`/invoices/${paid.invoiceId}`)).status).toBe(404);
  });

  it('rejects a carrier price field and quotes from ineligible carriers (SEC-07, BR-031)', async () => {
    const w = await createWorld();
    const dealId = await createDeal(w);
    const q = await w.carrier.client.post(`/deals/${dealId}/quotes`, {
      service_id: w.carrier.serviceId,
      operating_location_id: w.carrier.locationId,
      route_distance_km: '180',
      proposed_pickup_at: iso(80 * HOUR),
      estimated_transit_hours: 6,
      transport_total_halalas: 1,
      price: 1,
    });
    expect(q.body.total.amount_halalas).toBe(2_160_000);
    const far = await orgClient('CARRIER', { site: { name: 'بعيد', location_kind: 'DEPOT', region_code: 'EASTERN', lat: 26.4, lng: 50.1 } });
    const r = await far.client.post(`/deals/${dealId}/quotes`, { service_id: w.carrier.serviceId, operating_location_id: w.carrier.locationId, route_distance_km: '180', proposed_pickup_at: iso(80 * HOUR), estimated_transit_hours: 6 });
    expect(r.status).toBe(403);
  });

  it('refuses route distances shorter than the straight line and pickups outside the window', async () => {
    const w = await createWorld();
    const dealId = await createDeal(w);
    const base = { service_id: w.carrier.serviceId, operating_location_id: w.carrier.locationId, estimated_transit_hours: 6 };
    const short = await w.carrier.client.post(`/deals/${dealId}/quotes`, { ...base, route_distance_km: '10', proposed_pickup_at: iso(80 * HOUR) });
    expect(short.body.error.code).toBe('ROUTE_DISTANCE_TOO_SHORT');
    const outside = await w.carrier.client.post(`/deals/${dealId}/quotes`, { ...base, route_distance_km: '180', proposed_pickup_at: iso(200 * HOUR) });
    expect(outside.body.error.code).toBe('PICKUP_OUTSIDE_WINDOW');
  });
});
