import { z } from 'zod';

export const CARGO_CLASSES = ['BULK_SOLID', 'FINE_POWDER', 'SLURRY', 'PACKAGED', 'SPECIAL'] as const;
export type CargoClass = (typeof CARGO_CLASSES)[number];

export const PHYSICAL_STATES = ['SOLID_LUMP', 'GRANULAR', 'POWDER', 'SLURRY', 'OTHER'] as const;
export type PhysicalState = (typeof PHYSICAL_STATES)[number];

export const LISTING_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const VERIFICATION_STATUSES = ['LAB_REPORTED', 'DECLARED', 'ESTIMATED', 'UNKNOWN'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DOC_TYPES = ['LAB_REPORT', 'SDS', 'PHOTO', 'OTHER'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_VISIBILITIES = ['PUBLIC', 'ON_REQUEST', 'PRIVATE'] as const;
export type DocVisibility = (typeof DOC_VISIBILITIES)[number];

export const CARGO_CLASS_LABELS: Record<CargoClass, string> = {
  BULK_SOLID: 'صلب سائب',
  FINE_POWDER: 'مسحوق ناعم',
  SLURRY: 'طين / ملاط',
  PACKAGED: 'معبأ',
  SPECIAL: 'خاص',
};

export const PHYSICAL_STATE_LABELS: Record<PhysicalState, string> = {
  SOLID_LUMP: 'كتل صلبة',
  GRANULAR: 'حبيبي',
  POWDER: 'مسحوق',
  SLURRY: 'ملاط',
  OTHER: 'أخرى',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'منشور',
  INACTIVE: 'موقوف',
  ARCHIVED: 'مؤرشف',
};

/** VerificationTag texts (UI_UX §1.3). BR-012: "supported by an attached report", never "verified by the platform". */
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  LAB_REPORTED: 'مدعوم بتقرير مرفق',
  DECLARED: 'مصرّح به',
  ESTIMATED: 'تقديري',
  UNKNOWN: 'غير معروف',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  LAB_REPORT: 'تقرير مختبر',
  SDS: 'صحيفة بيانات السلامة',
  PHOTO: 'صورة',
  OTHER: 'أخرى',
};

export const DOC_VISIBILITY_LABELS: Record<DocVisibility, string> = {
  PUBLIC: 'عامة لكل الجهات المعتمدة',
  ON_REQUEST: 'عند الطلب: للمصنع الذي قدّم عرض شراء',
  PRIVATE: 'خاصة: لجهتك والإدارة فقط',
};

/** Quantity in tonnes: positive, at most 3 decimals (BR-019), sent as a string to avoid floats. */
export const tonsSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(
    z
      .string()
      .regex(/^\d{1,9}(\.\d{1,3})?$/, 'أدخل كمية صحيحة بالطن (حتى 3 خانات عشرية)')
      .refine((v) => Number(v) > 0, 'الكمية يجب أن تكون أكبر من صفر'),
  );

export const halalasSchema = z.coerce
  .number({ error: 'المبلغ مطلوب' })
  .int('المبلغ يجب أن يكون عددًا صحيحًا بالهللة')
  .positive('المبلغ يجب أن يكون أكبر من صفر')
  .max(Number.MAX_SAFE_INTEGER);

/**
 * Converts a riyal amount typed by a user ("42.5") into integer halalas (4250) using string
 * arithmetic only (ADR-004). Returns null when the input is not a valid amount.
 */
export function riyalsToHalalas(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const value = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

const dateOnly = z.iso.date({ error: 'تاريخ غير صحيح' });

export const specificationSchema = z
  .object({
    property_name: z.string().trim().min(1, 'اسم الخاصية مطلوب').max(100),
    value_numeric: z.coerce.number().finite().optional().nullable(),
    value_text: z.string().trim().max(200).optional().nullable(),
    unit: z.string().trim().max(20).optional().nullable(),
    verification_status: z.enum(VERIFICATION_STATUSES, { error: 'حالة التحقق مطلوبة' }),
    document_id: z.uuid().optional().nullable(),
  })
  .superRefine((s, ctx) => {
    if (s.verification_status === 'LAB_REPORTED' && !s.document_id) {
      ctx.addIssue({ code: 'custom', path: ['document_id'], message: 'اختر تقرير المختبر الداعم لهذه القيمة' });
    }
    if (s.verification_status !== 'UNKNOWN' && s.value_numeric == null && !s.value_text) {
      ctx.addIssue({ code: 'custom', path: ['value_numeric'], message: 'أدخل القيمة أو اختر «غير معروف»' });
    }
  });
export type SpecificationInput = z.infer<typeof specificationSchema>;

const listingFields = {
  title: z.string({ error: 'العنوان مطلوب' }).trim().min(3, 'العنوان قصير جدًا').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  physical_state: z.enum(PHYSICAL_STATES, { error: 'اختر الحالة الفيزيائية' }),
  asking_price_halalas: halalasSchema,
  is_negotiable: z.boolean().default(true),
  loading_conditions: z.string({ error: 'شروط التحميل مطلوبة' }).trim().min(3, 'اكتب شروط التحميل').max(1000),
  available_from: dateOnly.optional().nullable(),
  available_until: dateOnly.optional().nullable(),
};

export const createListingSchema = z.object({
  mine_id: z.uuid({ error: 'اختر المنجم' }),
  category_id: z.uuid({ error: 'اختر الفئة' }),
  total_quantity: tonsSchema,
  ...listingFields,
  specifications: z.array(specificationSchema).max(50).default([]),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = z
  .object({ ...listingFields, category_id: z.uuid() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتعديل' });

export const updateQuantitySchema = z.object({ total_quantity: tonsSchema });

export const replaceSpecificationsSchema = z.object({ specifications: z.array(specificationSchema).max(50) });

export const documentMetaSchema = z.object({
  doc_type: z.enum(DOC_TYPES, { error: 'اختر نوع الوثيقة' }),
  title: z.string().trim().min(2, 'عنوان الوثيقة مطلوب').max(200),
  visibility: z.enum(DOC_VISIBILITIES).default('ON_REQUEST'),
  lab_name: z.string().trim().max(200).optional().nullable(),
  issued_on: dateOnly.optional().nullable(),
});

export const updateDocumentSchema = z
  .object({ title: z.string().trim().min(2).max(200), visibility: z.enum(DOC_VISIBILITIES) })
  .partial();

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const PLATFORM_DISCLAIMER_AR = 'المنصة لا تتحقق من محتوى التقارير ولا تحكم بصلاحية المادة.';
export const BUYER_RESPONSIBILITY_AR = 'القرار الفني بصلاحية المادة يعود للمشتري.';
