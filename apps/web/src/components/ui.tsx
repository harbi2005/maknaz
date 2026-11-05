import {
  DEAL_STATUS_LABELS,
  LISTING_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  ORG_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  SIMULATION_BADGE_TEXT,
  STRAIGHT_LINE_LABEL,
  VERIFICATION_LABELS,
  type Money,
  type VerificationStatus,
} from '@maknaz/shared';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ApiError } from '../lib/api';
import { fmtDateTime, fmtSar, remaining, RIYADH_NOTE } from '../lib/format';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─── Buttons & layout ────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  // Text on copper: charcoal, ≥16px bold (UI_UX §1.1).
  primary: 'bg-copper text-charcoal font-bold hover:bg-[#c7845f] disabled:opacity-60',
  secondary: 'bg-charcoal text-paper font-semibold hover:bg-[#33383a] disabled:opacity-60',
  ghost: 'bg-transparent text-charcoal border border-line hover:bg-paper disabled:opacity-60',
  danger: 'bg-danger text-paper font-semibold hover:opacity-90 disabled:opacity-60',
};

export function Button({ variant = 'primary', loading, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: IconName }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base transition-colors', VARIANTS[variant], className)}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon ? <Icon name={icon} className="size-5" /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-card border border-line bg-paper p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ─── Form fields (validation messages under the field, UI_UX §1.4) ──────

export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: ReactNode; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:border-copper aria-[invalid=true]:border-danger';

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <select {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cx(inputCls, 'min-h-24 py-2', className)} />;
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2">
      <input type="checkbox" className="size-5 accent-[#B8734F]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ─── Status chips (UI_UX §4) ────────────────────────────────────────────

type Tone = 'info' | 'copper' | 'success' | 'danger' | 'muted' | 'warning';
const TONES: Record<Tone, string> = {
  info: 'bg-info/10 text-info border-info/30',
  copper: 'bg-copper/15 text-copper-dark border-copper/40',
  success: 'bg-success/10 text-success border-success/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  warning: 'bg-warning/15 text-[#7d5a17] border-warning/40',
  muted: 'bg-black/5 text-muted border-line',
};

const STATUS: Record<string, Record<string, [string, Tone]>> = {
  offer: Object.fromEntries(Object.entries(OFFER_STATUS_LABELS).map(([k, v]) => [k, [v, ({ SUBMITTED: 'info', COUNTERED: 'copper', ACCEPTED: 'success', REJECTED: 'danger' } as Record<string, Tone>)[k] ?? 'muted']])),
  round: Object.fromEntries(Object.entries(ROUND_STATUS_LABELS).map(([k, v]) => [k, [v, ({ PENDING: 'info', ACCEPTED: 'success', REJECTED: 'danger', COUNTERED: 'copper' } as Record<string, Tone>)[k] ?? 'muted']])),
  deal: Object.fromEntries(Object.entries(DEAL_STATUS_LABELS).map(([k, v]) => [k, [v, ({ PENDING_CARRIER: 'info', PENDING_CARRIER_RETRY: 'warning', AWAITING_PAYMENT: 'copper', PAID: 'success', IN_FULFILLMENT: 'info', COMPLETED: 'success', CANCELLED: 'danger' } as Record<string, Tone>)[k]!]])),
  shipment: Object.fromEntries(Object.entries(SHIPMENT_STATUS_LABELS).map(([k, v]) => [k, [v, ({ DELAYED: 'warning', CANCELLED: 'danger', COMPLETED: 'success', DELIVERED: 'success', RECONFIRM_REQUIRED: 'warning', PENDING_CARRIER: 'info' } as Record<string, Tone>)[k] ?? 'copper']])),
  org: Object.fromEntries(Object.entries(ORG_STATUS_LABELS).map(([k, v]) => [k, [v, ({ ACTIVE: 'success', PENDING_REVIEW: 'warning', REJECTED: 'danger', SUSPENDED: 'danger' } as Record<string, Tone>)[k]!]])),
  listing: Object.fromEntries(Object.entries(LISTING_STATUS_LABELS).map(([k, v]) => [k, [v, ({ ACTIVE: 'success', DRAFT: 'muted', INACTIVE: 'warning', ARCHIVED: 'muted' } as Record<string, Tone>)[k]!]])),
  quote: Object.fromEntries(Object.entries(QUOTE_STATUS_LABELS).map(([k, v]) => [k, [v, ({ SUBMITTED: 'info', SELECTED: 'success', FULFILLED: 'success' } as Record<string, Tone>)[k] ?? 'muted']])),
  payment: Object.fromEntries(Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => [k, [v, ({ PAYMENT_PENDING: 'copper', SIMULATED_PAYMENT_COMPLETED: 'success', PAYMENT_EXPIRED: 'danger' } as Record<string, Tone>)[k] ?? 'info']])),
};

export function StatusChip({ kind, status }: { kind: keyof typeof STATUS; status: string }) {
  const [label, tone] = STATUS[kind]?.[status] ?? [status, 'muted'];
  return <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap', TONES[tone])}>{label}</span>;
}

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm', TONES[tone])}>{children}</span>;
}

