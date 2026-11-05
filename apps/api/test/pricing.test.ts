import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { calculatePrice, sarToHalalas, type PricingParams } from '../src/modules/pricing/engine.js';

const D = (v: string | number) => new Prisma.Decimal(v);
const at = new Date('2026-11-04T10:00:00Z');

function params(over: Partial<PricingParams>): PricingParams {
  return {
    id: 'v1',
    pricing_model: 'PER_TON_KM',
    base_fee_halalas: 0n,
    rate_per_km: null,
    rate_per_ton: null,
    rate_per_ton_km: null,
    fixed_route_price_halalas: null,
    distance_basis: 'PER_SHIPMENT',
    loading_fee_halalas: 0n,
    unloading_fee_halalas: 0n,
    handling_fee_halalas: 0n,
    fee_basis: 'FLAT',
    waiting_fee_per_hour_halalas: 0n,
    free_waiting_hours: D(0),
    minimum_charge_halalas: 0n,
    min_weight_tons: null,
    max_weight_tons: null,
    ...over,
  };
}
const inputs = (w: string, km: string, payload = '34') => ({
  weightTons: D(w),
  routeDistanceKm: D(km),
  payloadTonsPerVehicle: D(payload),
  serviceMinTons: D(0),
  serviceMaxTons: D(100000),
});

describe('pricing engine — reference cases (data/templates/pricing_reference_cases.csv)', () => {
  const csv = fs.readFileSync(path.resolve(__dirname, '../../../data/templates/pricing_reference_cases.csv'), 'utf8').trim().split(/\r?\n/);
  const header = csv[0]!.split(',');
  const rows = csv.slice(1).map((line) => Object.fromEntries(line.split(',').map((v, i) => [header[i], v])));

  for (const r of rows) {
    it(`${r.case_id} (${r.test_ref}) ${r.pricing_model} → ${r.expected_total_halalas}`, () => {
      const p = params({
        pricing_model: r.pricing_model as PricingParams['pricing_model'],
        distance_basis: r.distance_basis as PricingParams['distance_basis'],
        base_fee_halalas: BigInt(r.base_fee_halalas || 0),
        rate_per_km: r.rate_per_km ? D(r.rate_per_km) : null,
        rate_per_ton: r.rate_per_ton ? D(r.rate_per_ton) : null,
        rate_per_ton_km: r.rate_per_ton_km ? D(r.rate_per_ton_km) : null,
        fixed_route_price_halalas: r.fixed_route_price_halalas ? BigInt(r.fixed_route_price_halalas) : null,
        loading_fee_halalas: BigInt(r.loading_fee_halalas || 0),
        fee_basis: (r.fee_basis || 'FLAT') as 'FLAT',
        minimum_charge_halalas: BigInt(r.minimum_charge_halalas || 0),
      });
      const snap = calculatePrice(p, inputs(r.weight_tons!, r.route_km!, r.payload_tons_per_vehicle || '34'), at);
      expect(snap.total_halalas).toBe(Number(r.expected_total_halalas));
    });
  }
});

describe('pricing engine — rules (ARCHITECTURE §5)', () => {
  it('TS-070: PER_TON_KM 600 t × 180 km × 0.20 = 21,600.00 SAR with 18 trips', () => {
    const s = calculatePrice(params({ rate_per_ton_km: D('0.20') }), inputs('600', '180'), at);
    expect(s.total_halalas).toBe(2_160_000);
    expect(s.inputs.trips).toBe(18);
    expect(s.lines).toHaveLength(1);
  });

  it('applies the minimum charge as a separate adjustment line (worked example 3)', () => {
    const s = calculatePrice(params({ pricing_model: 'PER_TON', rate_per_ton: D('40'), minimum_charge_halalas: 3_000_000n }), inputs('600', '180'), at);
    expect(s.total_halalas).toBe(3_000_000);
    expect(s.lines.find((l) => l.code === 'MINIMUM_CHARGE_ADJUSTMENT')?.amount_halalas).toBe(600_000);
  });

  it('rounds each line ROUND_HALF_UP to the halala (worked example 4)', () => {
    expect(sarToHalalas(D('0.005'))).toBe(1n);
    expect(sarToHalalas(D('0.004'))).toBe(0n);
    expect(sarToHalalas(D('12.345'))).toBe(1235n);
  });

  it('charges per-ton fees by weight and keeps waiting fees conditional (OD-20)', () => {
    const s = calculatePrice(
      params({ rate_per_ton_km: D('0.20'), loading_fee_halalas: 100n, fee_basis: 'PER_TON', waiting_fee_per_hour_halalas: 15000n, free_waiting_hours: D('2') }),
      inputs('600', '180'),
      at,
    );
    expect(s.lines.find((l) => l.code === 'LOADING')?.amount_halalas).toBe(60_000);
    expect(s.total_halalas).toBe(2_160_000 + 60_000);
    expect(s.conditional[0]?.rate_halalas_per_hour).toBe(15000);
  });

  it('PER_KM per shipment does not multiply by trips', () => {
    const s = calculatePrice(params({ pricing_model: 'PER_KM', rate_per_km: D('12'), distance_basis: 'PER_SHIPMENT' }), inputs('600', '180'), at);
    expect(s.total_halalas).toBe(216_000);
  });

  it('rejects weights outside the service or version limits (CAPACITY_MISMATCH)', () => {
    expect(() => calculatePrice(params({ rate_per_ton_km: D('0.2'), max_weight_tons: D('500') }), inputs('600', '180'), at)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_MISMATCH' }),
    );
  });

  it('rejects a route shorter than the straight-line distance and flags > 3× for review', () => {
    const base = { ...inputs('600', '100'), straightLineKmMineToFactory: D('142.6') };
    expect(() => calculatePrice(params({ rate_per_ton_km: D('0.2') }), base, at)).toThrow(expect.objectContaining({ code: 'ROUTE_DISTANCE_TOO_SHORT' }));
    const far = calculatePrice(params({ rate_per_ton_km: D('0.2') }), { ...inputs('600', '500'), straightLineKmMineToFactory: D('142.6') }, at);
    expect(far.warnings).toContain('ROUTE_DISTANCE_REVIEW');
  });

  it('never mixes models: FIXED_ROUTE ignores weight and distance', () => {
    const a = calculatePrice(params({ pricing_model: 'FIXED_ROUTE', fixed_route_price_halalas: 2_500_000n }), inputs('600', '180'), at);
    const b = calculatePrice(params({ pricing_model: 'FIXED_ROUTE', fixed_route_price_halalas: 2_500_000n }), inputs('100', '900'), at);
    expect(a.total_halalas).toBe(2_500_000);
    expect(b.total_halalas).toBe(2_500_000);
  });
});
