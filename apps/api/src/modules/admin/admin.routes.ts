import { adminReasonSchema, ORG_STATUSES, ORG_TYPES, reviewLicenseSchema } from '@maknaz/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db, transaction } from '../../db.js';
import { requireAdmin } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { AppError, notFound } from '../../lib/errors.js';
import { iso } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { licenseDto, memberDto, organizationDto } from '../accounts/dto.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import { mineDto, operatingLocationDto, siteDto } from '../sites/sites.service.js';

export const adminRouter = Router();

// SEC-05: every /admin/* route requires a platform admin.
adminRouter.use('/admin', (req, _res, next) => {
  requireAdmin(req);
  next();
});

const orgListQuery = z.object({
  'filter[status]': z.enum(ORG_STATUSES).optional(),
  'filter[type]': z.enum(ORG_TYPES).optional(),
});

adminRouter.get('/admin/organizations', async (req, res) => {
  const q = parse(orgListQuery, req.query);
  const orgs = await db().organization.findMany({
    where: {
      ...(q['filter[status]'] ? { status: q['filter[status]'] } : {}),
      ...(q['filter[type]'] ? { type: q['filter[type]'] } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  });
  res.json({ data: orgs.map(organizationDto) });
});

adminRouter.get('/admin/organizations/:id', async (req, res) => {
  const o = await db().organization.findUnique({
    where: { id: idParam(req.params.id) },
    include: {
      members: { include: { user: true }, where: { status: { not: 'REMOVED' } } },
      licenses: true,
      mines: true,
      factory_sites: true,
      operating_locations: true,
    },
  });
  if (!o) throw notFound();
  res.json({
    ...organizationDto(o),
    members: o.members.map(memberDto),
    licenses: o.licenses.map(licenseDto),
    sites: [
      ...o.mines.map((m) => ({ kind: 'MINE', ...mineDto(m) })),
      ...o.factory_sites.map((s) => ({ kind: 'FACTORY_SITE', ...siteDto(s) })),
      ...o.operating_locations.map((l) => ({ kind: 'CARRIER_LOCATION', ...operatingLocationDto(l), status: l.is_active ? 'ACTIVE' : 'INACTIVE' })),
    ],
  });
});

type Transition = { from: string[]; to: string; action: string; needsReason: boolean; titleAr: string };
const TRANSITIONS: Record<string, Transition> = {
  approve: { from: ['PENDING_REVIEW', 'SUSPENDED'], to: 'ACTIVE', action: 'ORGANIZATION_APPROVED', needsReason: false, titleAr: 'تم اعتماد جهتك' },
  reject: { from: ['PENDING_REVIEW'], to: 'REJECTED', action: 'ORGANIZATION_REJECTED', needsReason: true, titleAr: 'تم رفض طلب جهتك' },
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED', action: 'ORGANIZATION_SUSPENDED', needsReason: true, titleAr: 'تم تعليق جهتك' },
};

/** P-05: approve / reject / suspend. Suspension does not auto-cancel existing deals (BR-005). */
async function transitionOrganization(req: Request, kind: keyof typeof TRANSITIONS) {
  const t = TRANSITIONS[kind]!;
  const id = idParam(req.params.id);
  const reason = t.needsReason ? parse(adminReasonSchema, req.body).reason : null;
  const admin = requireAdmin(req);
  return transaction(async (tx) => {
    const before = await tx.organization.findUnique({ where: { id } });
    if (!before) throw notFound();
    // Conditional update = state guard (TRANSACTION_STATE_MACHINE §0.2).
    const r = await tx.organization.updateMany({
      where: { id, status: { in: t.from } },
      data: { status: t.to, status_reason: reason, reviewed_by: admin.userId, reviewed_at: now() },
    });
    if (r.count === 0) {
      throw new AppError(409, 'INVALID_STATE', 'لا تسمح حالة الجهة الحالية بهذا الإجراء.', { details: { status: before.status } });
    }
    const after = await tx.organization.findUniqueOrThrow({ where: { id } });
    await audit(tx, actorFromRequest(req), {
      action: t.action,
      entityType: 'ORGANIZATION',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status, reason },
    });
    await notifyOrgs(tx, [id], {
      eventType: t.action,
      titleAr: t.titleAr,
      bodyAr: reason ? `السبب: ${reason}` : 'يمكنك الآن استخدام كل خدمات المنصة.',
      entityType: 'ORGANIZATION',
      entityId: id,
      linkPath: '/organization',
    });
    return after;
  });
}

for (const kind of Object.keys(TRANSITIONS) as (keyof typeof TRANSITIONS)[]) {
  adminRouter.post(`/admin/organizations/:id/${kind}`, async (req, res) => {
    res.json(organizationDto(await transitionOrganization(req, kind)));
  });
}

adminRouter.patch('/admin/licenses/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = idParam(req.params.id);
  const input = parse(reviewLicenseSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await tx.organizationLicense.findUnique({ where: { id } });
    if (!before) throw notFound();
    const l = await tx.organizationLicense.update({
      where: { id },
      data: { review_status: input.review_status, reviewed_by: admin.userId, reviewed_at: now() },
    });
    await audit(tx, actorFromRequest(req), {
      action: 'LICENSE_REVIEWED',
      entityType: 'ORGANIZATION',
      entityId: l.organization_id,
      before: { license_id: id, review_status: before.review_status },
      after: { license_id: id, review_status: l.review_status },
    });
    return l;
  });
  res.json(licenseDto(updated));
});