// ─── Mandatory domain components (UI_UX §1.3) ───────────────────────────

/** NFR-037: shown on every financial screen and document. */
export function SimulationBadge({ large }: { large?: boolean }) {
  return (
    <span
      data-testid="simulation-badge"
      className={cx('inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-copper bg-copper/10 font-bold text-copper-dark', large ? 'px-4 py-2 text-base' : 'px-2 py-0.5 text-xs')}
    >
      <Icon name="flask" className={large ? 'size-5' : 'size-3.5'} />
      {SIMULATION_BADGE_TEXT}
    </span>
  );
}

const VERIFY_TONE: Record<VerificationStatus, [Tone, IconName]> = {
  LAB_REPORTED: ['success', 'doc'],
  DECLARED: ['info', 'pen'],
  ESTIMATED: ['warning', 'gauge'],
  UNKNOWN: ['muted', 'help'],
};
/** Colour + icon + text, never colour alone (UX-AC2). */
export function VerificationTag({ status }: { status: VerificationStatus }) {
  const [tone, icon] = VERIFY_TONE[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone])}>
      <Icon name={icon} className="size-3.5" />
      {VERIFICATION_LABELS[status]}
    </span>
  );
}

export function DistanceLabel({ km, kind = 'straight' }: { km: string | number | null | undefined; kind?: 'straight' | 'route' | 'estimate' }) {
  if (km == null) return <span className="text-muted">—</span>;
  const label = kind === 'straight' ? STRAIGHT_LINE_LABEL : kind === 'route' ? 'مسافة الطريق — يؤكدها الناقل' : 'تقدير لمسافة الطريق';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1">
      <bdi className="num font-semibold">{Number(km).toLocaleString('en-US')} كم</bdi>
      <span className="text-xs text-muted">— {label}</span>
    </span>
  );
}

export function MoneyText({ m, className }: { m: Money | null | undefined; className?: string }) {
  return <bdi className={cx('num whitespace-nowrap', className)}>{m ? fmtSar(m.display) : '—'}</bdi>;
}

/** Material / transport / fees / total, always separate (UI_UX §1.3). */
export function MoneyBreakdown({ material, transport, fees, total, transportPending, estimated }: { material: Money | null; transport?: Money | null; fees?: Money | null; total?: Money | null; transportPending?: boolean; estimated?: boolean }) {
  return (
    <dl className="divide-y divide-line rounded-lg border border-line bg-white text-base">
      <Row label="قيمة المادة" value={<MoneyText m={material} />} />
      <Row label="النقل" value={transportPending ? <span className="text-muted">بانتظار عروض النقل</span> : <MoneyText m={transport ?? null} />} />
      {fees && fees.amount_halalas > 0 && <Row label="رسوم إضافية" value={<MoneyText m={fees} />} />}
      <Row label={estimated ? 'الإجمالي التقديري' : 'الإجمالي'} value={<MoneyText m={total ?? null} className="text-lg font-bold" />} strong />
    </dl>
  );
}
function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 px-3 py-2.5', strong && 'bg-sand/60')}>
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function useNow(intervalMs = 30_000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setT(Date.now()), intervalMs);
    return () => clearInterval(h);
  }, [intervalMs]);
  return t;
}

