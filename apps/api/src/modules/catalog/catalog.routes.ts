import {
  CARGO_CLASSES,
  createListingSchema,
  documentMetaSchema,
  MAX_UPLOAD_BYTES,
  REGION_CODES,
  replaceSpecificationsSchema,
  updateDocumentSchema,
  updateListingSchema,
  updateQuantitySchema,
  type SpecificationInput,
} from '@maknaz/shared';
import { Router, type Request } from 'express';
import multer from 'multer';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { db, lockRow, transaction, type Tx } from '../../db.js';
import { auth, requireActiveOrg, requireAdmin, requireOrg } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { sha256Hex } from '../../lib/crypto.js';
import { AppError, notFound } from '../../lib/errors.js';
import { num } from '../../lib/serialize.js';
import { putObject, readObject, signDownload, sniffMime, verifyDownload } from '../../lib/storage.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { OPEN_DEAL_STATUSES } from '../sites/sites.service.js';
import { expireOpenOffersForListing } from '../trading/offers.service.js';
import {
  available,
  canDownload,
  categoryDto,
  documentDto,
  listingSummaryDto,
  specDto,
  type ListingWithRelations,
} from './listings.service.js';

export const catalogRouter = Router();
/** Signed file downloads are validated by token, so they are mounted before authentication. */
export const publicFilesRouter = Router();

// ─── categories ─────────────────────────────────────────────────────────

catalogRouter.get('/material-categories', async (_req, res) => {
  const rows = await db().materialCategory.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } });
  res.json({ data: rows.map(categoryDto) });
});

const categorySchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'الرمز بأحرف إنجليزية كبيرة وشرطة سفلية'),
  name_ar: z.string().trim().min(2).max(100),
  name_en: z.string().trim().min(2).max(100),
  cargo_class: z.enum(CARGO_CLASSES),
  is_active: z.boolean().default(true),
});

catalogRouter.get('/admin/material-categories', async (req, res) => {
  requireAdmin(req);
  const rows = await db().materialCategory.findMany({ orderBy: { code: 'asc' } });
  res.json({ data: rows.map(categoryDto) });
});

catalogRouter.post('/admin/material-categories', async (req, res) => {
  requireAdmin(req);
  const input = parse(categorySchema, req.body);
  const c = await transaction(async (tx) => {
    const created = await tx.materialCategory.create({ data: input });
    await audit(tx, actorFromRequest(req), { action: 'CATEGORY_CREATED', entityType: 'MATERIAL_CATEGORY', entityId: created.id, after: created });
    return created;
  });
  res.status(201).json(categoryDto(c));
});

catalogRouter.patch('/admin/material-categories/:id', async (req, res) => {
  requireAdmin(req);
  const id = idParam(req.params.id);
  const input = parse(categorySchema.omit({ code: true }).partial(), req.body);
  const c = await transaction(async (tx) => {
    const before = await tx.materialCategory.findUnique({ where: { id } });
    if (!before) throw notFound();
    const updated = await tx.materialCategory.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), { action: 'CATEGORY_UPDATED', entityType: 'MATERIAL_CATEGORY', entityId: id, before, after: updated });
    return updated;
  });
  res.json(categoryDto(c));
});

// ─── listings ───────────────────────────────────────────────────────────

const LISTING_INCLUDE = {
  category: true,
  mine: { include: { organization: true } },
  specifications: { orderBy: { sort_order: 'asc' as const } },
  documents: { orderBy: { created_at: 'asc' as const } },
} satisfies Prisma.MaterialListingInclude;

async function validateSpecDocuments(tx: Tx, listingId: string | null, specs: SpecificationInput[]) {
  const docIds = specs.map((s) => s.document_id).filter((x): x is string => !!x);
  if (docIds.length === 0) return;
  const docs = listingId
    ? await tx.materialDocument.findMany({ where: { id: { in: docIds }, listing_id: listingId } })
    : [];
  for (const s of specs) {
    if (!s.document_id) continue;
    const d = docs.find((x) => x.id === s.document_id);
    // BR-012: LAB_REPORTED must point at a lab document uploaded to the same listing.
    if (!d || (s.verification_status === 'LAB_REPORTED' && d.doc_type !== 'LAB_REPORT')) {
      throw new AppError(422, 'LAB_DOCUMENT_REQUIRED', 'القيمة «مدعومة بتقرير» تتطلب تقرير مختبر مرفوعًا لهذا العرض نفسه.', {
        details: { property_name: s.property_name },
      });
    }
  }
}

