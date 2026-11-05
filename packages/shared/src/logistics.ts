import { z } from 'zod';
import { CARGO_CLASSES, tonsSchema } from './catalog.js';
import { REGION_CODES } from './enums.js';

export const TRANSPORT_MODES = ['ROAD', 'RAIL', 'SEA', 'MULTIMODAL'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  ROAD: 'بري',
  RAIL: 'سكك حديدية',
  SEA: 'بحري',
  MULTIMODAL: 'متعدد الأنماط',
};

export const VEHICLE_TYPES = [
  'DUMP_TRUCK',
  'BULK_TRAILER',
  'FLATBED',
  'CONTAINER_TRUCK',
  'SPECIALIZED_INDUSTRIAL',
  'RAIL_WAGON',
  'BULK_VESSEL',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  DUMP_TRUCK: 'قلاب',
  BULK_TRAILER: 'مقطورة سائبة',
  FLATBED: 'سطحة',
  CONTAINER_TRUCK: 'شاحنة حاويات',
  SPECIALIZED_INDUSTRIAL: 'مركبة صناعية متخصصة',
  RAIL_WAGON: 'عربة قطار',
  BULK_VESSEL: 'سفينة بضائع سائبة',
};

export const PRICING_MODELS = ['PER_KM', 'PER_TON', 'PER_TON_KM', 'FIXED_ROUTE'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  PER_KM: 'لكل كيلومتر',
  PER_TON: 'لكل طن',
  PER_TON_KM: 'لكل طن·كيلومتر',
  FIXED_ROUTE: 'سعر ثابت لمسار',
};

export const PRICING_VERSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'ساري',
  SUPERSEDED: 'مستبدل',
  RETIRED: 'متقاعد',
};

const rate = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'معدل غير صحيح (حتى 4 خانات عشرية)'));
const halalas0 = z.coerce.number().int('بالهللة كعدد صحيح').min(0, 'لا يقل عن صفر').max(Number.MAX_SAFE_INTEGER);

export const carrierServiceSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم الخدمة مطلوب').max(100),
    mode_code: z.enum(TRANSPORT_MODES).default('ROAD'),
    vehicle_type_code: z.enum(VEHICLE_TYPES, { error: 'اختر نوع المركبة' }),
    supported_cargo_classes: z.array(z.enum(CARGO_CLASSES)).min(1, 'اختر صنف حمولة واحدًا على الأقل'),
    payload_tons_per_vehicle: tonsSchema,
    vehicles_available: z.coerce.number().int().min(1, 'مركبة واحدة على الأقل'),
    min_shipment_tons: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, 'كمية غير صحيحة')),
    max_shipment_tons: tonsSchema,
    includes_loading: z.boolean().default(false),
    includes_unloading: z.boolean().default(false),
    is_active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (Number(v.max_shipment_tons) < Number(v.min_shipment_tons)) {
      ctx.addIssue({ code: 'custom', path: ['max_shipment_tons'], message: 'الحد الأقصى يجب أن يكون أكبر من أو يساوي الحد الأدنى' });
    }
  });
export type CarrierServiceInput = z.infer<typeof carrierServiceSchema>;

export const serviceAreasSchema = z.object({
  region_codes: z.array(z.enum(REGION_CODES)).min(1, 'اختر منطقة واحدة على الأقل'),
});

export const pricingVersionSchema = z
  .object({
    pricing_model: z.enum(PRICING_MODELS, { error: 'اختر نموذج التسعير' }),
    base_fee_halalas: halalas0.default(0),
    rate_per_km: rate.optional().nullable(),
    rate_per_ton: rate.optional().nullable(),
    rate_per_ton_km: rate.optional().nullable(),
    fixed_route_price_halalas: halalas0.optional().nullable(),
    route_origin_region: z.enum(REGION_CODES).optional().nullable(),
    route_destination_region: z.enum(REGION_CODES).optional().nullable(),
    distance_basis: z.enum(['PER_TRIP', 'PER_SHIPMENT']).default('PER_SHIPMENT'),
    loading_fee_halalas: halalas0.default(0),
    unloading_fee_halalas: halalas0.default(0),
    handling_fee_halalas: halalas0.default(0),
    fee_basis: z.enum(['FLAT', 'PER_TON']).default('FLAT'),
    waiting_fee_per_hour_halalas: halalas0.default(0),
    free_waiting_hours: z.coerce.number().min(0).max(999).default(0),
    minimum_charge_halalas: halalas0.default(0),
    valid_from: z.iso.datetime({ offset: true }).optional().nullable(),
    valid_to: z.iso.datetime({ offset: true }).optional().nullable(),
    /** UX simplification: save and activate in one step (DRAFT → ACTIVE). */
    activate: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, msg: string) => {
      if (v[field] == null || v[field] === '') ctx.addIssue({ code: 'custom', path: [field as string], message: msg });
    };
    if (v.pricing_model === 'PER_KM') need('rate_per_km', 'أدخل السعر لكل كيلومتر');
    if (v.pricing_model === 'PER_TON') need('rate_per_ton', 'أدخل السعر لكل طن');
    if (v.pricing_model === 'PER_TON_KM') need('rate_per_ton_km', 'أدخل السعر لكل طن·كيلومتر');
    if (v.pricing_model === 'FIXED_ROUTE') {
      need('fixed_route_price_halalas', 'أدخل سعر المسار');
      need('route_origin_region', 'اختر منطقة المنشأ');
      need('route_destination_region', 'اختر منطقة الوجهة');
    }
    if (v.valid_from && v.valid_to && new Date(v.valid_to) <= new Date(v.valid_from)) {
      ctx.addIssue({ code: 'custom', path: ['valid_to'], message: 'نهاية الصلاحية يجب أن تكون بعد بدايتها' });
    }
  });
