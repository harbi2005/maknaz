import type { Tx } from '../../db.js';
import { db } from '../../db.js';
import { AppError } from '../../lib/errors.js';

/**
 * Time policy values (BUSINESS_RULES §7.1). Stored as a versioned row in
 * system_policy_versions; each deal pins the version it was created under (BR-074).
 * No UI edits these in the MVP (BR-075): a new version is inserted by seed/migration.
 */
export interface PolicyValues {
  carrier_confirmation_window_hours: number;
  carrier_retry_window_hours: number;
  payment_window_hours: number;
  payment_reminder_before_hours: number;
  pickup_grace_period_hours: number;
  max_shipment_extensions: number;
  max_extension_hours: number;
  auto_cancellation_enabled: boolean;
  offer_round_validity_hours: number;
  carrier_reconfirm_window_hours: number;
  carrier_reconfirm_lead_hours: number;
  carrier_reconfirm_min_hours: number;
  reassignment_window_hours: number;
  delivery_grace_period_hours: number;
  delivered_unconfirmed_alert_hours: number;
  min_loading_lead_hours: number;
  distance_band_limits_km: { B1: number; B2: number; B3: number };
  initial_matching_bands: string[];
  retry_matching_bands: string[];
  route_estimate_factor: number;
  route_review_factor: number;
}

export const POLICY_V1: PolicyValues = {
  carrier_confirmation_window_hours: 24, // APPROVED
  carrier_retry_window_hours: 24, // APPROVED
  payment_window_hours: 24, // APPROVED
  payment_reminder_before_hours: 6, // BUSINESS_RULES §9
  pickup_grace_period_hours: 2, // APPROVED + REC
  max_shipment_extensions: 2, // APPROVED
  max_extension_hours: 72, // APPROVED
  auto_cancellation_enabled: true, // APPROVED
  offer_round_validity_hours: 48, // REC (OD-03)
  carrier_reconfirm_window_hours: 12, // REC (OD-06)
  carrier_reconfirm_lead_hours: 2, // REC (OD-06): at least 2h before the new deadline
  carrier_reconfirm_min_hours: 1, // REC (BR-064)
  reassignment_window_hours: 24, // REC (OD-07)
  delivery_grace_period_hours: 2, // REC
  delivered_unconfirmed_alert_hours: 72, // REC (OD-09)
  min_loading_lead_hours: 48, // REC (API_SPECIFICATION §7)
  distance_band_limits_km: { B1: 50, B2: 150, B3: 300 }, // BR-032
  initial_matching_bands: ['B1', 'B2', 'B3'], // ARCHITECTURE §6
  retry_matching_bands: ['B1', 'B2', 'B3', 'B4'], // BR-038
  route_estimate_factor: 1.3, // OD-10
  route_review_factor: 3, // ARCHITECTURE §5.5
};

export interface CurrentPolicy {
  id: string;
  version_no: number;
  effective_from: Date;
  values: PolicyValues;
}

export async function currentPolicy(tx?: Tx): Promise<CurrentPolicy> {
  const row = await (tx ?? db()).systemPolicyVersion.findFirst({ where: { is_current: true } });
  if (!row) throw new AppError(500, 'INTERNAL_ERROR', 'لا توجد سياسة زمنية سارية؛ شغّل البذرة (db:seed).');
  return { id: row.id, version_no: row.version_no, effective_from: row.effective_from, values: row.values as unknown as PolicyValues };
}

export async function policyById(tx: Tx, id: string): Promise<PolicyValues> {
  const row = await tx.systemPolicyVersion.findUniqueOrThrow({ where: { id } });
  return row.values as unknown as PolicyValues;
}

/** Idempotent: inserts version 1 if no policy exists yet (used by the seed and tests). */
export async function ensurePolicyV1(): Promise<void> {
  const existing = await db().systemPolicyVersion.findFirst({ where: { is_current: true } });
  if (existing) return;
  await db().systemPolicyVersion.create({
    data: {
      version_no: 1,
      values: POLICY_V1 as unknown as object,
      effective_from: new Date('2026-11-01T00:00:00Z'),
      is_current: true,
      created_by: 'seed',
      notes: 'Initial MVP policy: approved values + engineering recommendations (BUSINESS_RULES §7.1).',
    },
  });
}