function specRows(listingId: string, specs: SpecificationInput[]) {
  return specs.map((s, i) => ({
    listing_id: listingId,
    property_name: s.property_name,
    value_numeric: s.verification_status === 'UNKNOWN' ? null : (s.value_numeric ?? null),
    value_text: s.verification_status === 'UNKNOWN' ? null : (s.value_text ?? null),
    unit: s.unit ?? null,
    verification_status: s.verification_status,
    document_id: s.document_id ?? null,
    sort_order: i,
  }));
}

/** P-20: create a DRAFT listing on one of the organization's own mines. */
catalogRouter.post('/material-listings', async (req, res) => {
  const org = requireActiveOrg(req, 'MINE');
  const input = parse(createListingSchema, req.body);
  const listing = await transaction(async (tx) => {
    const mine = await tx.mine.findFirst({ where: { id: input.mine_id, organization_id: org.id } });
    if (!mine) throw new AppError(422, 'VALIDATION_FAILED', 'اختر منجمًا تابعًا لجهتك.', { fieldErrors: [{ field: 'mine_id', message: 'منجم غير صالح' }] });
    const category = await tx.materialCategory.findFirst({ where: { id: input.category_id, is_active: true } });
    if (!category) throw new AppError(422, 'VALIDATION_FAILED', 'اختر فئة مادة صحيحة.');
    // A new listing has no documents yet, so LAB_REPORTED specs are added after uploading reports.
    await validateSpecDocuments(tx, null, input.specifications);
    const l = await tx.materialListing.create({
      data: {
        mine_id: mine.id,
        organization_id: org.id,
        category_id: category.id,
        title: input.title,
        description: input.description ?? null,
        physical_state: input.physical_state,
        total_quantity: new Prisma.Decimal(input.total_quantity),
        asking_price_halalas: BigInt(input.asking_price_halalas),
        is_negotiable: input.is_negotiable,
        loading_conditions: input.loading_conditions,
        available_from: input.available_from ? new Date(`${input.available_from}T00:00:00Z`) : null,
        available_until: input.available_until ? new Date(`${input.available_until}T00:00:00Z`) : null,
      },
    });
    if (input.specifications.length) await tx.materialSpecification.createMany({ data: specRows(l.id, input.specifications) });
    await audit(tx, actorFromRequest(req), {
      action: 'LISTING_CREATED',
      entityType: 'LISTING',
      entityId: l.id,
      after: { title: l.title, total_quantity: l.total_quantity, asking_price_halalas: l.asking_price_halalas, status: l.status },
    });
    return tx.materialListing.findUniqueOrThrow({ where: { id: l.id }, include: LISTING_INCLUDE });
  });
  res.status(201).json(listingSummaryDto(listing));
});

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  'filter[category]': z.string().max(50).optional(),
  'filter[region]': z.enum(REGION_CODES).optional(),
  'filter[min_available]': z.coerce.number().min(0).optional(),
  'filter[max_price_halalas]': z.coerce.number().int().positive().optional(),
  'filter[has_lab_report]': z.enum(['true', 'false']).optional(),
  'filter[mine]': z.uuid().optional(),
  'filter[own]': z.enum(['true']).optional(),
  from_site_id: z.uuid().optional(),
  sort: z.enum(['-published_at', 'asking_price_halalas', '-asking_price_halalas', '-available_quantity', 'distance']).optional(),
});