export type PricingVersionInput = z.infer<typeof pricingVersionSchema>;

export const createPricingRuleSchema = z.object({
  service_id: z.uuid({ error: 'اختر الخدمة' }),
  name: z.string().trim().min(2, 'اسم القاعدة مطلوب').max(100),
  version: pricingVersionSchema,
});

export const pricingPreviewSchema = z.object({
  quantity_tons: tonsSchema,
  route_distance_km: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d{1,6}(\.\d)?$/, 'مسافة غير صحيحة')),
});

/** POST /deals/{id}/quotes: no price fields are accepted (SEC-07). */
export const submitQuoteSchema = z.object({
  service_id: z.uuid({ error: 'اختر الخدمة' }),
  operating_location_id: z.uuid({ error: 'اختر موقع الانطلاق' }),
  route_distance_km: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().regex(/^\d{1,6}(\.\d)?$/, 'أدخل مسافة الطريق بالكيلومتر (خانة عشرية واحدة)')),
  proposed_pickup_at: z.iso.datetime({ offset: true, error: 'اختر موعد الاستلام' }),
  estimated_transit_hours: z.coerce.number().positive('المدة يجب أن تكون أكبر من صفر').max(720),
  terms: z.string().trim().max(1000).optional().nullable(),
});

export const selectQuoteSchema = z.object({ accept_price_difference: z.boolean().default(false) });

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'مقدم',
  SELECTED: 'مختار',
  NOT_SELECTED: 'لم يُختر',
  WITHDRAWN: 'مسحوب',
  EXPIRED: 'منتهٍ',
  RELEASED: 'محرر',
  FULFILLED: 'منفذ',
};

export const SHIPMENT_STATUSES = [
  'PENDING_CARRIER',
  'CARRIER_CONFIRMED',
  'SCHEDULED',
  'RECONFIRM_REQUIRED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELAYED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING_CARRIER: 'بانتظار ناقل',
  CARRIER_CONFIRMED: 'الناقل مؤكد',
  SCHEDULED: 'مجدولة',
  RECONFIRM_REQUIRED: 'إعادة تأكيد مطلوبة',
  READY_FOR_PICKUP: 'جاهزة للاستلام',
  PICKED_UP: 'تم الاستلام',
  IN_TRANSIT: 'في الطريق',
  DELAYED: 'متأخرة',
  DELIVERED: 'وصلت',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

export const EXTENSION_REASONS = ['MATERIAL_NOT_READY', 'EQUIPMENT_ISSUE', 'SITE_ACCESS', 'WEATHER', 'REGULATORY', 'OTHER'] as const;
export const EXTENSION_REASON_LABELS: Record<(typeof EXTENSION_REASONS)[number], string> = {
  MATERIAL_NOT_READY: 'المادة غير جاهزة',
  EQUIPMENT_ISSUE: 'عطل في المعدات',
  SITE_ACCESS: 'صعوبة الوصول للموقع',
  WEATHER: 'الطقس',
  REGULATORY: 'متطلب نظامي',
  OTHER: 'سبب آخر',
};

export const extensionSchema = z.object({
  new_pickup_deadline_at: z.iso.datetime({ offset: true, error: 'اختر الموعد الجديد' }),
  reason_code: z.enum(EXTENSION_REASONS, { error: 'اختر سبب التمديد' }),
  reason_text: z.string().trim().min(10, 'اكتب وصفًا لا يقل عن 10 أحرف').max(500, 'الوصف لا يزيد عن 500 حرف'),
});

export const reconfirmSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('CONFIRM') }),
  z.object({ decision: z.literal('DECLINE'), reason: z.string().trim().min(5, 'اكتب سبب الاعتذار').max(500) }),
]);

export const pickupSchema = z.object({
  loaded_tons: tonsSchema.optional().nullable(),
  vehicles_count: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export const noteSchema = z.object({ note: z.string().trim().max(500).optional().nullable() });
export const confirmReceiptSchema = z.object({
  received_tons: tonsSchema.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: 'بانتظار الدفع (محاكاة)',
  SIMULATED_PAYMENT_COMPLETED: 'مدفوعة (محاكاة)',
  PAYMENT_EXPIRED: 'انتهت مهلة الدفع',
  SIMULATED_REFUND_INITIATED: 'استرجاع محاكى قيد التنفيذ',
  SIMULATED_REFUND_COMPLETED: 'تم الاسترجاع (محاكاة)',
};

export const SIMULATION_BADGE_TEXT = 'DEMO / SIMULATION — عملية محاكاة';
export const SIMULATION_NOTICE_AR = 'عملية محاكاة — لم يتم تحويل أي أموال.';
export const NOT_TAX_INVOICE_AR = 'DEMO / SIMULATION — ليست فاتورة ضريبية';
