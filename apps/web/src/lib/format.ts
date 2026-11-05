// ADR-005 / UX-AC6: every date is shown in Asia/Riyadh with the zone named.

const TZ = 'Asia/Riyadh';

const dateTimeFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric' });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? `${dateTimeFmt.format(new Date(iso))}` : '—');
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const RIYADH_NOTE = 'بتوقيت الرياض';

export const fmtTons = (v: string | number | null | undefined) =>
  v == null ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 })} طن`;

export const fmtSar = (display: string | undefined | null) => (display ? `${display} ر.س` : '—');

/** Converts an ISO instant to the value of a <input type="datetime-local"> in Riyadh time (UTC+3, no DST). */
export function toRiyadhInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
/** Inverse of toRiyadhInput: a Riyadh wall-clock value → ISO UTC. */
export function fromRiyadhInput(local: string): string {
  return new Date(`${local}:00+03:00`).toISOString();
}

export function remaining(iso: string, nowMs = Date.now()): { text: string; past: boolean; urgent: boolean } {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return { text: 'انتهت المهلة', past: true, urgent: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d} يوم و${h % 24} ساعة` : h >= 1 ? `${h} ساعة و${m} دقيقة` : `${m} دقيقة`;
  return { text, past: false, urgent: ms < 6 * 3_600_000 };
}
