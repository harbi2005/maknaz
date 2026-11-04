import {
  addMemberSchema,
  createLicenseSchema,
  createOrganizationSchema,
  updateOrganizationSchema,
} from '@maknaz/shared';
import { Router, type Request } from 'express';
import { db, transaction } from '../../db.js';
import { auth, requireOrg } from '../../lib/context.js';
import { AppError, notFound } from '../../lib/errors.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { notifyAdmins } from '../notifications/notify.js';
import { createFirstSite, firstSiteSchemaFor } from '../sites/sites.service.js';
import { licenseDto, memberDto, organizationDto, organizationPublicDto } from './dto.js';

export const organizationsRouter = Router();

/** Ownership (RBAC layer 2): the path id must be the caller's own organization, else 404. */
function ownOrgId(req: Request, id: string): string {
  const a = auth(req);
  if (!a.org || a.org.id !== id) throw notFound();
  return id;
}

/** P-01: create an organization. The creator becomes its OWNER; status starts PENDING_REVIEW. */
organizationsRouter.post('/organizations', async (req, res) => {
  const a = auth(req);
  if (a.isPlatformAdmin) throw new AppError(403, 'FORBIDDEN_ROLE', 'حساب الإدارة لا ينشئ جهات.');
  if (a.org) throw new AppError(409, 'ALREADY_MEMBER', 'أنت عضو في جهة بالفعل.');
  const input = parse(createOrganizationSchema, req.body);
  const firstSite = req.body?.first_site ? parse(firstSiteSchemaFor(input.type), req.body.first_site) : null;

  const dup = await db().organization.findFirst({
    where: { type: input.type, commercial_registration_no: input.commercial_registration_no },
  });
  if (dup) throw new AppError(409, 'DUPLICATE_REGISTRATION', 'توجد جهة مسجلة بنفس رقم السجل التجاري ونفس النوع.');

  const org = await transaction(async (tx) => {
    const o = await tx.organization.create({
      data: {
        type: input.type,
        legal_name_ar: input.legal_name_ar,
        legal_name_en: input.legal_name_en ?? null,
        commercial_registration_no: input.commercial_registration_no,
        city: input.city,
        region_code: input.region_code,
        contact_email: input.contact_email,
        contact_phone: input.contact_phone,
      },
    });
    await tx.organizationMember.create({ data: { organization_id: o.id, user_id: a.userId, role: 'OWNER' } });
    if (o.type === 'CARRIER') await tx.carrierProfile.create({ data: { organization_id: o.id } });
    if (firstSite) await createFirstSite(tx, o, firstSite);
    await audit(tx, { ...actorFromRequest(req), orgId: o.id }, {
      action: 'ORGANIZATION_CREATED',
      entityType: 'ORGANIZATION',
      entityId: o.id,
      after: organizationDto(o),
    });
    await notifyAdmins(tx, {
      eventType: 'ORG_PENDING_REVIEW',
      titleAr: 'جهة جديدة بانتظار الاعتماد',
      bodyAr: `${o.legal_name_ar} تنتظر المراجعة.`,
      entityType: 'ORGANIZATION',
      entityId: o.id,
      linkPath: `/admin/organizations/${o.id}`,
    });
    return o;
  });
  res.status(201).json(organizationDto(org));
});

organizationsRouter.get('/organizations/:id', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const o = await db().organization.findUnique({ where: { id } });
  if (!o) throw notFound();
  res.json(organizationDto(o));
});

/** P-06: short public profile, only for ACTIVE organizations, readable by any signed-in user. */
organizationsRouter.get('/organizations/:id/public', async (req, res) => {
  const o = await db().organization.findUnique({ where: { id: idParam(req.params.id) } });
  if (!o || o.status !== 'ACTIVE') throw notFound();
  res.json(organizationPublicDto(o));
});

/** P-02: OWNER edits the profile; not allowed once REJECTED. */
organizationsRouter.patch('/organizations/:id', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const org = requireOrg(req);
  if (org.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN_ROLE', 'تعديل ملف الجهة متاح لمالك الجهة فقط.');
  const input = parse(updateOrganizationSchema, req.body);
  const updated = await transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id } });
    if (before.status === 'REJECTED') throw new AppError(409, 'INVALID_STATE', 'لا يمكن تعديل جهة مرفوضة.');
    const o = await tx.organization.update({ where: { id }, data: input });
    await audit(tx, actorFromRequest(req), {
      action: 'ORGANIZATION_UPDATED',
      entityType: 'ORGANIZATION',
      entityId: id,
      before: organizationDto(before),
      after: organizationDto(o),
    });
    return o;
  });
  res.json(organizationDto(updated));
});

