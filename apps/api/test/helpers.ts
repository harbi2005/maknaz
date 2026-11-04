import type { OrgType } from '@maknaz/shared';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { ensurePolicyV1 } from '../src/modules/policy/policy.js';

export const app = createApp();
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export const PASSWORD = 'correct-horse-battery';

/** An authenticated client: cookie jar + CSRF header on writes + optional Idempotency-Key. */
export class Client {
  agent = request.agent(app);
  csrf = '';
  constructor(public email: string) {}

  get(path: string) {
    return this.agent.get(`/api/v1${path}`);
  }
  post(path: string, body: object = {}, opts: { idem?: string | false } = {}) {
    const r = this.agent.post(`/api/v1${path}`).set('X-CSRF-Token', this.csrf).send(body);
    if (opts.idem !== false) r.set('Idempotency-Key', opts.idem ?? `k-${uniq()}`);
    return r;
  }
  patch(path: string, body: object = {}) {
    return this.agent.patch(`/api/v1${path}`).set('X-CSRF-Token', this.csrf).send(body);
  }
  put(path: string, body: object = {}) {
    return this.agent.put(`/api/v1${path}`).set('X-CSRF-Token', this.csrf).send(body);
  }
  delete(path: string) {
    return this.agent.delete(`/api/v1${path}`).set('X-CSRF-Token', this.csrf);
  }
}

export async function registerClient(name = 'مستخدم اختبار'): Promise<Client> {
  await ensurePolicyV1();
  const email = `user-${uniq()}@test.local`;
  const c = new Client(email);
  const res = await c.agent.post('/api/v1/auth/register').send({ full_name: name, email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  c.csrf = res.body.csrf_token;
  return c;
}

export async function adminClient(): Promise<Client> {
  const c = await registerClient('مدير المنصة');
  await db().user.update({ where: { email: c.email }, data: { is_platform_admin: true } });
  return c;
}

const DEFAULT_SITES: Record<OrgType, Record<string, unknown>> = {
  MINE: { name: 'منجم اختبار', primary_activity: 'ذهب', region_code: 'MAKKAH', lat: 21.43, lng: 40.51 },
  FACTORY: { name: 'مصنع اختبار', region_code: 'MAKKAH', lat: 21.54, lng: 39.17 },
  CARRIER: { name: 'ساحة أسطول', location_kind: 'FLEET_YARD', region_code: 'MAKKAH', lat: 21.4, lng: 40.3 },
};

/** Registers a user, creates an organization (with first site) and optionally approves it. */
export async function orgClient(type: OrgType, opts: { active?: boolean; site?: Record<string, unknown> } = {}) {
  const c = await registerClient();
  const res = await c.post('/organizations', {
    type,
    legal_name_ar: `جهة ${type} ${uniq()}`,
    commercial_registration_no: `CR-${uniq()}`,
    city: 'الطائف',
    region_code: 'MAKKAH',
    contact_email: 'ops@test.local',
    contact_phone: '+966500000000',
    first_site: opts.site ?? DEFAULT_SITES[type],
  });
  if (res.status !== 201) throw new Error(`org create failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (opts.active !== false) {
    await db().organization.update({ where: { id: res.body.id }, data: { status: 'ACTIVE' } });
  }
  return { client: c, orgId: res.body.id as string };
}