const auditQuery = z.object({
  'filter[entity_type]': z.string().max(50).optional(),
  'filter[entity_id]': z.uuid().optional(),
  'filter[actor_org]': z.uuid().optional(),
  'filter[action]': z.string().max(80).optional(),
  'page[size]': z.coerce.number().int().min(1).max(100).default(50),
  'page[cursor]': z.string().max(200).optional(),
});

/** P-72: audit log with filters; cursor = occurred_at|id of the last row. */
adminRouter.get('/admin/audit-logs', async (req, res) => {
  const q = parse(auditQuery, req.query);
  let cursorFilter = {};
  if (q['page[cursor]']) {
    const [ts, id] = Buffer.from(q['page[cursor]'], 'base64url').toString().split('|');
    if (ts && id) {
      cursorFilter = { OR: [{ occurred_at: { lt: new Date(ts) } }, { occurred_at: new Date(ts), id: { lt: id } }] };
    }
  }
  const size = q['page[size]'];
  const rows = await db().auditLog.findMany({
    where: {
      ...(q['filter[entity_type]'] ? { entity_type: q['filter[entity_type]'] } : {}),
      ...(q['filter[entity_id]'] ? { entity_id: q['filter[entity_id]'] } : {}),
      ...(q['filter[actor_org]'] ? { actor_org_id: q['filter[actor_org]'] } : {}),
      ...(q['filter[action]'] ? { action: q['filter[action]'] } : {}),
      ...cursorFilter,
    },
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    take: size + 1,
  });
  const page = rows.slice(0, size);
  const userIds = [...new Set(page.map((r) => r.actor_user_id).filter((x): x is string => !!x))];
  const users = await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, full_name: true } });
  const names = new Map(users.map((u) => [u.id, u.full_name]));
  const last = page[page.length - 1];
  res.json({
    data: page.map((r) => ({
      id: r.id,
      occurred_at: r.occurred_at.toISOString(),
      actor_type: r.actor_type,
      actor_user_id: r.actor_user_id,
      actor_user_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
      actor_org_id: r.actor_org_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      before: r.before,
      after: r.after,
      request_id: r.request_id,
    })),
    page: {
      size,
      has_more: rows.length > size,
      next_cursor: rows.length > size && last ? Buffer.from(`${iso(last.occurred_at)}|${last.id}`).toString('base64url') : null,
    },
  });
});
