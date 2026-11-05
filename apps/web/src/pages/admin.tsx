import {
  CARGO_CLASS_LABELS,
  CARGO_CLASSES,
  DEAL_STATUS_LABELS,
  LICENSE_REVIEW_LABELS,
  LICENSE_REVIEW_STATUSES,
  LICENSE_TYPE_LABELS,
  ORG_STATUSES,
  ORG_STATUS_LABELS,
  ORG_TYPE_LABELS,
  REGION_LABELS,
  type AdminOrganizationDto,
  type AuditLogDto,
  type CargoClass,
  type DealStatus,
  type OrganizationDto,
  type PolicyDto,
  type RegionCode,
} from '@maknaz/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { MapView } from '../components/map';
import { Button, Card, ConfirmDialog, cx, EmptyState, ErrorNote, ErrorState, Field, Input, KeyValue, MoneyText, Notice, PageHeader, Select, Skeleton, Stat, StatusChip, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import type { Category } from '../types';

interface Attention {
  deals_by_status: Record<string, number>;
  completed_totals: { deals: number; tons: string; material_value: { amount_halalas: number; currency: 'SAR'; display: string } };
  pending_organizations: number;
  delayed_shipments: { shipment_id: string; deal: { id: string; reference: string }; expected_delivery_at: string | null }[];
  delivered_unconfirmed: { shipment_id: string; deal: { id: string; reference: string }; delivered_at: string | null }[];
  failed_jobs: { id: string; deadline_type: string; entity_id: string; last_error: string | null }[];
  suspended_with_open_deals: { organization: { id: string; name_ar: string }; deals: { id: string; reference: string; status: string }[] }[];
  route_distance_reviews: { quote_id: string; deal_id: string; route_km: string; straight_km: string }[];
}

/** SCR-ADM-03: indicators and the "needs attention" queue. */
export function AdminHomePage() {
  const q = useApi<Attention>(['attention'], '/admin/attention', { refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  const attention = a.delayed_shipments.length + a.delivered_unconfirmed.length + a.failed_jobs.length + a.suspended_with_open_deals.length + a.route_distance_reviews.length;
  return (
    <>
      <PageHeader title="الإشراف على المنصة" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="shield" label="جهات بانتظار الاعتماد" value={a.pending_organizations} />
        <Stat icon="alert" label="تحتاج معالجة" value={attention} />
        <Stat icon="check" label="صفقات مكتملة" value={a.completed_totals.deals} hint={`${a.completed_totals.tons} طن`} />
        <Stat icon="chart" label="قيمة المواد المكتملة" value={<MoneyText m={a.completed_totals.material_value} />} hint="محاكاة" />
      </div>
      {a.pending_organizations > 0 && <div className="mt-4"><Notice tone="warning">لديك {a.pending_organizations} جهة بانتظار الاعتماد. <Link to="/admin/organizations" className="underline">راجعها</Link></Notice></div>}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="الصفقات حسب الحالة">
          <ul className="space-y-2">{Object.entries(DEAL_STATUS_LABELS).map(([k, l]) => <li key={k} className="flex justify-between"><span>{l}</span><strong className="num">{a.deals_by_status[k] ?? 0}</strong></li>)}</ul>
        </Card>
        <Card title="تحتاج معالجة">
          {attention === 0 ? <p className="text-muted">لا شيء يحتاج معالجة.</p> : (
            <ul className="space-y-2 text-sm">
              {a.delayed_shipments.map((s) => <li key={s.shipment_id}>شحنة متأخرة: <Link className="underline" to={`/deals/${s.deal.id}`}>{s.deal.reference}</Link></li>)}
              {a.delivered_unconfirmed.map((s) => <li key={s.shipment_id}>تسليم غير مؤكد منذ أكثر من 72 ساعة: <Link className="underline" to={`/deals/${s.deal.id}`}>{s.deal.reference}</Link></li>)}
              {a.suspended_with_open_deals.map((s) => <li key={s.organization.id}>جهة معلقة لها صفقات قائمة: {s.organization.name_ar} ({s.deals.map((d) => d.reference).join('، ')})</li>)}
              {a.route_distance_reviews.map((r) => <li key={r.quote_id}>مسافة طريق تتجاوز 3× المباشرة ({r.route_km} مقابل {r.straight_km} كم): <Link className="underline" to={`/deals/${r.deal_id}`}>الصفقة</Link></li>)}
              {a.failed_jobs.map((j) => <li key={j.id} className="text-danger">مهمة فاشلة {j.deadline_type}: {j.last_error}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export function AdminOrganizationsPage() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const q = useApi<{ data: OrganizationDto[] }>(['admin-orgs', status], `/admin/organizations${status ? `?filter[status]=${status}` : ''}`);
  return (
    <>
      <PageHeader title="الجهات" />
      <div className="mb-4 flex flex-wrap gap-2">
        {['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED', ''].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={cx('min-h-10 rounded-lg px-4', status === s ? 'bg-charcoal text-paper' : 'border border-line')}>{s ? ORG_STATUS_LABELS[s as keyof typeof ORG_STATUS_LABELS] : 'الكل'}</button>)}
      </div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.data.length ? <EmptyState icon="shield" title="لا توجد جهات بهذه الحالة" /> : (
        <div className="overflow-hidden rounded-card border border-line bg-paper">
          <ul className="divide-y divide-line">
            {q.data.data.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/organizations/${o.id}`} className="grid gap-1 p-3 hover:bg-sand/50 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-center">
                  <span className="font-semibold">{o.legal_name_ar}</span>
                  <span className="text-sm">{ORG_TYPE_LABELS[o.type]}</span>
                  <span className="text-sm text-muted">سجل <bdi className="ltr">{o.commercial_registration_no}</bdi> · {fmtDate(o.created_at)}</span>
                  <StatusChip kind="org" status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

type SiteRow = { kind: string; id: string; name: string; lat: number; lng: number; region_code: string };

export function AdminOrganizationPage() {
  const { id } = useParams();
  const q = useApi<AdminOrganizationDto & { sites: SiteRow[] }>(['admin-org', id], `/admin/organizations/${id}`);
  const [dialog, setDialog] = useState<null | 'approve' | 'reject' | 'suspend'>(null);
  const [reason, setReason] = useState('');
  const inv = [['admin-org', id], ['admin-orgs'], ['attention']];
  const m = useAction((b: { kind: string; reason?: string }) => api(`/admin/organizations/${id}/${b.kind}`, { method: 'POST', body: b.reason ? { reason: b.reason } : {} }), { success: 'حُدّثت حالة الجهة', invalidate: inv, onSuccess: () => { setDialog(null); setReason(''); } });
  const review = useAction((b: { lid: string; review_status: string }) => api(`/admin/licenses/${b.lid}`, { method: 'PATCH', body: { review_status: b.review_status } }), { success: 'حُفظت المراجعة', invalidate: inv });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const o = q.data;
  return (
    <>
      <PageHeader title={o.legal_name_ar} subtitle={ORG_TYPE_LABELS[o.type]} actions={<StatusChip kind="org" status={o.status} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        {['PENDING_REVIEW', 'SUSPENDED'].includes(o.status) && <Button onClick={() => setDialog('approve')}>اعتماد</Button>}
        {o.status === 'PENDING_REVIEW' && <Button variant="danger" onClick={() => setDialog('reject')}>رفض</Button>}
        {o.status === 'ACTIVE' && <Button variant="danger" onClick={() => setDialog('suspend')}>تعليق</Button>}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="البيانات">
          <KeyValue items={[
            ['السجل التجاري', <bdi className="ltr">{o.commercial_registration_no}</bdi>],
            ['المدينة', `${o.city} — ${REGION_LABELS[o.region_code]}`],
            ['البريد', <bdi className="ltr">{o.contact_email}</bdi>],
            ['الهاتف', <bdi className="ltr">{o.contact_phone}</bdi>],
            ['الأعضاء', o.members.map((x) => x.full_name).join('، ')],
            ...(o.status_reason ? [['السبب', o.status_reason] as [string, string]] : []),
          ]} />
        </Card>
        <Card title="المواقع">
          {o.sites.length ? <MapView height={220} points={o.sites.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: s.name, kind: s.kind === 'MINE' ? 'mine' : s.kind === 'FACTORY_SITE' ? 'factory' : 'carrier' }))} /> : <p className="text-muted">لا توجد مواقع.</p>}
          <ul className="mt-2 text-sm">{o.sites.map((s) => <li key={s.id}>{s.name} · {REGION_LABELS[s.region_code as RegionCode]}</li>)}</ul>
        </Card>
        {o.licenses.length > 0 && (
          <Card title="التراخيص المصرّح بها" className="lg:col-span-2">
            <ul className="divide-y divide-line">
              {o.licenses.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{LICENSE_TYPE_LABELS[l.license_type]} · <bdi className="ltr">{l.license_number}</bdi> · {l.issuing_authority}</span>
                  <Select aria-label="حالة المراجعة" className="w-auto" value={l.review_status} onChange={(e) => review.mutate({ lid: l.id, review_status: e.target.value })}>
                    {LICENSE_REVIEW_STATUSES.map((s) => <option key={s} value={s}>{LICENSE_REVIEW_LABELS[s]}</option>)}
                  </Select>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <ConfirmDialog open={dialog !== null} onClose={() => setDialog(null)} danger={dialog !== 'approve'} title={dialog === 'approve' ? 'اعتماد الجهة' : dialog === 'reject' ? 'رفض الجهة' : 'تعليق الجهة'} loading={m.isPending} error={m.error}
        onConfirm={() => m.mutate({ kind: dialog!, reason: dialog === 'approve' ? undefined : reason })}>
        {dialog === 'approve' ? <p>ستتمكن الجهة من النشر والتفاوض والدفع.</p> : (
          <>
            {dialog === 'suspend' && <Notice tone="warning">التعليق لا يلغي الصفقات القائمة تلقائيًا؛ تظهر في «تحتاج معالجة».</Notice>}
            <Field label="السبب (إلزامي)" required>{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState({ entity_type: '', entity_id: '', action: '' });
  const [cursor, setCursor] = useState<string | null>(null);
  const p = new URLSearchParams();
  if (filters.entity_type) p.set('filter[entity_type]', filters.entity_type);
  if (/^[0-9a-f-]{36}$/i.test(filters.entity_id)) p.set('filter[entity_id]', filters.entity_id);
  if (filters.action) p.set('filter[action]', filters.action);
  if (cursor) p.set('page[cursor]', cursor);
  const q = useApi<{ data: AuditLogDto[]; page: { next_cursor: string | null } }>(['audit', p.toString()], `/admin/audit-logs?${p}`);
  return (
    <>
      <PageHeader title="سجل التدقيق" subtitle="سجل إلحاقي لا يُعدل ولا يُحذف." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select aria-label="نوع الكيان" value={filters.entity_type} onChange={(e) => { setCursor(null); setFilters({ ...filters, entity_type: e.target.value }); }}>
            <option value="">كل الكيانات</option>
            {['ORGANIZATION', 'LISTING', 'OFFER', 'DEAL', 'SHIPMENT', 'INVOICE', 'DOCUMENT', 'PRICING_RULE', 'USER'].map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input aria-label="معرف الكيان" dir="ltr" placeholder="entity id" value={filters.entity_id} onChange={(e) => { setCursor(null); setFilters({ ...filters, entity_id: e.target.value }); }} />
          <Input aria-label="الإجراء" dir="ltr" placeholder="ACTION" value={filters.action} onChange={(e) => { setCursor(null); setFilters({ ...filters, action: e.target.value.toUpperCase() }); }} />
        </div>
      </Card>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.data.length ? <EmptyState icon="doc" title="لا توجد سجلات" /> : (
        <div className="space-y-2">
          {q.data.data.map((l) => (
            <details key={l.id} className="rounded-lg border border-line bg-paper p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span><bdi className="ltr font-mono text-sm">{l.action}</bdi> · {l.entity_type}</span>
                <span className="text-sm text-muted">{l.actor_type === 'SYSTEM' ? 'النظام' : l.actor_user_name ?? '—'} · {fmtDateTime(l.occurred_at)}</span>
              </summary>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2" dir="ltr">
                <pre className="overflow-x-auto rounded bg-sand/60 p-2">{JSON.stringify(l.before, null, 2) ?? '—'}</pre>
                <pre className="overflow-x-auto rounded bg-sand/60 p-2">{JSON.stringify(l.after, null, 2) ?? '—'}</pre>
              </div>
              <div className="mt-1 text-xs text-muted ltr">entity {l.entity_id} · request {l.request_id ?? '—'}</div>
            </details>
          ))}
          {q.data.page.next_cursor && <Button variant="ghost" onClick={() => setCursor(q.data!.page.next_cursor)}>الأقدم</Button>}
        </div>
      )}
    </>
  );
}

export function CategoriesPage() {
  const q = useApi<{ data: Category[] }>(['admin-cats'], '/admin/material-categories');
  const [f, setF] = useState({ code: '', name_ar: '', name_en: '', cargo_class: 'BULK_SOLID' });
  const add = useAction((b: object) => api('/admin/material-categories', { method: 'POST', body: b }), { success: 'أُضيفت الفئة', invalidate: [['admin-cats'], ['categories']], onSuccess: () => setF({ code: '', name_ar: '', name_en: '', cargo_class: 'BULK_SOLID' }) });
  const toggle = useAction((b: { id: string; is_active: boolean }) => api(`/admin/material-categories/${b.id}`, { method: 'PATCH', body: { is_active: b.is_active } }), { success: 'حُدّثت الفئة', invalidate: [['admin-cats'], ['categories']] });
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader title="فئات المواد" />
      <Card>
        <ul className="divide-y divide-line">
          {q.data?.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{c.name_ar} · <bdi className="ltr text-sm text-muted">{c.code}</bdi> · {CARGO_CLASS_LABELS[c.cargo_class as CargoClass]}</span>
              <Button variant="ghost" onClick={() => toggle.mutate({ id: c.id, is_active: !c.is_active })}>{c.is_active ? 'إيقاف' : 'تفعيل'}</Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Input aria-label="الرمز" dir="ltr" placeholder="CODE" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input aria-label="الاسم العربي" placeholder="الاسم العربي" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
          <Input aria-label="الاسم الإنجليزي" dir="ltr" placeholder="English name" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          <Select aria-label="صنف الحمولة" value={f.cargo_class} onChange={(e) => setF({ ...f, cargo_class: e.target.value })}>{CARGO_CLASSES.map((c) => <option key={c} value={c}>{CARGO_CLASS_LABELS[c]}</option>)}</Select>
        </div>
        {add.error ? <ErrorNote error={add.error} /> : null}
        <Button className="mt-3" icon="plus" loading={add.isPending} onClick={() => add.mutate(f)}>إضافة فئة</Button>
      </Card>
    </>
  );
}

const POLICY_LABELS: Record<string, string> = {
  carrier_confirmation_window_hours: 'مهلة تأكيد الناقل (ساعة)',
  carrier_retry_window_hours: 'فترة إعادة المحاولة (ساعة)',
  payment_window_hours: 'مهلة الدفع (ساعة)',
  payment_reminder_before_hours: 'تذكير الدفع قبل المهلة (ساعة)',
  pickup_grace_period_hours: 'السماح بعد موعد الاستلام (ساعة)',
  max_shipment_extensions: 'أقصى عدد للتمديد',
  max_extension_hours: 'أقصى مدة للتمديد (ساعة)',
  auto_cancellation_enabled: 'الإلغاء التلقائي مفعّل',
  offer_round_validity_hours: 'صلاحية جولة التفاوض (ساعة)',
  carrier_reconfirm_window_hours: 'مهلة إعادة تأكيد الناقل (ساعة)',
  reassignment_window_hours: 'مهلة إعادة الإسناد (ساعة)',
  delivery_grace_period_hours: 'السماح بعد الوصول المتوقع (ساعة)',
  delivered_unconfirmed_alert_hours: 'تنبيه التسليم غير المؤكد (ساعة)',
  min_loading_lead_hours: 'أقل مدة قبل بداية نافذة التحميل (ساعة)',
};

export function PolicyPage() {
  const q = useApi<PolicyDto>(['policy'], '/policies/current');
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader title="السياسة الزمنية السارية" subtitle={`الإصدار ${q.data.version_no} · ساري منذ ${fmtDate(q.data.effective_from)}`} />
      <Notice tone="muted">التعديل غير متاح في هذا الإصدار؛ يُضاف إصدار جديد عبر ترحيل بيانات (BR-075).</Notice>
      <Card className="mt-4">
        <KeyValue items={Object.entries(q.data.values).filter(([k]) => POLICY_LABELS[k]).map(([k, v]) => [POLICY_LABELS[k], typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : String(v)])} />
      </Card>
    </>
  );
}

export const DEAL_LABEL = (s: string) => DEAL_STATUS_LABELS[s as DealStatus] ?? s;
export { ORG_STATUSES };
