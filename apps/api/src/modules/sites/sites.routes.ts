import {
  factorySiteSchema,
  factorySiteUpdateSchema,
  mineSchema,
  mineUpdateSchema,
  operatingLocationSchema,
  operatingLocationUpdateSchema,
  REGION_CODES,
} from '@maknaz/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../../db.js';
import { auth, requireActiveOrg, requireOrg } from '../../lib/context.js';
import { AppError, notFound } from '../../lib/errors.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { mineDto, OPEN_DEAL_STATUSES, operatingLocationDto, siteDto } from './sites.service.js';

export const sitesRouter = Router();

// ─── mines (P-10, P-11, P-12) ───────────────────────────────────────────

sitesRouter.post('/mines', async (req, res) => {
  const org = requireActiveOrg(req, 'MINE');
  const input = parse(mineSchema, req.body);
  const mine = await transaction(async (tx) => {
    const m = await tx.mine.create({ data: { ...input, address_text: input.address_text ?? null, organization_id: org.id } });
    await audit(tx, actorFromRequest(req), { action: 'MINE_CREATED', entityType: 'MINE', entityId: m.id, after: mineDto(m) });
    return m;
  });
  res.status(201).json(mineDto(mine));
});

const mineListQuery = z.object({
  'filter[region]': z.enum(REGION_CODES).optional(),
  'filter[org]': z.enum(['mine']).optional(),
});

/** Any signed-in user may browse ACTIVE mines of ACTIVE organizations; a mine org also sees its own. */
sitesRouter.get('/mines', async (req, res) => {
  const a = auth(req);
  const q = parse(mineListQuery, req.query);
  const own = q['filter[org]'] === 'mine' && a.org?.type === 'MINE';
  const mines = await db().mine.findMany({
    where: own
      ? { organization_id: a.org!.id, ...(q['filter[region]'] ? { region_code: q['filter[region]'] } : {}) }
      : {
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
          ...(q['filter[region]'] ? { region_code: q['filter[region]'] } : {}),
        },
    include: { organization: true, _count: { select: { listings: { where: { status: 'ACTIVE' } } } } },
    orderBy: { created_at: 'asc' },
    take: 500,
  });
  res.json({ data: mines.map((m) => mineDto(m)) });
});

sitesRouter.get('/mines/:id', async (req, res) => {
  const a = auth(req);
  const m = await db().mine.findUnique({
    where: { id: idParam(req.params.id) },
    include: { organization: true, _count: { select: { listings: { where: { status: 'ACTIVE' } } } } },
  });
  const isOwner = m && a.org?.id === m.organization_id;
  if (!m || (!isOwner && !a.isPlatformAdmin && (m.status !== 'ACTIVE' || m.organization.status !== 'ACTIVE'))) throw notFound();
  // SR-08: exact coordinates only for users of ACTIVE organizations (or the owner / admin).
  if (!isOwner && !a.isPlatformAdmin && a.org?.status !== 'ACTIVE') {
    throw new AppError(403, 'ORG_NOT_ACTIVE', 'تظهر تفاصيل المواقع للجهات المعتمدة فقط.');
  }
  const openDeals = isOwner
    ? await db().deal.count({ where: { mine_id: m.id, status: { in: OPEN_DEAL_STATUSES } } })
    : 0;
  res.json(mineDto(m, isOwner ? { has_open_deals: openDeals > 0 } : {}));
});

sitesRouter.patch('/mines/:id', async (req, res) => {
  const org = requireOrg(req, 'MINE');
  const id = idParam(req.params.id);
  const input = parse(mineUpdateSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await tx.mine.findFirst({ where: { id, organization_id: org.id } });
    if (!before) throw notFound();
    const movesLocation = (input.lat !== undefined && Number(before.lat) !== input.lat) ||
      (input.lng !== undefined && Number(before.lng) !== input.lng);
    if (movesLocation) {
      const open = await tx.deal.count({ where: { mine_id: id, status: { in: OPEN_DEAL_STATUSES } } });
      if (open > 0) {
        throw new AppError(409, 'INVALID_STATE', 'لا يمكن تعديل إحداثيات منجم له صفقات قائمة، لأنها تدخل في حساب المسافات.');
      }
    }
    const m = await tx.mine.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), { action: 'MINE_UPDATED', entityType: 'MINE', entityId: id, before: mineDto(before), after: mineDto(m) });
    return m;
  });
  res.json(mineDto(updated));
});

// ─── factory sites (P-13) ───────────────────────────────────────────────

sitesRouter.get('/factory-sites', async (req, res) => {
  const org = requireOrg(req, 'FACTORY');
  const sites = await db().factorySite.findMany({ where: { organization_id: org.id }, orderBy: { created_at: 'asc' } });
  res.json({ data: sites.map(siteDto) });
});

sitesRouter.post('/factory-sites', async (req, res) => {
  const org = requireOrg(req, 'FACTORY');
  const input = parse(factorySiteSchema, req.body);
  const site = await transaction(async (tx) => {
    const s = await tx.factorySite.create({ data: { ...input, address_text: input.address_text ?? null, organization_id: org.id } });
    await audit(tx, actorFromRequest(req), { action: 'FACTORY_SITE_CREATED', entityType: 'FACTORY_SITE', entityId: s.id, after: siteDto(s) });
    return s;
  });
  res.status(201).json(siteDto(site));
});

sitesRouter.patch('/factory-sites/:id', async (req, res) => {
  const org = requireOrg(req, 'FACTORY');
  const id = idParam(req.params.id);
  const input = parse(factorySiteUpdateSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await tx.factorySite.findFirst({ where: { id, organization_id: org.id } });
    if (!before) throw notFound();
    const s = await tx.factorySite.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), { action: 'FACTORY_SITE_UPDATED', entityType: 'FACTORY_SITE', entityId: id, before: siteDto(before), after: siteDto(s) });
    return s;
  });
  res.json(siteDto(updated));
});

// ─── carrier operating locations (P-14) ─────────────────────────────────

sitesRouter.get('/carrier/operating-locations', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const rows = await db().carrierOperatingLocation.findMany({ where: { organization_id: org.id }, orderBy: { created_at: 'asc' } });
  res.json({ data: rows.map(operatingLocationDto) });
});

sitesRouter.post('/carrier/operating-locations', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const input = parse(operatingLocationSchema, req.body);
  const loc = await transaction(async (tx) => {
    const { address_text: _ignored, ...data } = input;
    const l = await tx.carrierOperatingLocation.create({ data: { ...data, organization_id: org.id } });
    await audit(tx, actorFromRequest(req), { action: 'OPERATING_LOCATION_CREATED', entityType: 'CARRIER_LOCATION', entityId: l.id, after: operatingLocationDto(l) });
    return l;
  });
  res.status(201).json(operatingLocationDto(loc));
});

sitesRouter.patch('/carrier/operating-locations/:id', async (req, res) => {
  const org = requireOrg(req, 'CARRIER');
  const id = idParam(req.params.id);
  const { address_text: _ignored, ...input } = parse(operatingLocationUpdateSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await tx.carrierOperatingLocation.findFirst({ where: { id, organization_id: org.id } });
    if (!before) throw notFound();
    const l = await tx.carrierOperatingLocation.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), { action: 'OPERATING_LOCATION_UPDATED', entityType: 'CARRIER_LOCATION', entityId: id, before: operatingLocationDto(before), after: operatingLocationDto(l) });
    return l;
  });
  res.json(operatingLocationDto(updated));
});