organizationsRouter.get('/organizations/:id/members', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const members = await db().organizationMember.findMany({
    where: { organization_id: id, status: { not: 'REMOVED' } },
    include: { user: true },
    orderBy: { created_at: 'asc' },
  });
  res.json({ data: members.map(memberDto) });
});

/**
 * P-03: OWNER adds a member. MVP simplification: the person registers first, then the owner
 * adds them by email (no invitation emails in the MVP). New members always get MEMBER (SEC-04).
 */
organizationsRouter.post('/organizations/:id/members', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const org = requireOrg(req);
  if (org.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN_ROLE', 'إضافة الأعضاء متاحة لمالك الجهة فقط.');
  if (org.status !== 'ACTIVE') throw new AppError(403, 'ORG_NOT_ACTIVE', 'يمكن إضافة الأعضاء بعد اعتماد الجهة.');
  const input = parse(addMemberSchema, req.body);
  const user = await db().user.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } } });
  if (!user || user.is_platform_admin) {
    throw new AppError(404, 'NOT_FOUND', 'لا يوجد حساب بهذا البريد؛ اطلب من الشخص إنشاء حساب أولًا.');
  }
  const active = await db().organizationMember.findFirst({ where: { user_id: user.id, status: 'ACTIVE' } });
  if (active) throw new AppError(409, 'ALREADY_MEMBER', 'هذا المستخدم عضو في جهة أخرى بالفعل.');
  const member = await transaction(async (tx) => {
    const m = await tx.organizationMember.upsert({
      where: { organization_id_user_id: { organization_id: id, user_id: user.id } },
      create: { organization_id: id, user_id: user.id, role: 'MEMBER', status: 'ACTIVE' },
      update: { role: 'MEMBER', status: 'ACTIVE' },
      include: { user: true },
    });
    await audit(tx, actorFromRequest(req), {
      action: 'MEMBER_ADDED',
      entityType: 'ORGANIZATION',
      entityId: id,
      after: { user_id: user.id, role: 'MEMBER' },
    });
    return m;
  });
  res.status(201).json(memberDto(member));
});

/** OWNER removes a member (never themselves: an organization keeps at least one owner). */
organizationsRouter.delete('/organizations/:id/members/:memberId', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const org = requireOrg(req);
  if (org.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN_ROLE', 'إزالة الأعضاء متاحة لمالك الجهة فقط.');
  const memberId = idParam(req.params.memberId);
  const m = await db().organizationMember.findFirst({ where: { id: memberId, organization_id: id } });
  if (!m || m.status === 'REMOVED') throw notFound();
  if (m.role === 'OWNER') throw new AppError(409, 'INVALID_STATE', 'لا يمكن إزالة مالك الجهة.');
  await transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
    await tx.userSession.deleteMany({ where: { user_id: m.user_id } });
    await audit(tx, actorFromRequest(req), {
      action: 'MEMBER_REMOVED',
      entityType: 'ORGANIZATION',
      entityId: id,
      before: { user_id: m.user_id, role: m.role },
    });
  });
  res.status(204).end();
});

organizationsRouter.get('/organizations/:id/licenses', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  const licenses = await db().organizationLicense.findMany({ where: { organization_id: id }, orderBy: { created_at: 'asc' } });
  res.json({ data: licenses.map(licenseDto) });
});

/** P-04: mines and carriers self-declare licenses (BR-090); the platform grants no permit. */
organizationsRouter.post('/organizations/:id/licenses', async (req, res) => {
  const id = ownOrgId(req, idParam(req.params.id));
  requireOrg(req, 'MINE', 'CARRIER');
  const input = parse(createLicenseSchema, req.body);
  const license = await transaction(async (tx) => {
    const l = await tx.organizationLicense.create({
      data: {
        organization_id: id,
        license_type: input.license_type,
        license_number: input.license_number,
        issuing_authority: input.issuing_authority,
        expires_on: input.expires_on ? new Date(`${input.expires_on}T00:00:00Z`) : null,
      },
    });
    await audit(tx, actorFromRequest(req), {
      action: 'LICENSE_DECLARED',
      entityType: 'ORGANIZATION',
      entityId: id,
      after: licenseDto(l),
    });
    return l;
  });
  res.status(201).json(licenseDto(license));
});
