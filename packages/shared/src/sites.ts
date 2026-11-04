import { z } from 'zod';
import { REGION_CODES } from './enums.js';

export const LOCATION_KINDS = ['FLEET_YARD', 'DEPOT', 'PORT', 'RAIL_TERMINAL'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  FLEET_YARD: 'ساحة أسطول',
  DEPOT: 'مستودع',
  PORT: 'ميناء',
  RAIL_TERMINAL: 'محطة سكك',
};

const coordinate = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} مطلوب` })
    .min(min, `${label} خارج النطاق`)
    .max(max, `${label} خارج النطاق`);

const siteBase = {
  name: z.string({ error: 'الاسم مطلوب' }).trim().min(2, 'الاسم مطلوب').max(150),
  region_code: z.enum(REGION_CODES, { error: 'اختر منطقة إدارية صحيحة' }),
  address_text: z.string().trim().max(300).optional().nullable(),
  lat: coordinate(-90, 90, 'خط العرض'),
  lng: coordinate(-180, 180, 'خط الطول'),
};

export const mineSchema = z.object({
  ...siteBase,
  primary_activity: z.string({ error: 'النشاط التعديني مطلوب' }).trim().min(2, 'النشاط التعديني مطلوب').max(150),
});
export type MineInput = z.infer<typeof mineSchema>;
export const mineUpdateSchema = mineSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

export const factorySiteSchema = z.object(siteBase);
export type FactorySiteInput = z.infer<typeof factorySiteSchema>;
export const factorySiteUpdateSchema = factorySiteSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

export const operatingLocationSchema = z.object({
  ...siteBase,
  location_kind: z.enum(LOCATION_KINDS, { error: 'اختر نوع الموقع' }),
});
export type OperatingLocationInput = z.infer<typeof operatingLocationSchema>;
export const operatingLocationUpdateSchema = operatingLocationSchema.partial().extend({ is_active: z.boolean().optional() });

export interface SiteDto {
  id: string;
  name: string;
  region_code: string;
  address_text: string | null;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
}
export interface MineDto extends SiteDto {
  organization_id: string;
  organization_name: string | null;
  primary_activity: string;
  active_listings: number;
  has_open_deals?: boolean;
}
export interface OperatingLocationDto {
  id: string;
  name: string;
  location_kind: LocationKind;
  region_code: string;
  lat: number;
  lng: number;
  is_active: boolean;
}