/** P-24 search. Buyers see ACTIVE listings of ACTIVE mines/orgs; the owner sees all of its own. */
catalogRouter.get('/material-listings', async (req, res) => {
  const a = auth(req);
  const q = parse(listQuery, req.query);
  const own = q['filter[own]'] === 'true' && a.org?.type === 'MINE';
  if (q.sort && !['-published_at', 'asking_price_halalas', '-asking_price_halalas', '-available_quantity', 'distance'].includes(q.sort)) {
    throw new AppError(400, 'INVALID_SORT', 'ترتيب غير مدعوم.');
  }
  const where: Prisma.MaterialListingWhereInput = own
    ? { organization_id: a.org!.id, status: { not: 'ARCHIVED' } }
    : { status: 'ACTIVE', mine: { status: 'ACTIVE', organization: { status: 'ACTIVE' } } };
  if (q['filter[category]']) where.category = { code: q['filter[category]'] };
  if (q['filter[region]']) where.mine = { ...(where.mine as object), region_code: q['filter[region]'] };
  if (q['filter[mine]']) where.mine_id = q['filter[mine]'];
  if (q['filter[max_price_halalas]']) where.asking_price_halalas = { lte: BigInt(q['filter[max_price_halalas]']) };
  if (q['filter[has_lab_report]'] === 'true') where.documents = { some: { doc_type: 'LAB_REPORT' } };
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
      { category: { name_ar: { contains: q.q, mode: 'insensitive' } } },
    ];
  }
  let site: { lat: number; lng: number } | null = null;
  if (q.from_site_id && a.org?.type === 'FACTORY') {
    const s = await db().factorySite.findFirst({ where: { id: q.from_site_id, organization_id: a.org.id } });
    if (s) site = { lat: num(s.lat)!, lng: num(s.lng)! };
  }
  const rows = await db().materialListing.findMany({
    where,
    include: LISTING_INCLUDE,
    orderBy: q.sort === 'asking_price_halalas' ? { asking_price_halalas: 'asc' } : q.sort === '-asking_price_halalas' ? { asking_price_halalas: 'desc' } : { updated_at: 'desc' },
    take: 300,
  });
  // Available quantity is derived (total − reserved − sold), so it is filtered after the query.
  let data = rows
    .filter((l) => (q['filter[min_available]'] ? available(l).gte(q['filter[min_available]']) : true))
    .map((l) => listingSummaryDto(l as ListingWithRelations, { site }));
  if (q.sort === '-available_quantity') data = data.sort((x, y) => Number(y.quantity.available) - Number(x.quantity.available));
  if (q.sort === 'distance' && site) data = data.sort((x, y) => Number(x.distance_from_site!.straight_line_km) - Number(y.distance_from_site!.straight_line_km));
  if (q.sort === '-published_at') data = data.sort((x, y) => (y.published_at ?? '').localeCompare(x.published_at ?? ''));
  res.json({ data, page: { next_cursor: null, size: data.length, has_more: false } });
});

async function loadListingForRead(req: Request, id: string) {
  const a = auth(req);
  const l = await db().materialListing.findUnique({ where: { id }, include: LISTING_INCLUDE });
  if (!l) throw notFound();
  const isOwner = a.org?.id === l.organization_id;
  const visible = l.status === 'ACTIVE' && l.mine.status === 'ACTIVE' && l.mine.organization.status === 'ACTIVE';
  if (!isOwner && !a.isPlatformAdmin && !visible) throw notFound();
  return { l, isOwner };
}

