import { describe, expect, it } from 'vitest';
import {
  createOrganizationSchema,
  formatHalalas,
  registerSchema,
  toMoney,
  updateOrganizationSchema,
} from '../src/index.js';

describe('formatHalalas (ADR-004)', () => {
  it('formats integer halalas with thousands separators', () => {
    expect(formatHalalas(2520000)).toBe('25,200.00');
    expect(formatHalalas(4680000)).toBe('46,800.00');
    expect(formatHalalas(5)).toBe('0.05');
    expect(formatHalalas(0)).toBe('0.00');
    expect(formatHalalas(-150)).toBe('-1.50');
  });

  it('supports bigint amounts beyond Number.MAX_SAFE_INTEGER', () => {
    expect(formatHalalas(123456789012345678n)).toBe('1,234,567,890,123,456.78');
  });

  it('rejects non-integer amounts instead of rounding floats', () => {
    expect(() => formatHalalas(10.5)).toThrow(RangeError);
  });

  it('builds the API money object', () => {
    expect(toMoney(4500)).toEqual({ amount_halalas: 4500, currency: 'SAR', display: '45.00' });
  });
});

describe('registerSchema (SR-03)', () => {
  const valid = { full_name: 'مستخدم تجريبي', email: 'User@Example.com ', password: 'long-enough-pass' };

  it('normalises email and accepts a valid registration', () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe('user@example.com');
  });

  it('requires at least 10 password characters', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects malformed email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('organization schemas', () => {
  const valid = {
    type: 'MINE',
    legal_name_ar: 'منجم تجريبي أ',
    commercial_registration_no: 'DEMO-0001',
    city: 'الطائف',
    region_code: 'MAKKAH',
    contact_email: 'ops@example.com',
    contact_phone: '+966500000000',
  };

  it('strips client-supplied organization_id and status (SEC-03)', () => {
    const parsed = createOrganizationSchema.parse({ ...valid, id: 'x', status: 'ACTIVE', organization_id: 'y' });
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('organization_id');
    expect(parsed).not.toHaveProperty('id');
  });

  it('rejects unknown region codes and organization types', () => {
    expect(createOrganizationSchema.safeParse({ ...valid, region_code: 'MARS' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...valid, type: 'ADMIN' }).success).toBe(false);
  });

  it('does not allow changing the organization type on update (BR-001)', () => {
    const parsed = updateOrganizationSchema.parse({ city: 'جدة', type: 'FACTORY' });
    expect(parsed).not.toHaveProperty('type');
  });

  it('rejects an empty update', () => {
    expect(updateOrganizationSchema.safeParse({}).success).toBe(false);
  });
});
