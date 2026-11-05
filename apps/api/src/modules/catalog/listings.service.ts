import { haversineKm, round1, STRAIGHT_LINE_LABEL, VERIFICATION_LABELS, type VerificationStatus } from '@maknaz/shared';
import type {
  MaterialCategory,
  MaterialDocument,
  MaterialListing,
  MaterialSpecification,
  Mine,
  Organization,
} from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../lib/context.js';
import { money, num, qty } from '../../lib/serialize.js';

export type ListingWithRelations = MaterialListing & {
  category: MaterialCategory;
  mine: Mine & { organization?: Organization };
  specifications?: MaterialSpecification[];
  documents?: MaterialDocument[];
};

export function available(l: MaterialListing): Prisma.Decimal {
  return l.total_quantity.minus(l.reserved_quantity).minus(l.sold_quantity);
}

export const categoryDto = (c: MaterialCategory) => ({
  id: c.id,
  code: c.code,
  name_ar: c.name_ar,
  name_en: c.name_en,
  cargo_class: c.cargo_class,
  is_active: c.is_active,
});

export const specDto = (s: MaterialSpecification) => ({
  id: s.id,
  property_name: s.property_name,
  value_numeric: s.value_numeric?.toString() ?? null,
  value_text: s.value_text,
  unit: s.unit,
  verification_status: s.verification_status,
  verification_label: VERIFICATION_LABELS[s.verification_status as VerificationStatus],
  document_id: s.document_id,
  sort_order: s.sort_order,
});

/** BR-017 document access. Returns whether the caller may download this document. */
export function canDownload(
  doc: MaterialDocument,
  listingOrgId: string,
  a: AuthContext,
  factoryHasOfferOrDeal: boolean,
): boolean {
  if (a.isPlatformAdmin) return true;
  if (a.org?.id === listingOrgId) return true;
  if (a.org?.status !== 'ACTIVE') return false;
  if (doc.visibility === 'PUBLIC') return true;
  if (doc.visibility === 'ON_REQUEST') return a.org.type === 'FACTORY' && factoryHasOfferOrDeal;
  return false;
}

export const documentDto = (d: MaterialDocument, can_download: boolean, includePrivateMeta: boolean) => ({
  id: d.id,
  doc_type: d.doc_type,
  title: d.title,
  visibility: d.visibility,
  mime_type: d.mime_type,
  size_bytes: Number(d.size_bytes),
  lab_name: d.lab_name,
  issued_on: d.issued_on ? d.issued_on.toISOString().slice(0, 10) : null,
  created_at: d.created_at.toISOString(),
  can_download,
  ...(includePrivateMeta ? { sha256: d.sha256 } : {}),
});

export function listingSummaryDto(l: ListingWithRelations, opts: { site?: { lat: number; lng: number } | null } = {}) {
  const lat = num(l.mine.lat)!;
  const lng = num(l.mine.lng)!;
  const labSpecs = l.specifications?.filter((s) => s.verification_status === 'LAB_REPORTED').length ?? 0;
  return {
    id: l.id,
    title: l.title,
    status: l.status,
    category: categoryDto(l.category),
    physical_state: l.physical_state,
    mine: {
      id: l.mine.id,
      name: l.mine.name,
      region_code: l.mine.region_code,
      lat,
      lng,
      organization_id: l.organization_id,
      organization_name: l.mine.organization?.legal_name_ar ?? null,
    },
    quantity: {
      total: qty(l.total_quantity),
      reserved: qty(l.reserved_quantity),
      sold: qty(l.sold_quantity),
      available: available(l).toFixed(3),
      unit: 'TON',
    },
    asking_price: { ...money(l.asking_price_halalas), per: 'TON' },
    is_negotiable: l.is_negotiable,
    lab_reported_specs: labSpecs,
    has_lab_report: (l.documents ?? []).some((d) => d.doc_type === 'LAB_REPORT'),
    distance_from_site: opts.site
      ? { straight_line_km: round1(haversineKm(opts.site, { lat, lng })).toFixed(1), label: STRAIGHT_LINE_LABEL }
      : null,
    published_at: l.published_at?.toISOString() ?? null,
    version: l.version,
    updated_at: l.updated_at.toISOString(),
  };
}