catalogRouter.get('/material-listings/:id', async (req, res) => {
  const a = auth(req);
  const { l, isOwner } = await loadListingForRead(req, idParam(req.params.id));
  let site: { lat: number; lng: number; id: string } | null = null;
  let myOpenOffer: { id: string; reference: string; status: string } | null = null;
  let factoryHasOfferOrDeal = false;
  if (a.org?.type === 'FACTORY') {
    const siteId = typeof req.query.from_site_id === 'string' ? req.query.from_site_id : undefined;
    const s = await db().factorySite.findFirst({
      where: { organization_id: a.org.id, status: 'ACTIVE', ...(siteId && z.uuid().safeParse(siteId).success ? { id: siteId } : {}) },
      orderBy: { created_at: 'asc' },
    });
    if (s) site = { id: s.id, lat: num(s.lat)!, lng: num(s.lng)! };
    const offer = await db().purchaseOffer.findFirst({
      where: { listing_id: l.id, factory_org_id: a.org.id, status: { in: ['SUBMITTED', 'COUNTERED'] } },
    });
    if (offer) myOpenOffer = { id: offer.id, reference: offer.reference, status: offer.status };
    factoryHasOfferOrDeal = !!offer || (await db().deal.count({ where: { listing_id: l.id, factory_org_id: a.org.id } })) > 0;
  }
  const openOffers = isOwner
    ? await db().purchaseOffer.count({ where: { listing_id: l.id, status: { in: ['SUBMITTED', 'COUNTERED'] } } })
    : undefined;
  const activeDeals = isOwner ? await db().deal.count({ where: { listing_id: l.id, status: { in: OPEN_DEAL_STATUSES } } }) : undefined;
  res.json({
    ...listingSummaryDto(l, { site }),
    description: l.description,
    loading_conditions: l.loading_conditions,
    available_from: l.available_from?.toISOString().slice(0, 10) ?? null,
    available_until: l.available_until?.toISOString().slice(0, 10) ?? null,
    specifications: l.specifications.map(specDto),
    documents: l.documents
      .filter((d) => isOwner || a.isPlatformAdmin || d.visibility !== 'PRIVATE')
      .map((d) => documentDto(d, canDownload(d, l.organization_id, a, factoryHasOfferOrDeal), isOwner)),
    is_owner: isOwner,
    my_open_offer: myOpenOffer,
    reference_site_id: site?.id ?? null,
    open_offers: openOffers,
    active_deals: activeDeals,
  });
});

async function ownListing(tx: Tx, req: Request, id: string) {
  const org = requireOrg(req, 'MINE');
  if (!(await lockRow(tx, 'material_listings', id))) throw notFound();
  const l = await tx.materialListing.findUnique({ where: { id } });
  if (!l || l.organization_id !== org.id) throw notFound();
  return l;
}

/** Optimistic concurrency: If-Match: "<version>" must match when provided (API_SPECIFICATION §1). */
function checkIfMatch(req: Request, version: number) {
  const header = req.get('if-match');
  if (header && header.replace(/"/g, '') !== String(version)) {
    throw new AppError(412, 'VERSION_MISMATCH', 'عُدّل هذا العرض من جلسة أخرى؛ أعد تحميل الصفحة.', { details: { current_version: version } });
  }
}

/** P-21: descriptive fields and asking price. BR-018: never affects existing offers or deals. */
catalogRouter.patch('/material-listings/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(updateListingSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await ownListing(tx, req, id);
    if (before.status === 'ARCHIVED') throw new AppError(409, 'INVALID_STATE', 'لا يمكن تعديل عرض مؤرشف.');
    checkIfMatch(req, before.version);
    const data: Prisma.MaterialListingUpdateInput = { version: { increment: 1 } };
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.physical_state !== undefined) data.physical_state = input.physical_state;
    if (input.asking_price_halalas !== undefined) data.asking_price_halalas = BigInt(input.asking_price_halalas);
    if (input.is_negotiable !== undefined) data.is_negotiable = input.is_negotiable;
    if (input.loading_conditions !== undefined) data.loading_conditions = input.loading_conditions;
    if (input.available_from !== undefined) data.available_from = input.available_from ? new Date(`${input.available_from}T00:00:00Z`) : null;
    if (input.available_until !== undefined) data.available_until = input.available_until ? new Date(`${input.available_until}T00:00:00Z`) : null;
    if (input.category_id !== undefined) {
      const c = await tx.materialCategory.findFirst({ where: { id: input.category_id, is_active: true } });
      if (!c) throw new AppError(422, 'VALIDATION_FAILED', 'اختر فئة مادة صحيحة.');
      data.category = { connect: { id: c.id } };
    }
    const l = await tx.materialListing.update({ where: { id }, data });
    await audit(tx, actorFromRequest(req), {
      action: before.asking_price_halalas !== l.asking_price_halalas ? 'LISTING_PRICE_CHANGED' : 'LISTING_UPDATED',
      entityType: 'LISTING',
      entityId: id,
      before: { title: before.title, asking_price_halalas: before.asking_price_halalas, version: before.version },
      after: { title: l.title, asking_price_halalas: l.asking_price_halalas, version: l.version },
    });
    return tx.materialListing.findUniqueOrThrow({ where: { id }, include: LISTING_INCLUDE });
  });
  res.json(listingSummaryDto(updated));
});