/** Countdown in local time with the full date and the "Riyadh time" hint. */
export function DeadlineTimer({ at, label }: { at: string | null | undefined; label?: string }) {
  const t = useNow();
  if (!at) return null;
  const r = remaining(at, t);
  return (
    <div className={cx('inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-1.5 text-sm', r.past ? TONES.danger : r.urgent ? TONES.warning : TONES.info)} title={RIYADH_NOTE}>
      <Icon name="clock" className="size-4" />
      {label && <span className="font-medium">{label}:</span>}
      <span className="font-semibold">{r.past ? r.text : `متبقٍ ${r.text}`}</span>
      <span className="text-xs opacity-80">({fmtDateTime(at)} {RIYADH_NOTE})</span>
    </div>
  );
}

export interface TimelineItem {
  key: string;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  tone?: Tone;
}
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ms-2 border-s-2 border-line">
      {items.map((it) => (
        <li key={it.key} className="mb-4 ms-4">
          <span className={cx('absolute -start-[7px] mt-1.5 size-3 rounded-full border-2 border-paper', it.tone === 'danger' ? 'bg-danger' : it.tone === 'success' ? 'bg-success' : 'bg-copper')} />
          <div className="font-medium">{it.title}</div>
          {it.meta && <div className="text-sm text-muted">{it.meta}</div>}
          {it.body && <div className="mt-1 text-sm">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card border border-line bg-paper p-0 text-charcoal backdrop:bg-charcoal/50"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded p-2 hover:bg-sand" aria-label="إغلاق">
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Critical actions confirm with a summary of their effect (UI_UX §1.3). */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'تأكيد', loading, danger, error }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; children: ReactNode; confirmLabel?: string; loading?: boolean; danger?: boolean; error?: unknown }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </Dialog>
  );
}

// ─── States ──────────────────────────────────────────────────────────────

export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-3', className)} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-card bg-black/5" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-paper/60 px-6 py-10 text-center">
      <Icon name={icon} className="size-10 text-copper" />
      <div className="text-lg font-semibold">{title}</div>
      {text && <p className="max-w-md text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const e = error instanceof ApiError ? error : null;
  const msg = e?.message ?? 'حدث خطأ غير متوقع.';
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {msg}
      {e?.code === 'STATE_CONFLICT' || e?.code === 'INVALID_STATE' ? <span className="block text-xs">تغيرت حالة هذا السجل؛ حدّث الصفحة لرؤية الحالة الجديدة.</span> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.status === 404) return <EmptyState icon="help" title="غير موجود" text="لم نجد هذا السجل، أو أنه لا يخصك." />;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger/5 px-6 py-8 text-center">
      <Icon name="alert" className="size-9 text-danger" />
      <div className="font-semibold">{e?.message ?? 'تعذر تحميل البيانات.'}</div>
      {e?.requestId && (
        <button type="button" className="ltr font-mono text-xs text-muted underline" onClick={() => navigator.clipboard?.writeText(e.requestId!)} title="نسخ رقم الطلب">
          {e.requestId}
        </button>
      )}
      {onRetry && (
        <Button variant="ghost" icon="refresh" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: IconName }) {
  return (
    <div className="rounded-card border border-line bg-paper p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon && <Icon name={icon} className="size-4 text-copper" />}
        {label}
      </div>
      <div className="num mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="flex flex-col border-b border-line/70 pb-2">
          <dt className="text-sm text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'info', children, icon = 'info' }: { tone?: Tone; children: ReactNode; icon?: IconName }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', TONES[tone])}>
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
