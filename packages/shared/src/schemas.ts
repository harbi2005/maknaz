import { z } from 'zod';
import { LICENSE_REVIEW_STATUSES, LICENSE_TYPES, ORG_TYPES, REGION_CODES } from './enums.js';

// Arabic validation messages are shown directly under form fields (UI_UX §1.4).

const email = z
  .string({ error: 'البريد الإلكتروني مطلوب' })
  .trim()
  .toLowerCase()
  .max(254, 'البريد الإلكتروني طويل جدًا')
  .pipe(z.email({ error: 'صيغة البريد الإلكتروني غير صحيحة' }));

/** SR-03: minimum 10 characters. Upper bound protects the hasher from huge inputs. */
export const passwordSchema = z
  .string({ error: 'كلمة المرور مطلوبة' })
  .min(10, 'كلمة المرور يجب ألا تقل عن 10 أحرف')
  .max(128, 'كلمة المرور يجب ألا تزيد عن 128 حرفًا');

export const registerSchema = z.object({
  full_name: z
    .string({ error: 'الاسم الكامل مطلوب' })
    .trim()
    .min(2, 'الاسم الكامل يجب ألا يقل عن حرفين')
    .max(100, 'الاسم الكامل يجب ألا يزيد عن 100 حرف'),
  email,
  password: passwordSchema,
  phone: z.string().trim().max(20).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'كلمة المرور مطلوبة' }).min(1, 'كلمة المرور مطلوبة').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const phone = z
  .string({ error: 'رقم الهاتف مطلوب' })
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'رقم الهاتف يجب أن يتكون من 8 إلى 15 رقمًا ويمكن أن يبدأ بـ +');

const orgProfileFields = {
  legal_name_ar: z
    .string({ error: 'الاسم العربي مطلوب' })
    .trim()
    .min(2, 'الاسم العربي يجب ألا يقل عن حرفين')
    .max(200, 'الاسم العربي طويل جدًا'),
  legal_name_en: z.string().trim().max(200, 'الاسم الإنجليزي طويل جدًا').optional().nullable(),
  city: z.string({ error: 'المدينة مطلوبة' }).trim().min(2, 'المدينة مطلوبة').max(100),
  region_code: z.enum(REGION_CODES, { error: 'اختر منطقة إدارية صحيحة' }),
  contact_email: email,
  contact_phone: phone,
};

/**
 * POST /organizations. `organization_id` and `status` are never accepted from the
 * client (SEC-03); Zod strips unknown keys by default.
 */
export const createOrganizationSchema = z.object({
  type: z.enum(ORG_TYPES, { error: 'اختر نوع الجهة' }),
  commercial_registration_no: z
    .string({ error: 'رقم السجل التجاري مطلوب' })
    .trim()
    .min(1, 'رقم السجل التجاري مطلوب')
    .max(30, 'رقم السجل التجاري يجب ألا يزيد عن 30 حرفًا'),
  ...orgProfileFields,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/** PATCH /organizations/{id}. The type is fixed after creation (BR-001). */
export const updateOrganizationSchema = z
  .object(orgProfileFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتعديل' });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const addMemberSchema = z.object({ email });
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const createLicenseSchema = z.object({
  license_type: z.enum(LICENSE_TYPES, { error: 'اختر نوع الترخيص' }),
  license_number: z.string({ error: 'رقم الترخيص مطلوب' }).trim().min(1, 'رقم الترخيص مطلوب').max(60),
  issuing_authority: z
    .string({ error: 'جهة الإصدار مطلوبة' })
    .trim()
    .min(2, 'جهة الإصدار مطلوبة')
    .max(200),
  expires_on: z.iso.date({ error: 'تاريخ غير صحيح' }).optional().nullable(),
});
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;

export const reviewLicenseSchema = z.object({
  review_status: z.enum(LICENSE_REVIEW_STATUSES),
});

export const adminReasonSchema = z.object({
  reason: z
    .string({ error: 'السبب مطلوب' })
    .trim()
    .min(5, 'اكتب سببًا واضحًا (5 أحرف على الأقل)')
    .max(500, 'السبب طويل جدًا'),
});
export type AdminReasonInput = z.infer<typeof adminReasonSchema>;

export const uuidParam = z.uuid();