/** P-22 / BR-015: total quantity can never drop below reserved + sold (conditional update). */
catalogRouter.patch('/material-listings/:id/quantity', async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(updateQuantitySchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await ownListing(tx, req, id);
    if (before.status === 'ARCHIVED') throw new AppError(409, 'INVALID_STATE', 'لا يمكن تعديل عرض مؤرشف.');
    checkIfMatch(req, before.version);
    const total = new Prisma.Decimal(input.total_quantity);
    const committed = before.reserved_quantity.plus(before.sold_quantity);
    if (total.lt(committed)) {
      throw new AppError(422, 'QUANTITY_BELOW_COMMITTED', 'لا يمكن خفض الكمية تحت المحجوز والمباع.', {
        details: { minimum_allowed: committed.toFixed(3) },
      });
    }
    const n = await tx.$executeRaw`
      UPDATE material_listings SET total_quantity = ${total}::numeric, version = version + 1, updated_at = now()
       WHERE id = ${id}::uuid AND reserved_quantity + sold_quantity <= ${total}::numeric`;
    if (n === 0) throw new AppError(422, 'QUANTITY_BELOW_COMMITTED', 'لا يمكن خفض الكمية تحت المحجوز والمباع.');
    await audit(tx, actorFromRequest(req), {
      action: 'LISTING_QUANTITY_CHANGED',
      entityType: 'LISTING',
      entityId: id,
      before: { total_quantity: before.total_quantity },
      after: { total_quantity: total },
    });
    return tx.materialListing.findUniqueOrThrow({ where: { id }, include: LISTING_INCLUDE });
  });
  res.json(listingSummaryDto(updated));
});

/** P-23 publish: BR-014 requirements. */
catalogRouter.post('/material-listings/:id/publish', async (req, res) => {
  const org = requireActiveOrg(req, 'MINE');
  const id = idParam(req.params.id);
  const updated = await transaction(async (tx) => {
    const l = await ownListing(tx, req, id);
    if (!['DRAFT', 'INACTIVE'].includes(l.status)) throw new AppError(409, 'INVALID_STATE', 'العرض منشور بالفعل أو مؤرشف.');
    const mine = await tx.mine.findUniqueOrThrow({ where: { id: l.mine_id } });
    if (mine.status !== 'ACTIVE') throw new AppError(422, 'MINE_INACTIVE', 'لا يمكن نشر مادة على منجم موقوف.');
    if (org.status !== 'ACTIVE') throw new AppError(403, 'ORG_NOT_ACTIVE', 'جهتك ليست نشطة.');
    await tx.materialListing.update({
      where: { id },
      data: { status: 'ACTIVE', published_at: l.published_at ?? now(), version: { increment: 1 } },
    });
    await audit(tx, actorFromRequest(req), { action: 'LISTING_PUBLISHED', entityType: 'LISTING', entityId: id, before: { status: l.status }, after: { status: 'ACTIVE' } });
    return tx.materialListing.findUniqueOrThrow({ where: { id }, include: LISTING_INCLUDE });
  });
  res.json(listingSummaryDto(updated));
});

