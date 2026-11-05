import {
  BUYER_RESPONSIBILITY_AR,
  CARGO_CLASS_LABELS,
  DOC_TYPE_LABELS,
  DOC_TYPES,
  DOC_VISIBILITIES,
  DOC_VISIBILITY_LABELS,
  formatHalalas,
  PHYSICAL_STATE_LABELS,
  PHYSICAL_STATES,
  PLATFORM_DISCLAIMER_AR,
  REGION_CODES,
  REGION_LABELS,
  riyalsToHalalas,
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
  type CargoClass,
  type PhysicalState,
  type RegionCode,
  type VerificationStatus,
} from '@maknaz/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOrg } from '../auth';
import { Icon } from '../components/icons';
import { MapView } from '../components/map';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  cx,
  DistanceLabel,
  EmptyState,
  ErrorNote,
  ErrorState,
  Field,
  Input,
  KeyValue,
  MoneyText,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  StatusChip,
  Textarea,
  VerificationTag,
} from '../components/ui';
import { api, fieldErrorMap } from '../lib/api';
import { fmtTons } from '../lib/format';
import { postAction, useAction, useApi } from '../lib/hooks';
import type { Category, Listing, ListingDetail, Mine, Site, Spec } from '../types';
import { OfferPanel } from './offers';

// ─── Mine: my listings (SCR-MAT-01) ─────────────────────────────────────

function StockBar({ q }: { q: Listing['quantity'] }) {
  const t = Number(q.total) || 1;
  const pct = (v: string) => `${(Number(v) / t) * 100}%`;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-success/25" aria-hidden>
        <span style={{ width: pct(q.sold) }} className="bg-charcoal" />
        <span style={{ width: pct(q.reserved) }} className="bg-copper" />
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted">
        <span>متاح {fmtTons(q.available)}</span>
        <span>محجوز {fmtTons(q.reserved)}</span>
        <span>مباع {fmtTons(q.sold)}</span>
      </div>
    </div>
  );
}

