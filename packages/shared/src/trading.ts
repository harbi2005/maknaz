import { z } from 'zod';
import { halalasSchema, tonsSchema } from './catalog.js';

export const OFFER_STATUSES = ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const ROUND_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'WITHDRAWN', 'EXPIRED'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const DEAL_STATUSES = [
  'PENDING_CARRIER',
  'PENDING_CARRIER_RETRY',
  'AWAITING_PAYMENT',
  'PAID',
  'IN_FULFILLMENT',
  'COMPLETED',
  'CANCELLED',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const CANCELLATION_REASONS = [
  'NO_CARRIER_CONFIRMED',
  'PAYMENT_EXPIRED',
  'PICKUP_MISSED',
  'NO_CARRIER_REASSIGNED',
  'REASSIGNMENT_PRICE_DECLINED',
  'CANCELLED_BY_FACTORY',
  'CANCELLED_BY_MINE',
  'ADMIN_CANCELLED',
  'ORG_SUSPENDED',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const FAULT_PARTIES = ['FACTORY', 'MINE', 'CARRIER', 'NONE', 'UNDETERMINED'] as const;

// UI_UX §4 display names.
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  SUBMITTED: 'بانتظار رد المنجم',
  COUNTERED: 'عرض مقابل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  WITHDRAWN: 'مسحوب',
  EXPIRED: 'منتهٍ',
};

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  PENDING: 'بانتظار الرد',
  ACCEPTED: 'مقبولة',
  REJECTED: 'مرفوضة',
  COUNTERED: 'رُدّ عليها بعرض مقابل',
  WITHDRAWN: 'مسحوبة',
  EXPIRED: 'منتهية',
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  PENDING_CARRIER: 'بانتظار ناقل',
  PENDING_CARRIER_RETRY: 'فترة أخيرة لتأكيد الناقل',
  AWAITING_PAYMENT: 'بانتظار الدفع (محاكاة)',
  PAID: 'مدفوعة (محاكاة)',
  IN_FULFILLMENT: 'قيد التنفيذ',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  NO_CARRIER_CONFIRMED: 'لم يؤكد أي ناقل خلال المهلة وفترة إعادة المحاولة',
  PAYMENT_EXPIRED: 'انقضت مهلة الدفع',
  PICKUP_MISSED: 'لم تُستلم المادة حتى الموعد ومهلة السماح',
  NO_CARRIER_REASSIGNED: 'لم يُسند ناقل بديل خلال المهلة',
  REASSIGNMENT_PRICE_DECLINED: 'رفض المصنع فرق سعر النقل عند إعادة الإسناد',
  CANCELLED_BY_FACTORY: 'ألغاها المصنع قبل الدفع',
  CANCELLED_BY_MINE: 'ألغاها المنجم قبل الدفع',
  ADMIN_CANCELLED: 'إلغاء إداري',
  ORG_SUSPENDED: 'تعليق أحد الأطراف',
};

const futureIso = z.iso.datetime({ offset: true, error: 'تاريخ ووقت غير صحيحين' });

const loadingWindow = {
  loading_window_start: futureIso,
  loading_window_end: futureIso,
};

const windowOrder = (v: { loading_window_start: string; loading_window_end: string }, ctx: z.RefinementCtx) => {
  if (new Date(v.loading_window_end) <= new Date(v.loading_window_start)) {
    ctx.addIssue({ code: 'custom', path: ['loading_window_end'], message: 'نهاية نافذة التحميل يجب أن تكون بعد بدايتها' });
  }
};

/** POST /offers. No computed totals are accepted from the client (SR-07). */
export const createOfferSchema = z.object({
  listing_id: z.uuid(),
  quantity_tons: tonsSchema,
  unit_price_halalas: halalasSchema,
  delivery_site_id: z.uuid({ error: 'اختر موقع التسليم' }),
  message: z.string().trim().max(1000).optional().nullable(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const acceptOfferSchema = z.object(loadingWindow).superRefine(windowOrder);

export const counterOfferSchema = z
  .object({
    unit_price_halalas: halalasSchema,
    quantity_tons: tonsSchema,
    message: z.string().trim().max(1000).optional().nullable(),
    ...loadingWindow,
  })
  .superRefine(windowOrder);

export const respondNoteSchema = z.object({ note: z.string().trim().max(500).optional().nullable() });

export const cancelDealSchema = z.object({
  reason_text: z.string({ error: 'اكتب سبب الإلغاء' }).trim().min(5, 'اكتب سببًا واضحًا (5 أحرف على الأقل)').max(500),
});

export const adminCancelDealSchema = cancelDealSchema.extend({ fault_party: z.enum(FAULT_PARTIES).default('UNDETERMINED') });