/** P-23 deactivate: owner or admin. Open offers expire (BR-016); deals continue. */
catalogRouter.post('/material-listings/:id/deactivate', async (req, res) => {
  const a = auth(req);
  const id = idParam(req.params.id);
  const updated = await transaction(async (tx) => {
    if (!(await lockRow(tx, 'material_listings', id))) throw notFound();
    const l = await tx.materialListing.findUniqueOrThrow({ where: { id } });
    if (!a.isPlatformAdmin && a.org?.id !== l.organization_id) throw notFound();
    if (l.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE', 'العرض ليس منشورًا.');
    await tx.materialListing.update({ where: { id }, data: { status: 'INACTIVE', version: { increment: 1 } } });
    await expireOpenOffersForListing(tx, id, actorFromRequest(req));
    await audit(tx, actorFromRequest(req), { action: 'LISTING_DEACTIVATED', entityType: 'LISTING', entityId: id, before: { status: 'ACTIVE' }, after: { status: 'INACTIVE' } });
    return tx.materialListing.findUniqueOrThrow({ where: { id }, include: LISTING_INCLUDE });
  });
  res.json(listingSummaryDto(updated));
});

catalogRouter.post('/material-listings/:id/archive', async (req, res) => {
  const id = idParam(req.params.id);
  const updated = await transaction(async (tx) => {
    const l = await ownListing(tx, req, id);
    if (l.status === 'ARCHIVED') throw new AppError(409, 'INVALID_STATE', 'العرض مؤرشف بالفعل.');
    const open = await tx.deal.count({ where: { listing_id: id, status: { in: OPEN_DEAL_STATUSES } } });
    if (open > 0) throw new AppError(409, 'INVALID_STATE', 'لا يمكن أرشفة عرض عليه صفقات قائمة.');
    await tx.materialListing.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
    await expireOpenOffersForListing(tx, id, actorFromRequest(req));
    await audit(tx, actorFromRequest(req), { action: 'LISTING_ARCHIVED', entityType: 'LISTING', entityId: id, before: { status: l.status }, after: { status: 'ARCHIVED' } });
    return tx.materialListing.findUniqueOrThrow({ where: { id }, include: LISTING_INCLUDE });
  });
  res.json(listingSummaryDto(updated));
});

catalogRouter.put('/material-listings/:id/specifications', async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(replaceSpecificationsSchema, req.body);
  const specs = await transaction(async (tx) => {
    const l = await ownListing(tx, req, id);
    if (l.status === 'ARCHIVED') throw new AppError(409, 'INVALID_STATE', 'لا يمكن تعديل عرض مؤرشف.');
    await validateSpecDocuments(tx, id, input.specifications);
    const before = await tx.materialSpecification.findMany({ where: { listing_id: id } });
    await tx.materialSpecification.deleteMany({ where: { listing_id: id } });
    if (input.specifications.length) await tx.materialSpecification.createMany({ data: specRows(id, input.specifications) });
    await tx.materialListing.update({ where: { id }, data: { version: { increment: 1 } } });
    await audit(tx, actorFromRequest(req), {
      action: 'LISTING_SPECIFICATIONS_REPLACED',
      entityType: 'LISTING',
      entityId: id,
      before: before.map(specDto),
      after: input.specifications,
    });
    return tx.materialSpecification.findMany({ where: { listing_id: id }, orderBy: { sort_order: 'asc' } });
  });
  res.json({ data: specs.map(specDto) });
});

// ─── documents (P-25..P-28) ─────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

catalogRouter.post('/material-listings/:id/documents', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'FILE_TOO_LARGE', 'حجم الملف يتجاوز 20 ميجابايت.'));
    }
    next(err);
  });
}, async (req, res) => {
  const id = idParam(req.params.id);
  requireOrg(req, 'MINE');
  const meta = parse(documentMetaSchema, req.body);
  const file = req.file;
  if (!file) throw new AppError(400, 'VALIDATION_FAILED', 'أرفق ملفًا.', { fieldErrors: [{ field: 'file', message: 'الملف مطلوب' }] });
  const mime = sniffMime(file.buffer);
  if (!mime) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'الأنواع المسموحة: PDF وJPG وPNG فقط.');
  const sha = sha256Hex(file.buffer);
  const doc = await transaction(async (tx) => {
    const l = await ownListing(tx, req, id);
    if (l.status === 'ARCHIVED') throw new AppError(409, 'INVALID_STATE', 'لا يمكن الرفع على عرض مؤرشف.');
    const objectKey = `listings/${id}/${uuidv7()}`;
    await putObject(objectKey, file.buffer);
    const d = await tx.materialDocument.create({
      data: {
        listing_id: id,
        doc_type: meta.doc_type,
        title: meta.title,
        object_key: objectKey,
        mime_type: mime,
        size_bytes: BigInt(file.size),
        sha256: sha,
        visibility: meta.visibility,
        lab_name: meta.lab_name ?? null,
        issued_on: meta.issued_on ? new Date(`${meta.issued_on}T00:00:00Z`) : null,
        uploaded_by: auth(req).userId,
      },
    });
    await audit(tx, actorFromRequest(req), {
      action: 'DOCUMENT_UPLOADED',
      entityType: 'LISTING',
      entityId: id,
      after: { document_id: d.id, doc_type: d.doc_type, visibility: d.visibility, sha256: sha },
    });
    return d;
  });
  res.status(201).json(documentDto(doc, true, true));
});