export function MyListingsPage() {
  const { active } = useOrg();
  const q = useApi<{ data: Listing[] }>(['listings', 'own'], '/material-listings?filter[own]=true');
  return (
    <>
      <PageHeader title="موادي" subtitle="المواد التي تعرضها مناجمك." actions={<Link to="/listings/new" className={cx('inline-flex min-h-11 items-center gap-2 rounded-lg bg-copper px-4 font-bold text-charcoal', !active && 'pointer-events-none opacity-50')}><Icon name="plus" />مادة جديدة</Link>} />
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.data.length ? (
        <EmptyState icon="layers" title="لم تضف أي مادة بعد" text="أضف مادة بكميتها وسعرها ومواصفاتها، ثم انشرها لتراها المصانع." action={<Link to="/listings/new" className="font-semibold text-copper-dark underline">أضف أول مادة</Link>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.data.map((l) => (
            <Link key={l.id} to={`/listings/${l.id}`} className="block rounded-card border border-line bg-paper p-4 hover:border-copper">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-sm text-muted">{l.mine.name} · {l.category.name_ar}</div>
                </div>
                <StatusChip kind="listing" status={l.status} />
              </div>
              <StockBar q={l.quantity} />
              <div className="mt-2 text-sm">سعر الطلب: <MoneyText m={l.asking_price} /> / طن</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Mine: listing form (SCR-MAT-02, single page instead of a 5-step wizard) ──

interface SpecRow { property_name: string; value: string; unit: string; verification_status: VerificationStatus; document_id: string }
const emptySpec = (): SpecRow => ({ property_name: '', value: '', unit: '', verification_status: 'DECLARED', document_id: '' });

function specPayload(rows: SpecRow[]) {
  return rows
    .filter((r) => r.property_name.trim())
    .map((r) => {
      const numeric = r.value.trim() !== '' && !Number.isNaN(Number(r.value)) ? Number(r.value) : null;
      return {
        property_name: r.property_name.trim(),
        value_numeric: r.verification_status === 'UNKNOWN' ? null : numeric,
        value_text: r.verification_status === 'UNKNOWN' || numeric !== null ? null : r.value.trim() || null,
        unit: r.unit.trim() || null,
        verification_status: r.verification_status,
        document_id: r.document_id || null,
      };
    });
}

export function SpecEditor({ rows, setRows, labDocs }: { rows: SpecRow[]; setRows: (r: SpecRow[]) => void; labDocs: { id: string; title: string }[] }) {
  const upd = (i: number, patch: Partial<SpecRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1.4fr_1fr_0.6fr_1.2fr_auto]">
          <Input aria-label="الخاصية" placeholder="الخاصية (مثال: نسبة الحديد)" value={r.property_name} onChange={(e) => upd(i, { property_name: e.target.value })} />
          <Input aria-label="القيمة" placeholder="القيمة" disabled={r.verification_status === 'UNKNOWN'} value={r.verification_status === 'UNKNOWN' ? '' : r.value} onChange={(e) => upd(i, { value: e.target.value })} />
          <Input aria-label="الوحدة" placeholder="الوحدة" dir="ltr" value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })} />
          <div className="space-y-2">
            <Select aria-label="حالة التحقق" value={r.verification_status} onChange={(e) => upd(i, { verification_status: e.target.value as VerificationStatus })}>
              {VERIFICATION_STATUSES.map((v) => (
                <option key={v} value={v} disabled={v === 'LAB_REPORTED' && labDocs.length === 0}>
                  {VERIFICATION_LABELS[v]}{v === 'LAB_REPORTED' && labDocs.length === 0 ? ' (ارفع تقريرًا أولًا)' : ''}
                </option>
              ))}
            </Select>
            {r.verification_status === 'LAB_REPORTED' && (
              <Select aria-label="التقرير الداعم" value={r.document_id} onChange={(e) => upd(i, { document_id: e.target.value })}>
                <option value="">اختر التقرير الداعم</option>
                {labDocs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </Select>
            )}
          </div>
          <button type="button" className="self-start rounded p-2 text-danger hover:bg-danger/10" aria-label="حذف الخاصية" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" icon="plus" onClick={() => setRows([...rows, emptySpec()])}>إضافة خاصية</Button>
    </div>
  );
}

export function ListingFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const editing = !!id;
  const mines = useApi<{ data: Mine[] }>(['mines'], '/mines?filter[org]=mine');
  const cats = useApi<{ data: Category[] }>(['categories'], '/material-categories');
  const existing = useApi<ListingDetail>(['listing', id], editing ? `/material-listings/${id}` : null);
  const [f, setF] = useState<Record<string, string | boolean> | null>(null);
  const [specs, setSpecs] = useState<SpecRow[]>([emptySpec()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const form = f ?? (editing && existing.data
    ? {
        mine_id: existing.data.mine.id,
        category_id: existing.data.category.id,
        title: existing.data.title,
        description: existing.data.description ?? '',
        physical_state: existing.data.physical_state,
        total_quantity: existing.data.quantity.total,
        price: formatHalalas(existing.data.asking_price.amount_halalas).replace(/,/g, ''),
        is_negotiable: existing.data.is_negotiable,
        loading_conditions: existing.data.loading_conditions,
      }
    : { mine_id: '', category_id: '', title: '', description: '', physical_state: 'GRANULAR', total_quantity: '', price: '', is_negotiable: true, loading_conditions: '' });
  const set = (k: string, v: string | boolean) => setF({ ...form, [k]: v });
  const category = cats.data?.data.find((c) => c.id === form.category_id);

  if (mines.isLoading || cats.isLoading || (editing && existing.isLoading)) return <Skeleton />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const halalas = riyalsToHalalas(String(form.price));
    if (!form.mine_id) errs.mine_id = 'اختر المنجم';
    if (!form.category_id) errs.category_id = 'اختر الفئة';
    if (String(form.title).trim().length < 3) errs.title = 'العنوان قصير جدًا';
    if (!/^\d{1,9}(\.\d{1,3})?$/.test(String(form.total_quantity)) || Number(form.total_quantity) <= 0) errs.total_quantity = 'أدخل كمية أكبر من صفر (حتى 3 خانات عشرية)';
    if (!halalas) errs.asking_price_halalas = 'أدخل سعرًا صحيحًا أكبر من صفر';
    if (String(form.loading_conditions).trim().length < 3) errs.loading_conditions = 'اكتب شروط التحميل';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        physical_state: form.physical_state,
        asking_price_halalas: halalas,
        is_negotiable: form.is_negotiable,
        loading_conditions: form.loading_conditions,
      };
      if (editing && existing.data) {
        await api(`/material-listings/${id}`, { method: 'PATCH', body: { ...body, category_id: form.category_id }, ifMatch: existing.data.version });
        if (form.total_quantity !== existing.data.quantity.total) {
          const fresh = await api<ListingDetail>(`/material-listings/${id}`);
          await api(`/material-listings/${id}/quantity`, { method: 'PATCH', body: { total_quantity: form.total_quantity }, ifMatch: fresh.version });
        }
        nav(`/listings/${id}`);
      } else {
        const created = await api<Listing>('/material-listings', {
          method: 'POST',
          body: { ...body, mine_id: form.mine_id, category_id: form.category_id, total_quantity: form.total_quantity, specifications: specPayload(specs).filter((s) => s.verification_status !== 'LAB_REPORTED') },
        });
        nav(`/listings/${created.id}`);
      }
    } catch (err) {
      setError(err);
      setErrors(fieldErrorMap(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={editing ? 'تعديل المادة' : 'مادة جديدة'} subtitle="تُحفظ كمسودة، وتنشرها من صفحة المادة بعد مراجعتها." />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Card title="الأساس">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="المنجم" error={errors.mine_id} required>
              {(fid) => (
                <Select id={fid} value={String(form.mine_id)} disabled={editing} onChange={(e) => set('mine_id', e.target.value)} invalid={!!errors.mine_id}>
                  <option value="">اختر المنجم</option>
                  {mines.data?.data.filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="الفئة" error={errors.category_id} hint={category ? `صنف الحمولة: ${CARGO_CLASS_LABELS[category.cargo_class as CargoClass]}` : undefined} required>
              {(fid) => (
                <Select id={fid} value={String(form.category_id)} onChange={(e) => set('category_id', e.target.value)} invalid={!!errors.category_id}>
                  <option value="">اختر الفئة</option>
                  {cats.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </Select>
              )}
            </Field>
            <Field label="العنوان" error={errors.title} required>
              {(fid) => <Input id={fid} value={String(form.title)} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />}
            </Field>
            <Field label="الحالة الفيزيائية" required>
              {(fid) => (
                <Select id={fid} value={String(form.physical_state)} onChange={(e) => set('physical_state', e.target.value)}>
                  {PHYSICAL_STATES.map((p) => <option key={p} value={p}>{PHYSICAL_STATE_LABELS[p]}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="mt-4">
            <Field label="الوصف">{(fid) => <Textarea id={fid} value={String(form.description)} onChange={(e) => set('description', e.target.value)} />}</Field>
          </div>
        </Card>
        <Card title="الكمية والسعر">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الكمية الكلية (طن)" error={errors.total_quantity} hint={editing && existing.data ? `لا تقل عن المحجوز والمباع: ${fmtTons(Number(existing.data.quantity.reserved) + Number(existing.data.quantity.sold))}` : undefined} required>
              {(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={String(form.total_quantity)} onChange={(e) => set('total_quantity', e.target.value)} invalid={!!errors.total_quantity} />}
            </Field>
            <Field label="سعر الطلب للطن (ر.س)" error={errors.asking_price_halalas} required>
              {(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={String(form.price)} onChange={(e) => set('price', e.target.value)} invalid={!!errors.asking_price_halalas} />}
            </Field>
          </div>
          <Checkbox label="السعر قابل للتفاوض" checked={!!form.is_negotiable} onChange={(v) => set('is_negotiable', v)} />
          <Field label="شروط التحميل" error={errors.loading_conditions} required>
            {(fid) => <Textarea id={fid} value={String(form.loading_conditions)} onChange={(e) => set('loading_conditions', e.target.value)} invalid={!!errors.loading_conditions} />}
          </Field>
        </Card>
        {!editing && (
          <Card title="المواصفات">
            <p className="mb-3 text-sm text-muted">لكل قيمة حالة تحقق. «مدعوم بتقرير» يتاح بعد رفع تقرير المختبر من صفحة المادة.</p>
            <SpecEditor rows={specs} setRows={setSpecs} labDocs={[]} />
          </Card>
        )}
        <Notice tone="muted">{PLATFORM_DISCLAIMER_AR}</Notice>
        {error ? <ErrorNote error={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>رجوع</Button>
          <Button type="submit" loading={busy}>{editing ? 'حفظ التعديلات' : 'حفظ كمسودة'}</Button>
        </div>
      </form>
    </>
  );
}

// ─── Factory: search (SCR-SRCH-01) ──────────────────────────────────────

export function SearchPage() {
  const cats = useApi<{ data: Category[] }>(['categories'], '/material-categories');
  const sites = useApi<{ data: Site[] }>(['sites'], '/factory-sites');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ category: '', region: '', min_available: '', max_price: '', lab: false, site: '', sort: 'distance' });
  const [view, setView] = useState<'list' | 'map'>('list');
  const siteId = filters.site || sites.data?.data[0]?.id || '';
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (filters.category) p.set('filter[category]', filters.category);
    if (filters.region) p.set('filter[region]', filters.region);
    if (filters.min_available) p.set('filter[min_available]', filters.min_available);
    const maxH = filters.max_price ? riyalsToHalalas(filters.max_price) : null;
    if (maxH) p.set('filter[max_price_halalas]', String(maxH));
    if (filters.lab) p.set('filter[has_lab_report]', 'true');
    if (siteId) p.set('from_site_id', siteId);
    p.set('sort', siteId || filters.sort !== 'distance' ? filters.sort : '-published_at');
    return p.toString();
  }, [q, filters, siteId]);
  const res = useApi<{ data: Listing[] }>(['search', params], `/material-listings?${params}`);
  const site = sites.data?.data.find((s) => s.id === siteId);

  return (
    <>
      <PageHeader title="ابحث عن مواد" subtitle="المسافات مباشرة تقريبية من موقع مصنعك المختار." />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Input aria-label="بحث" placeholder="ابحث بالاسم أو الوصف أو الفئة" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="الموقع المرجعي" value={siteId} onChange={(e) => setFilters({ ...filters, site: e.target.value })}>
            {sites.data?.data.map((s) => <option key={s.id} value={s.id}>من: {s.name}</option>)}
            {!sites.data?.data.length && <option value="">لا توجد مواقع للمصنع</option>}
          </Select>
          <Select aria-label="الترتيب" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="distance">الأقرب</option>
            <option value="asking_price_halalas">الأقل سعرًا</option>
            <option value="-available_quantity">الأكثر كمية</option>
            <option value="-published_at">الأحدث</option>
          </Select>
          <Select aria-label="الفئة" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">كل الفئات</option>
            {cats.data?.data.map((c) => <option key={c.id} value={c.code}>{c.name_ar}</option>)}
          </Select>
          <Select aria-label="المنطقة" value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })}>
            <option value="">كل المناطق</option>
            {REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
          </Select>
          <Input aria-label="أقل كمية متاحة" placeholder="أقل كمية متاحة (طن)" dir="ltr" inputMode="decimal" value={filters.min_available} onChange={(e) => setFilters({ ...filters, min_available: e.target.value })} />
          <Input aria-label="أعلى سعر للطن" placeholder="أعلى سعر للطن (ر.س)" dir="ltr" inputMode="decimal" value={filters.max_price} onChange={(e) => setFilters({ ...filters, max_price: e.target.value })} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Checkbox label="يحتوي تقرير مختبر" checked={filters.lab} onChange={(v) => setFilters({ ...filters, lab: v })} />
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {(['list', 'map'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={cx('min-h-9 rounded px-3 text-sm', view === v ? 'bg-charcoal text-paper' : '')}>
                {v === 'list' ? 'قائمة' : 'خريطة'}
              </button>
            ))}
          </div>
        </div>
      </Card>
      {res.isLoading ? <Skeleton /> : res.error ? <ErrorState error={res.error} onRetry={() => void res.refetch()} /> : !res.data?.data.length ? (
        <EmptyState icon="search" title="لا توجد مواد مطابقة" text="جرّب توسيع المنطقة أو نطاق الكمية." />
      ) : view === 'map' ? (
        <MapView
          height={460}
          points={[
            ...(site ? [{ id: 'site', lat: site.lat, lng: site.lng, label: `مصنعك: ${site.name}`, kind: 'factory' as const }] : []),
            ...res.data.data.map((l) => ({ id: l.id, lat: l.mine.lat, lng: l.mine.lng, label: `${l.title} — ${l.mine.name}`, kind: 'mine' as const })),
          ]}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {res.data.data.map((l) => (
            <Link key={l.id} to={`/listings/${l.id}${siteId ? `?site=${siteId}` : ''}`} className="block rounded-card border border-line bg-paper p-4 hover:border-copper">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{l.title}</div>
                <Badge tone="info">{l.category.name_ar}</Badge>
              </div>
              <div className="mt-1 text-sm text-muted">{l.mine.name} · {REGION_LABELS[l.mine.region_code as RegionCode]}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>المتاح: <strong className="num">{fmtTons(l.quantity.available)}</strong></div>
                <div>سعر الطلب: <MoneyText m={l.asking_price} className="font-semibold" />/طن</div>
                <div className="col-span-2"><DistanceLabel km={l.distance_from_site?.straight_line_km} /></div>
                <div className="col-span-2 text-xs text-muted">مواصفات مدعومة بتقارير: {l.lab_reported_specs}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Listing detail (SCR-SRCH-02, also the mine's management page) ──────

export function ListingDetailPage() {
  const { id } = useParams();
  const { role, active } = useOrg();
  const siteParam = new URLSearchParams(window.location.search).get('site');
  const q = useApi<ListingDetail>(['listing', id], `/material-listings/${id}${siteParam ? `?from_site_id=${siteParam}` : ''}`);
  const [offerOpen, setOfferOpen] = useState(false);
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const l = q.data;

  return (
    <>
      <PageHeader
        title={l.title}
        subtitle={`${l.mine.name} · ${l.category.name_ar} · ${PHYSICAL_STATE_LABELS[l.physical_state as PhysicalState]}`}
        actions={
          role === 'FACTORY' ? (
            l.my_open_offer ? (
              <Link to={`/offers/${l.my_open_offer.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold">لديك عرض مفتوح — عرض التفاصيل</Link>
            ) : (
              <Button onClick={() => setOfferOpen(true)} disabled={!active} title={!active ? 'جهتك ليست نشطة بعد' : undefined}>تقديم عرض شراء</Button>
            )
          ) : l.is_owner ? (
            <StatusChip kind="listing" status={l.status} />
          ) : null
        }
      />
      {l.is_owner && <OwnerControls l={l} />}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="الملخص">
            <KeyValue
              items={[
                ['الكمية المتاحة الآن', <span className="num">{fmtTons(l.quantity.available)}</span>],
                ['سعر الطلب', <><MoneyText m={l.asking_price} /> / طن</>],
                ['قابلية التفاوض', l.is_negotiable ? 'قابل للتفاوض' : 'سعر ثابت'],
                ['صنف الحمولة', CARGO_CLASS_LABELS[l.category.cargo_class as CargoClass]],
                ...(l.distance_from_site ? [['المسافة من مصنعك', <DistanceLabel km={l.distance_from_site.straight_line_km} />] as [string, React.ReactNode]] : []),
                ['شروط التحميل', l.loading_conditions],
              ]}
            />
            {l.description && <p className="mt-3 text-sm leading-7">{l.description}</p>}
          </Card>
          <Card title="المواصفات">
            {l.specifications.length === 0 ? (
              <p className="text-muted">لم تُضف مواصفات.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line text-start">
                    <th className="py-2 text-start font-medium">الخاصية</th>
                    <th className="py-2 text-start font-medium">القيمة</th>
                    <th className="py-2 text-start font-medium">التحقق</th>
                  </tr>
                </thead>
                <tbody>
                  {l.specifications.map((s: Spec) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="py-2">{s.property_name}</td>
                      <td className="py-2"><bdi className="num">{s.value_numeric ?? s.value_text ?? '—'}</bdi> {s.unit && <bdi className="text-muted">{s.unit}</bdi>}</td>
                      <td className="py-2"><VerificationTag status={s.verification_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted">«مدعوم بتقرير» يعني أن المنجم أرفق تقريرًا؛ {PLATFORM_DISCLAIMER_AR}</p>
          </Card>
          <Documents l={l} />
        </div>
        <div className="space-y-5">
          <Card title="الموقع">
            <MapView points={[{ id: 'm', lat: l.mine.lat, lng: l.mine.lng, label: l.mine.name, kind: 'mine' }]} height={240} />
            <div className="mt-2 text-sm">{l.mine.organization_name} · {REGION_LABELS[l.mine.region_code as RegionCode]}</div>
          </Card>
          <Notice tone="warning" icon="alert">{BUYER_RESPONSIBILITY_AR}</Notice>
        </div>
      </div>
      {role === 'FACTORY' && <OfferPanel open={offerOpen} onClose={() => setOfferOpen(false)} listing={l} />}
    </>
  );
}

function OwnerControls({ l }: { l: ListingDetail }) {
  const inv = [['listing', l.id], ['listings']];
  const publish = useAction(postAction(`/material-listings/${l.id}/publish`), { success: 'نُشرت المادة', invalidate: inv });
  const deactivate = useAction(postAction(`/material-listings/${l.id}/deactivate`), { success: 'أُوقفت المادة', invalidate: inv });
  const archive = useAction(postAction(`/material-listings/${l.id}/archive`), { success: 'أُرشفت المادة', invalidate: inv });
  const [confirm, setConfirm] = useState<null | 'deactivate' | 'archive'>(null);
  const [specOpen, setSpecOpen] = useState(false);
  const err = publish.error ?? deactivate.error ?? archive.error;
  return (
    <Card className="mb-5" title="إدارة المادة">
      <div className="flex flex-wrap gap-2">
        {['DRAFT', 'INACTIVE'].includes(l.status) && <Button onClick={() => publish.mutate({})} loading={publish.isPending} icon="upload">نشر</Button>}
        {l.status === 'ACTIVE' && <Button variant="ghost" onClick={() => setConfirm('deactivate')}>إيقاف مؤقت</Button>}
        {l.status !== 'ARCHIVED' && <Link to={`/listings/${l.id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4"><Icon name="pen" />تعديل البيانات والكمية</Link>}
        {l.status !== 'ARCHIVED' && <Button variant="ghost" icon="list" onClick={() => setSpecOpen((v) => !v)}>تعديل المواصفات</Button>}
        {l.status !== 'ARCHIVED' && !l.active_deals && <Button variant="ghost" onClick={() => setConfirm('archive')}>أرشفة</Button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
        <span>عروض شراء مفتوحة: {l.open_offers ?? 0}</span>
        <span>صفقات قائمة: {l.active_deals ?? 0}</span>
        <span>محجوز: {fmtTons(l.quantity.reserved)} · مباع: {fmtTons(l.quantity.sold)}</span>
      </div>
      {err ? <div className="mt-3"><ErrorNote error={err} /></div> : null}
      {specOpen && <SpecReplace l={l} onDone={() => setSpecOpen(false)} />}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'archive' ? 'أرشفة المادة' : 'إيقاف المادة'}
        loading={deactivate.isPending || archive.isPending}
        onConfirm={() => (confirm === 'archive' ? archive : deactivate).mutate({}, { onSuccess: () => setConfirm(null) })}
      >
        <p>ستنتهي عروض الشراء المفتوحة على هذه المادة ({l.open_offers ?? 0}). الصفقات القائمة لا تتأثر.</p>
      </ConfirmDialog>
    </Card>
  );
}

function SpecReplace({ l, onDone }: { l: ListingDetail; onDone: () => void }) {
  const [rows, setRows] = useState<SpecRow[]>(
    l.specifications.length
      ? l.specifications.map((s) => ({ property_name: s.property_name, value: s.value_numeric ?? s.value_text ?? '', unit: s.unit ?? '', verification_status: s.verification_status, document_id: s.document_id ?? '' }))
      : [emptySpec()],
  );
  const save = useAction((body: object) => api(`/material-listings/${l.id}/specifications`, { method: 'PUT', body }), { success: 'حُفظت المواصفات', invalidate: [['listing', l.id]], onSuccess: onDone });
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <SpecEditor rows={rows} setRows={setRows} labDocs={l.documents.filter((d) => d.doc_type === 'LAB_REPORT')} />
      {save.error ? <ErrorNote error={save.error} /> : null}
      <Button onClick={() => save.mutate({ specifications: specPayload(rows) })} loading={save.isPending}>حفظ المواصفات</Button>
    </div>
  );
}

function Documents({ l }: { l: ListingDetail }) {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ doc_type: 'LAB_REPORT', title: '', visibility: 'ON_REQUEST', lab_name: '' });
  const upload = useAction(
    async () => {
      const fd = new FormData();
      fd.set('file', file!);
      Object.entries(meta).forEach(([k, v]) => v && fd.set(k, v));
      return api(`/material-listings/${l.id}/documents`, { method: 'POST', form: fd });
    },
    { success: 'رُفعت الوثيقة', invalidate: [['listing', l.id]], onSuccess: () => { setFile(null); setMeta({ ...meta, title: '' }); } },
  );
  const [dlError, setDlError] = useState<unknown>(null);
  async function download(docId: string) {
    setDlError(null);
    try {
      const r = await api<{ url: string }>(`/documents/${docId}/download`);
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      setDlError(e);
    }
  }
  return (
    <Card title="الوثائق">
      {l.documents.length === 0 ? <p className="text-muted">لا توجد وثائق.</p> : (
        <ul className="divide-y divide-line">
          {l.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted">{DOC_TYPE_LABELS[d.doc_type as keyof typeof DOC_TYPE_LABELS]} · {DOC_VISIBILITY_LABELS[d.visibility as keyof typeof DOC_VISIBILITY_LABELS]}</div>
              </div>
              {d.can_download ? (
                <Button variant="ghost" icon="download" onClick={() => void download(d.id)}>تنزيل</Button>
              ) : (
                <span className="text-sm text-muted">تتاح بعد تقديم عرض شراء</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {dlError ? <ErrorNote error={dlError} /> : null}
      {l.is_owner && l.status !== 'ARCHIVED' && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="font-semibold">رفع وثيقة (PDF أو JPG أو PNG حتى 20 ميجابايت)</div>
          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select aria-label="نوع الوثيقة" value={meta.doc_type} onChange={(e) => setMeta({ ...meta, doc_type: e.target.value })}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </Select>
            <Input aria-label="عنوان الوثيقة" placeholder="عنوان الوثيقة" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            <Select aria-label="الإتاحة" value={meta.visibility} onChange={(e) => setMeta({ ...meta, visibility: e.target.value })}>
              {DOC_VISIBILITIES.map((v) => <option key={v} value={v}>{DOC_VISIBILITY_LABELS[v]}</option>)}
            </Select>
            <Input aria-label="اسم المختبر" placeholder="اسم المختبر (اختياري)" value={meta.lab_name} onChange={(e) => setMeta({ ...meta, lab_name: e.target.value })} />
          </div>
          {upload.error ? <ErrorNote error={upload.error} /> : null}
          <Button icon="upload" disabled={!file || meta.title.trim().length < 2} loading={upload.isPending} onClick={() => upload.mutate(undefined)}>رفع</Button>
        </div>
      )}
    </Card>
  );
}
