import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Parameters of one pricing rule version (carrier_pricing_rule_versions). */
export interface PricingParams {
  id: string;
  pricing_model: 'PER_KM' | 'PER_TON' | 'PER_TON_KM' | 'FIXED_ROUTE';
  base_fee_halalas: bigint;
  rate_per_km: Dec | null;
  rate_per_ton: Dec | null;
  rate_per_ton_km: Dec | null;
  fixed_route_price_halalas: bigint | null;
  distance_basis: 'PER_TRIP' | 'PER_SHIPMENT';
  loading_fee_halalas: bigint;
  unloading_fee_halalas: bigint;
  handling_fee_halalas: bigint;
  fee_basis: 'FLAT' | 'PER_TON';
  waiting_fee_per_hour_halalas: bigint;
  free_waiting_hours: Dec;
  minimum_charge_halalas: bigint;
  min_weight_tons: Dec | null;
  max_weight_tons: Dec | null;
}

export interface PricingInputs {
  weightTons: Dec;
  routeDistanceKm: Dec;
  payloadTonsPerVehicle: Dec;
  serviceMinTons: Dec;
  serviceMaxTons: Dec;
  straightLineKmMineToFactory?: Dec;
}

export interface PriceLine {
  code: 'BASE' | 'BASE_FEE' | 'LOADING' | 'UNLOADING' | 'HANDLING' | 'MINIMUM_CHARGE_ADJUSTMENT';
  label_ar: string;
  amount_halalas: number;
}

export interface PricingSnapshot {
  engine_version: '1.0';
  pricing_rule_version_id: string;
  model: PricingParams['pricing_model'];
  inputs: {
    weight_tons: string;
    route_distance_km: string;
    trips: number;
    payload_tons_per_vehicle: string;
    straight_line_km_mine_to_factory: string | null;
  };
  params: Record<string, string | number | null>;
  lines: PriceLine[];
  conditional: { code: 'WAITING'; label_ar: string; rate_halalas_per_hour: number; free_hours: string }[];
  warnings: string[];
  rounding: 'ROUND_HALF_UP_PER_LINE';
  total_halalas: number;
  currency: 'SAR';
  computed_at: string;
}

/** SAR (decimal) → integer halalas with ROUND_HALF_UP per line (ARCHITECTURE §5.4). */
export function sarToHalalas(sar: Dec): bigint {
  return BigInt(sar.times(100).toDecimalPlaces(0, D.ROUND_HALF_UP).toFixed(0));
}

const fmt = (d: Dec, places = 2) => d.toDecimalPlaces(places).toString();

/**
 * Pure transport price calculator: no I/O, no side effects. One model per version; models are
 * never summed (ARCHITECTURE §5.3). Throws domain errors for the edge cases in §5.5.
 */