catalogRouter.patch('/documents/:id', async (req, res) => {
  const org = requireOrg(req, 'MINE');
  const id = idParam(req.params.id);
  const input = parse(updateDocumentSchema, req.body);
  const doc = await transaction(async (tx) => {
    const d = await tx.materialDocument.findUnique({ where: { id }, include: { listing: true } });
    if (!d || d.listing.organization_id !== org.id) throw notFound();
    const updated = await tx.materialDocument.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), {
      action: 'DOCUMENT_UPDATED',
      entityType: 'LISTING',
      entityId: d.listing_id,
      before: { document_id: id, visibility: d.visibility, title: d.title },
      after: { document_id: id, visibility: updated.visibility, title: updated.title },
    });
    return updated;
  });
  res.json(documentDto(doc, true, true));
});

/** Returns a short-lived signed URL. Unauthorized access is a 404 and is audited (SEC-12). */
catalogRouter.get('/documents/:id/download', async (req, res) => {
  const a = auth(req);
  const id = idParam(req.params.id);
  const d = await db().materialDocument.findUnique({ where: { id }, include: { listing: true } });
  let allowed = false;
  if (d) {
    let hasOfferOrDeal = false;
    if (a.org?.type === 'FACTORY') {
      hasOfferOrDeal =
        (await db().purchaseOffer.count({ where: { listing_id: d.listing_id, factory_org_id: a.org.id, status: { in: ['SUBMITTED', 'COUNTERED'] } } })) > 0 ||
        (await db().deal.count({ where: { listing_id: d.listing_id, factory_org_id: a.org.id } })) > 0;
    }
    const listingVisible = d.listing.status === 'ACTIVE' || a.org?.id === d.listing.organization_id || a.isPlatformAdmin;
    allowed = listingVisible && canDownload(d, d.listing.organization_id, a, hasOfferOrDeal);
  }
  if (d && d.visibility !== 'PUBLIC') {
    await transaction((tx) =>
      audit(tx, actorFromRequest(req), {
        action: allowed ? 'DOCUMENT_ACCESS_GRANTED' : 'DOCUMENT_ACCESS_DENIED',
        entityType: 'DOCUMENT',
        entityId: d.id,
        after: { visibility: d.visibility },
      }),
    );
  }
  if (!d || !allowed) throw notFound();
  const { token, expiresIn } = signDownload(d.id);
  res.json({ url: `/api/v1/files/${token}`, expires_in: expiresIn });
});

publicFilesRouter.get('/files/:token', async (req, res) => {
  const v = verifyDownload(String(req.params.token));
  if (!v.ok) {
    throw v.reason === 'expired'
      ? new AppError(403, 'LINK_EXPIRED', 'انتهت صلاحية رابط التنزيل؛ اطلب رابطًا جديدًا.')
      : notFound();
  }
  const d = await db().materialDocument.findUnique({ where: { id: v.documentId } });
  if (!d) throw notFound();
  const data = await readObject(d.object_key);
  res.set('Content-Type', d.mime_type);
  res.set('Content-Disposition', `inline; filename="document-${d.id}${d.mime_type === 'application/pdf' ? '.pdf' : d.mime_type === 'image/png' ? '.png' : '.jpg'}"`);
  res.set('Cache-Control', 'private, no-store');
  res.send(data);
});
