import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { adminClient, app, orgClient, PASSWORD, registerClient } from './helpers.js';

describe('authentication (UC-001, SR-01..05)', () => {
  it('registers, returns a session and /me without an organization', async () => {
    const c = await registerClient();
    const me = await c.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.organization).toBeNull();
    expect(me.body.app_role).toBeNull();
    const user = await db().user.findUniqueOrThrow({ where: { email: c.email } });
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate email registration', async () => {
    const c = await registerClient();
    const res = await request(app).post('/api/v1/auth/register').send({ full_name: 'x y', email: c.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('uses one generic message for wrong password and unknown email', async () => {
    const c = await registerClient();
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: c.email, password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.request_id).toBeTruthy();
  });

  it('requires authentication for protected endpoints (SR-01)', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects authenticated writes without the CSRF token (SR-04)', async () => {
    const c = await registerClient();
    const res = await c.agent.post('/api/v1/organizations').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('sets an HttpOnly SameSite=Lax session cookie and logs out', async () => {
    const email = `cookie-${Date.now()}@test.local`;
    const res = await request(app).post('/api/v1/auth/register').send({ full_name: 'Cookie Test', email, password: PASSWORD });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const c = await registerClient();
    expect((await c.post('/auth/logout', {}, { idem: false })).status).toBe(204);
    expect((await c.get('/me')).status).toBe(401);
  });
});

describe('organizations (P-01..P-06, BR-001..003)', () => {
  it('creates an organization in PENDING_REVIEW with the creator as OWNER and its first site', async () => {
    const { client, orgId } = await orgClient('MINE', { active: false });
    const me = await client.get('/me');
    expect(me.body.organization).toMatchObject({ id: orgId, type: 'MINE', status: 'PENDING_REVIEW' });
    expect(me.body.membership_role).toBe('OWNER');
    const mines = await client.get('/mines?filter[org]=mine');
    expect(mines.body.data).toHaveLength(1);
  });

  it('ignores a client-supplied status or organization id (SEC-03)', async () => {
    const c = await registerClient();
    const res = await c.post('/organizations', {
      type: 'FACTORY',
      status: 'ACTIVE',
      organization_id: '00000000-0000-0000-0000-000000000000',
      legal_name_ar: 'مصنع يحاول التفعيل الذاتي',
      commercial_registration_no: `CR-SEC03-${Date.now()}`,
      city: 'جدة',
      region_code: 'MAKKAH',
      contact_email: 'a@test.local',
      contact_phone: '+966500000001',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_REVIEW');
  });

  it('rejects a duplicate registration number for the same type', async () => {
    const { client } = await orgClient('FACTORY');
    const org = await client.get('/me');
    const own = await client.get(`/organizations/${org.body.organization.id}`);
    const other = await registerClient();
    const res = await other.post('/organizations', {
      type: 'FACTORY',
      legal_name_ar: 'نسخة',
      commercial_registration_no: own.body.commercial_registration_no,
      city: 'جدة',
      region_code: 'MAKKAH',
      contact_email: 'a@test.local',
      contact_phone: '+966500000001',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_REGISTRATION');
  });

  it('returns 404 for another organization full profile (SR-07)', async () => {
    const a = await orgClient('MINE');
    const b = await orgClient('FACTORY');
    expect((await a.client.get(`/organizations/${b.orgId}`)).status).toBe(404);
    // ...but the short public profile of an ACTIVE organization is visible.
    expect((await a.client.get(`/organizations/${b.orgId}/public`)).status).toBe(200);
  });

  it('blocks commercial actions while PENDING_REVIEW (BR-002)', async () => {
    const { client } = await orgClient('MINE', { active: false });
    const res = await client.post('/mines', { name: 'منجم ثان', primary_activity: 'نحاس', region_code: 'MAKKAH', lat: 21, lng: 40 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_NOT_ACTIVE');
  });

  it('lets the owner add an existing user as MEMBER only; members cannot add members (SEC-04)', async () => {
    const { client, orgId } = await orgClient('CARRIER');
    const newcomer = await registerClient();
    const added = await client.post(`/organizations/${orgId}/members`, { email: newcomer.email, role: 'OWNER' });
    expect(added.status).toBe(201);
    expect(added.body.role).toBe('MEMBER');
    const outsider = await registerClient();
    const res = await newcomer.post(`/organizations/${orgId}/members`, { email: outsider.email });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('lets mines and carriers declare licenses, but not factories', async () => {
    const carrier = await orgClient('CARRIER');
    const ok = await carrier.client.post(`/organizations/${carrier.orgId}/licenses`, {
      license_type: 'COMMERCIAL_TRANSPORT',
      license_number: 'T-123',
      issuing_authority: 'جهة إصدار تجريبية',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.review_status).toBe('NOT_REVIEWED');
    const factory = await orgClient('FACTORY');
    const denied = await factory.client.post(`/organizations/${factory.orgId}/licenses`, {
      license_type: 'OTHER',
      license_number: 'X',
      issuing_authority: 'جهة',
    });
    expect(denied.status).toBe(403);
  });
});

describe('admin (P-05, SEC-05, BR-080)', () => {
  it('forbids /admin/* for non-admins (SEC-05)', async () => {
    const { client } = await orgClient('MINE');
    const res = await client.get('/admin/organizations');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('approves, then suspends with a mandatory reason, auditing and notifying each step', async () => {
    const admin = await adminClient();
    const { client, orgId } = await orgClient('FACTORY', { active: false });
    const queue = await admin.get('/admin/organizations?filter[status]=PENDING_REVIEW');
    expect(queue.body.data.some((o: { id: string }) => o.id === orgId)).toBe(true);

    expect((await admin.post(`/admin/organizations/${orgId}/approve`)).body.status).toBe('ACTIVE');
    expect((await admin.post(`/admin/organizations/${orgId}/approve`)).status).toBe(409);

    const noReason = await admin.post(`/admin/organizations/${orgId}/suspend`, {});
    expect(noReason.status).toBe(400);
    const suspended = await admin.post(`/admin/organizations/${orgId}/suspend`, { reason: 'مخالفة شروط الاستخدام' });
    expect(suspended.body).toMatchObject({ status: 'SUSPENDED', status_reason: 'مخالفة شروط الاستخدام' });

    const logs = await admin.get(`/admin/audit-logs?filter[entity_id]=${orgId}`);
    const actions = logs.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['ORGANIZATION_CREATED', 'ORGANIZATION_APPROVED', 'ORGANIZATION_SUSPENDED']));

    const notes = await client.get('/notifications');
    expect(notes.body.data.map((n: { event_type: string }) => n.event_type)).toContain('ORGANIZATION_SUSPENDED');
  });

  it('keeps the audit log append-only at the database level (BR-081)', async () => {
    await expect(db().auditLog.deleteMany({})).rejects.toThrow();
  });
});