export function calculatePrice(p: PricingParams, i: PricingInputs, computedAt: Date): PricingSnapshot {
  const W = i.weightTons;
  const Dkm = i.routeDistanceKm;
  const minW = p.min_weight_tons && p.min_weight_tons.gt(i.serviceMinTons) ? p.min_weight_tons : i.serviceMinTons;
  const maxW = p.max_weight_tons && p.max_weight_tons.lt(i.serviceMaxTons) ? p.max_weight_tons : i.serviceMaxTons;
  if (W.lt(minW) || W.gt(maxW)) {
    throw new AppError(422, 'CAPACITY_MISMATCH', 'كمية الشحنة خارج حدود هذه الخدمة.', {
      details: { weight_tons: W.toFixed(3), min_tons: minW.toFixed(3), max_tons: maxW.toFixed(3) },
    });
  }
  if (i.straightLineKmMineToFactory && Dkm.lt(i.straightLineKmMineToFactory)) {
    throw new AppError(422, 'ROUTE_DISTANCE_TOO_SHORT', 'مسافة الطريق لا يمكن أن تقل عن المسافة المباشرة بين المنجم والمصنع.', {
      details: { route_distance_km: Dkm.toFixed(1), straight_line_km: i.straightLineKmMineToFactory.toFixed(1) },
    });
  }
  const trips = W.div(i.payloadTonsPerVehicle).ceil().toNumber();
  const lines: PriceLine[] = [];

  let base: bigint;
  let baseLabel: string;
  switch (p.pricing_model) {
    case 'PER_KM': {
      const rate = p.rate_per_km!;
      const mult = p.distance_basis === 'PER_TRIP' ? trips : 1;
      base = sarToHalalas(Dkm.times(rate).times(mult));
      baseLabel = `النقل: ${fmt(Dkm, 1)} كم × ${fmt(rate, 4)} ر.س${mult > 1 ? ` × ${mult} رحلة` : ''}`;
      break;
    }
    case 'PER_TON': {
      const rate = p.rate_per_ton!;
      base = sarToHalalas(W.times(rate));
      baseLabel = `النقل: ${fmt(W, 3)} طن × ${fmt(rate, 4)} ر.س`;
      break;
    }
    case 'PER_TON_KM': {
      const rate = p.rate_per_ton_km!;
      base = sarToHalalas(W.times(Dkm).times(rate));
      baseLabel = `النقل: ${fmt(W, 3)} طن × ${fmt(Dkm, 1)} كم × ${fmt(rate, 4)} ر.س`;
      break;
    }
    case 'FIXED_ROUTE': {
      base = p.fixed_route_price_halalas!;
      baseLabel = 'النقل: سعر ثابت للمسار';
      break;
    }
  }
  lines.push({ code: 'BASE', label_ar: baseLabel, amount_halalas: Number(base) });
  if (p.base_fee_halalas > 0n) lines.push({ code: 'BASE_FEE', label_ar: 'رسم أساسي', amount_halalas: Number(p.base_fee_halalas) });

  const fee = (amount: bigint) => (p.fee_basis === 'PER_TON' ? sarToHalalas(W.times(amount.toString()).div(100)) : amount);
  const feeLabel = p.fee_basis === 'PER_TON' ? ' (لكل طن)' : '';
  if (p.loading_fee_halalas > 0n) lines.push({ code: 'LOADING', label_ar: `رسوم التحميل${feeLabel}`, amount_halalas: Number(fee(p.loading_fee_halalas)) });
  if (p.unloading_fee_halalas > 0n) lines.push({ code: 'UNLOADING', label_ar: `رسوم التفريغ${feeLabel}`, amount_halalas: Number(fee(p.unloading_fee_halalas)) });
  if (p.handling_fee_halalas > 0n) lines.push({ code: 'HANDLING', label_ar: `رسوم المناولة${feeLabel}`, amount_halalas: Number(fee(p.handling_fee_halalas)) });

  const subtotal = lines.reduce((s, l) => s + BigInt(l.amount_halalas), 0n);
  if (p.minimum_charge_halalas > subtotal) {
    lines.push({
      code: 'MINIMUM_CHARGE_ADJUSTMENT',
      label_ar: 'تعديل للوصول إلى الحد الأدنى للأجرة',
      amount_halalas: Number(p.minimum_charge_halalas - subtotal),
    });
  }
  const total = lines.reduce((s, l) => s + BigInt(l.amount_halalas), 0n);
  if (total <= 0n) {
    throw new AppError(422, 'PRICING_PARAMS_INVALID', 'إجمالي النقل المحسوب يجب أن يكون أكبر من صفر.');
  }

  const warnings: string[] = [];
  if (i.straightLineKmMineToFactory && Dkm.gt(i.straightLineKmMineToFactory.times(3))) {
    warnings.push('ROUTE_DISTANCE_REVIEW');
  }
  return {
    engine_version: '1.0',
    pricing_rule_version_id: p.id,
    model: p.pricing_model,
    inputs: {
      weight_tons: W.toFixed(3),
      route_distance_km: Dkm.toFixed(1),
      trips,
      payload_tons_per_vehicle: i.payloadTonsPerVehicle.toFixed(3),
      straight_line_km_mine_to_factory: i.straightLineKmMineToFactory?.toFixed(1) ?? null,
    },
    params: {
      rate_per_km: p.rate_per_km?.toFixed(4) ?? null,
      rate_per_ton: p.rate_per_ton?.toFixed(4) ?? null,
      rate_per_ton_km: p.rate_per_ton_km?.toFixed(4) ?? null,
      fixed_route_price_halalas: p.fixed_route_price_halalas != null ? Number(p.fixed_route_price_halalas) : null,
      base_fee_halalas: Number(p.base_fee_halalas),
      minimum_charge_halalas: Number(p.minimum_charge_halalas),
      fee_basis: p.fee_basis,
      distance_basis: p.distance_basis,
    },
    lines,
    conditional:
      p.waiting_fee_per_hour_halalas > 0n
        ? [
            {
              code: 'WAITING',
              label_ar: `انتظار بعد ${p.free_waiting_hours.toString()} ساعة مجانية — مشروط ولا يدخل الإجمالي`,
              rate_halalas_per_hour: Number(p.waiting_fee_per_hour_halalas),
              free_hours: p.free_waiting_hours.toFixed(1),
            },
          ]
        : [],
    warnings,
    rounding: 'ROUND_HALF_UP_PER_LINE',
    total_halalas: Number(total),
    currency: 'SAR',
    computed_at: computedAt.toISOString(),
  };
}
