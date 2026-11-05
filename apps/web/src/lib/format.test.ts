import { riyalsToHalalas } from '@maknaz/shared';
import { describe, expect, it } from 'vitest';
import { fromRiyadhInput, remaining, toRiyadhInput } from './format';

describe('Riyadh time conversion (ADR-005)', () => {
  it('round-trips datetime-local values through Riyadh time (UTC+3)', () => {
    expect(toRiyadhInput('2026-11-10T05:00:00.000Z')).toBe('2026-11-10T08:00');
    expect(fromRiyadhInput('2026-11-10T08:00')).toBe('2026-11-10T05:00:00.000Z');
  });

  it('describes remaining time and flags urgency', () => {
    const now = Date.parse('2026-11-04T00:00:00Z');
    expect(remaining('2026-11-04T03:30:00Z', now)).toMatchObject({ past: false, urgent: true });
    expect(remaining('2026-11-06T00:00:00Z', now)).toMatchObject({ past: false, urgent: false });
    expect(remaining('2026-11-03T00:00:00Z', now).past).toBe(true);
  });
});

describe('riyal input parsing (no floating point, ADR-004)', () => {
  it('converts typed riyals to integer halalas', () => {
    expect(riyalsToHalalas('42')).toBe(4200);
    expect(riyalsToHalalas('42.5')).toBe(4250);
    expect(riyalsToHalalas('1,234.05')).toBe(123405);
    expect(riyalsToHalalas('0.1')).toBe(10);
  });

  it('rejects malformed amounts', () => {
    expect(riyalsToHalalas('abc')).toBeNull();
    expect(riyalsToHalalas('1.234')).toBeNull();
    expect(riyalsToHalalas('-5')).toBeNull();
  });
});
