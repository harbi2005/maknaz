import { factorySiteSchema, mineSchema, operatingLocationSchema, type OrgType } from '@maknaz/shared';
import type { CarrierOperatingLocation, FactorySite, Mine, Organization } from '../../generated/prisma/client.js';
import type { Tx } from '../../db.js';
import { num } from '../../lib/serialize.js';

export function firstSiteSchemaFor(type: OrgType) {
  if (type === 'MINE') return mineSchema;
  if (type === 'FACTORY') return factorySiteSchema;
  return operatingLocationSchema;
}

/** SCR-ORG-01 step 3: the organization's first location, created with the organization. */
export async function createFirstSite(tx: Tx, org: Organization, input: Record<string, unknown>) {
  const base = {
    organization_id: org.id,
    name: String(input.name),
    region_code: String(input.region_code),
    lat: Number(input.lat),
    lng: Number(input.lng),
  };
  if (org.type === 'MINE') {
    await tx.mine.create({
      data: { ...base, address_text: (input.address_text as string) ?? null, primary_activity: String(input.primary_activity) },
    });
  } else if (org.type === 'FACTORY') {
    await tx.factorySite.create({ data: { ...base, address_text: (input.address_text as string) ?? null } });
  } else {
    await tx.carrierOperatingLocation.create({ data: { ...base, location_kind: String(input.location_kind) } });
    // A carrier always serves at least the region of its first operating location.
    await tx.carrierServiceArea.create({
      data: { organization_id: org.id, area_type: 'REGION', region_code: base.region_code },
    });
  }
}

export const siteDto = (s: FactorySite) => ({
  id: s.id,
  name: s.name,
  region_code: s.region_code,
  address_text: s.address_text,
  lat: num(s.lat)!,
  lng: num(s.lng)!,
  status: s.status,
  created_at: s.created_at.toISOString(),
});

export const mineDto = (
  m: Mine & { organization?: Organization | null; _count?: { listings: number } },
  extra: { has_open_deals?: boolean } = {},
) => ({
  ...siteDto(m as unknown as FactorySite),
  organization_id: m.organization_id,
  organization_name: m.organization?.legal_name_ar ?? null,
  primary_activity: m.primary_activity,
  active_listings: m._count?.listings ?? 0,
  ...extra,
});

export const operatingLocationDto = (l: CarrierOperatingLocation) => ({
  id: l.id,
  name: l.name,
  location_kind: l.location_kind,
  region_code: l.region_code,
  lat: num(l.lat)!,
  lng: num(l.lng)!,
  is_active: l.is_active,
});

export const OPEN_DEAL_STATUSES = ['PENDING_CARRIER', 'PENDING_CARRIER_RETRY', 'AWAITING_PAYMENT', 'PAID', 'IN_FULFILLMENT'];
