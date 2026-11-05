import {
  CARGO_CLASS_LABELS,
  CARGO_CLASSES,
  formatHalalas,
  LOCATION_KIND_LABELS,
  LOCATION_KINDS,
  PRICING_MODEL_LABELS,
  PRICING_MODELS,
  PRICING_VERSION_STATUS_LABELS,
  REGION_CODES,
  REGION_LABELS,
  riyalsToHalalas,
  VEHICLE_TYPE_LABELS,
  type CargoClass,
  type PricingModel,
  type RegionCode,
  type VehicleType,
} from '@maknaz/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useOrg } from '../auth';
import { LocationPicker, MapView } from '../components/map';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  cx,
  DeadlineTimer,
  Dialog,
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
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { fmtDateTime, fmtTons, fromRiyadhInput, RIYADH_NOTE, toRiyadhInput } from '../lib/format';
import { postAction, useAction, useApi } from '../lib/hooks';
import type { Opportunity, PriceLine } from '../types';

interface Service { id: string; name: string; mode_code: string; vehicle_type_code: VehicleType; supported_cargo_classes: CargoClass[]; payload_tons_per_vehicle: string; vehicles_available: number; min_shipment_tons: string; max_shipment_tons: string; includes_loading: boolean; includes_unloading: boolean; is_active: boolean }
interface Version { id: string; version_no: number; pricing_model: PricingModel; rate_per_km: string | null; rate_per_ton: string | null; rate_per_ton_km: string | null; fixed_route_price: { display: string } | null; route_origin_region: string | null; route_destination_region: string | null; minimum_charge: { display: string; amount_halalas: number }; loading_fee: { amount_halalas: number }; status: string; valid_from: string }
interface Rule { id: string; name: string; service: Service; active_version_id: string | null; versions: Version[] }
interface Location { id: string; name: string; location_kind: string; region_code: string; lat: number; lng: number; is_active: boolean }

/** SCR-CAR-01..03 on one page with tabs (UX simplification). */
export function CarrierSetupPage() {
  const [tab, setTab] = useState<'locations' | 'services' | 'pricing'>('services');
  const tabs = [['services', 'الخدمات والأسطول'], ['pricing', 'التسعير'], ['locations', 'المواقع ومناطق الخدمة']] as const;
  return (
    <>
      <PageHeader title="الأسطول والتسعير" subtitle="ثلاث خطوات لتظهر لك فرص الشحن: موقع ومنطقة خدمة، خدمة، تسعير ساري." />
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={cx('min-h-10 rounded-lg px-4', tab === k ? 'bg-charcoal text-paper' : 'border border-line')}>{l}</button>)}
      </div>
      {tab === 'locations' && <LocationsTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'pricing' && <PricingTab />}
    </>
  );
}

function LocationsTab() {
  const locs = useApi<{ data: Location[] }>(['locations'], '/carrier/operating-locations');
  const areas = useApi<{ data: { region_code: string }[] }>(['areas'], '/carrier/service-areas');
  const [sel, setSel] = useState<string[] | null>(null);
  const [form, setForm] = useState<{ name: string; location_kind: string; region_code: string; lat: number | ''; lng: number | '' } | null>(null);
  const saveAreas = useAction((body: object) => api('/carrier/service-areas', { method: 'PUT', body }), { success: 'حُفظت مناطق الخدمة', invalidate: [['areas'], ['opportunities']] });
  const addLoc = useAction((body: object) => api('/carrier/operating-locations', { method: 'POST', body }), { success: 'أُضيف الموقع', invalidate: [['locations']], onSuccess: () => setForm(null) });
  const current = sel ?? (areas.data?.data.map((a) => a.region_code) ?? []);
  if (locs.isLoading || areas.isLoading) return <Skeleton />;
  return (
    <div className="space-y-5">
      <Card title="المواقع التشغيلية" action={<Button icon="plus" variant="ghost" onClick={() => setForm({ name: '', location_kind: 'FLEET_YARD', region_code: '', lat: '', lng: '' })}>موقع جديد</Button>}>
        <Notice>استخدم موقع انطلاق الأسطول لا المقر الإداري؛ منه تُحسب المسافة إلى المناجم.</Notice>
        {locs.data?.data.length ? (
          <div className="mt-3 space-y-3">
            <MapView height={240} points={locs.data.data.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, label: l.name, kind: 'carrier' }))} />
            <ul className="divide-y divide-line">{locs.data.data.map((l) => <li key={l.id} className="py-2">{l.name} · {LOCATION_KIND_LABELS[l.location_kind as keyof typeof LOCATION_KIND_LABELS]} · {REGION_LABELS[l.region_code as RegionCode]}</li>)}</ul>
          </div>
        ) : <p className="mt-3 text-muted">لا توجد مواقع.</p>}
      </Card>
      <Card title="مناطق الخدمة">
        <p className="mb-3 text-sm text-muted">اختر المناطق الإدارية التي تخدمها. يجب أن تشمل منطقة المنجم ومنطقة المصنع لتكون مؤهلًا. (الدول ونصف القطر قريبًا.)</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          {REGION_CODES.map((r) => <Checkbox key={r} label={REGION_LABELS[r]} checked={current.includes(r)} onChange={(v) => setSel(v ? [...current, r] : current.filter((x) => x !== r))} />)}
        </div>
        {saveAreas.error ? <ErrorNote error={saveAreas.error} /> : null}
        <Button className="mt-3" disabled={!current.length} loading={saveAreas.isPending} onClick={() => saveAreas.mutate({ region_codes: current })}>حفظ المناطق</Button>
      </Card>
      <Dialog open={!!form} onClose={() => setForm(null)} title="موقع تشغيلي جديد">
        {form && (
          <div className="space-y-3">
            <Field label="الاسم" required>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <Field label="النوع">{(id) => <Select id={id} value={form.location_kind} onChange={(e) => setForm({ ...form, location_kind: e.target.value })}>{LOCATION_KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABELS[k]}</option>)}</Select>}</Field>
            <Field label="المنطقة" required>{(id) => <Select id={id} value={form.region_code} onChange={(e) => setForm({ ...form, region_code: e.target.value })}><option value="">اختر</option>{REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</Select>}</Field>
            <LocationPicker lat={form.lat} lng={form.lng} onChange={(lat, lng) => setForm({ ...form, lat, lng })} />
            {addLoc.error ? <ErrorNote error={addLoc.error} /> : null}
            <Button loading={addLoc.isPending} onClick={() => addLoc.mutate(form)}>حفظ</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const emptyService = { name: '', vehicle_type_code: 'DUMP_TRUCK', supported_cargo_classes: ['BULK_SOLID'] as string[], payload_tons_per_vehicle: '', vehicles_available: '1', min_shipment_tons: '0', max_shipment_tons: '', includes_loading: false, includes_unloading: false };

function ServicesTab() {
  const q = useApi<{ data: Service[] }>(['services'], '/carrier/services');
  const [form, setForm] = useState<typeof emptyService | null>(null);
  const save = useAction((body: object) => api('/carrier/services', { method: 'POST', body }), { success: 'أُضيفت الخدمة', invalidate: [['services']], onSuccess: () => setForm(null) });
  const errs = save.error instanceof ApiError ? Object.fromEntries(save.error.fieldErrors.map((f) => [f.field, f.message])) : {};
  if (q.isLoading) return <Skeleton />;
  return (
    <Card title="خدمات النقل" action={<Button icon="plus" variant="ghost" onClick={() => setForm({ ...emptyService })}>خدمة جديدة</Button>}>
      {!q.data?.data.length ? <EmptyState icon="truck" title="لا توجد خدمات" text="أضف خدمة (نوع المركبة والحمولة وأصناف المواد)." action={<Button onClick={() => setForm({ ...emptyService })}>أضف خدمة</Button>} /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.data.map((s) => (
            <div key={s.id} className="rounded-lg border border-line bg-white p-3 text-sm">
              <div className="flex justify-between"><span className="font-semibold">{s.name}</span><Badge tone={s.is_active ? 'success' : 'muted'}>{s.is_active ? 'نشطة' : 'موقوفة'}</Badge></div>
              <div className="mt-1 text-muted">{VEHICLE_TYPE_LABELS[s.vehicle_type_code]} · بري</div>
              <div>{s.vehicles_available} مركبة × {fmtTons(s.payload_tons_per_vehicle)}</div>
              <div>الشحنة: {fmtTons(s.min_shipment_tons)} — {fmtTons(s.max_shipment_tons)}</div>
              <div className="text-muted">{s.supported_cargo_classes.map((c) => CARGO_CLASS_LABELS[c]).join('، ')}</div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="خدمة نقل جديدة">
        {form && (
          <div className="space-y-3">
            <Field label="اسم الخدمة" error={errs.name} required>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <Field label="نمط النقل" hint="النقل البري فقط في هذه النسخة">{(id) => <Select id={id} value="ROAD" disabled><option value="ROAD">بري</option></Select>}</Field>
            <Field label="نوع المركبة">{(id) => <Select id={id} value={form.vehicle_type_code} onChange={(e) => setForm({ ...form, vehicle_type_code: e.target.value })}>{(['DUMP_TRUCK', 'BULK_TRAILER', 'FLATBED', 'CONTAINER_TRUCK', 'SPECIALIZED_INDUSTRIAL'] as VehicleType[]).map((v) => <option key={v} value={v}>{VEHICLE_TYPE_LABELS[v]}</option>)}</Select>}</Field>
            <div>
              <div className="mb-1 text-sm font-medium">أصناف الحمولة</div>
              <div className="grid grid-cols-2 gap-1">{CARGO_CLASSES.map((c) => <Checkbox key={c} label={CARGO_CLASS_LABELS[c]} checked={form.supported_cargo_classes.includes(c)} onChange={(v) => setForm({ ...form, supported_cargo_classes: v ? [...form.supported_cargo_classes, c] : form.supported_cargo_classes.filter((x) => x !== c) })} />)}</div>
              {errs.supported_cargo_classes && <p className="text-sm text-danger">{errs.supported_cargo_classes}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الحمولة لكل مركبة (طن)" error={errs.payload_tons_per_vehicle} required>{(id) => <Input id={id} dir="ltr" value={form.payload_tons_per_vehicle} onChange={(e) => setForm({ ...form, payload_tons_per_vehicle: e.target.value })} />}</Field>
              <Field label="عدد المركبات" required>{(id) => <Input id={id} dir="ltr" value={form.vehicles_available} onChange={(e) => setForm({ ...form, vehicles_available: e.target.value })} />}</Field>
              <Field label="أدنى شحنة (طن)">{(id) => <Input id={id} dir="ltr" value={form.min_shipment_tons} onChange={(e) => setForm({ ...form, min_shipment_tons: e.target.value })} />}</Field>
              <Field label="أقصى شحنة (طن)" error={errs.max_shipment_tons} required>{(id) => <Input id={id} dir="ltr" value={form.max_shipment_tons} onChange={(e) => setForm({ ...form, max_shipment_tons: e.target.value })} />}</Field>
            </div>
            <Checkbox label="يشمل التحميل" checked={form.includes_loading} onChange={(v) => setForm({ ...form, includes_loading: v })} />
            <Checkbox label="يشمل التفريغ" checked={form.includes_unloading} onChange={(v) => setForm({ ...form, includes_unloading: v })} />
            {save.error && !Object.keys(errs).length ? <ErrorNote error={save.error} /> : null}
            <Button loading={save.isPending} onClick={() => save.mutate({ ...form, mode_code: 'ROAD', vehicles_available: Number(form.vehicles_available) })}>حفظ</Button>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

const emptyVersion = { pricing_model: 'PER_TON_KM' as PricingModel, rate: '', fixed: '', origin: '', destination: '', distance_basis: 'PER_SHIPMENT', loading: '0', unloading: '0', handling: '0', fee_basis: 'FLAT', waiting: '0', free_hours: '0', minimum: '0' };

function versionBody(v: typeof emptyVersion) {
  const h = (x: string) => riyalsToHalalas(x || '0') ?? 0;
  return {
    pricing_model: v.pricing_model,
    rate_per_km: v.pricing_model === 'PER_KM' ? v.rate : null,
    rate_per_ton: v.pricing_model === 'PER_TON' ? v.rate : null,
    rate_per_ton_km: v.pricing_model === 'PER_TON_KM' ? v.rate : null,
    fixed_route_price_halalas: v.pricing_model === 'FIXED_ROUTE' ? h(v.fixed) : null,
    route_origin_region: v.pricing_model === 'FIXED_ROUTE' ? v.origin || null : null,
    route_destination_region: v.pricing_model === 'FIXED_ROUTE' ? v.destination || null : null,
    distance_basis: v.distance_basis,
    loading_fee_halalas: h(v.loading),
    unloading_fee_halalas: h(v.unloading),
    handling_fee_halalas: h(v.handling),
    fee_basis: v.fee_basis,
    waiting_fee_per_hour_halalas: h(v.waiting),
    free_waiting_hours: Number(v.free_hours || 0),
    minimum_charge_halalas: h(v.minimum),
    activate: true,
  };
}

function VersionEditor({ v, setV }: { v: typeof emptyVersion; setV: (x: typeof emptyVersion) => void }) {
  const rateLabel = { PER_KM: 'السعر لكل كم (ر.س)', PER_TON: 'السعر لكل طن (ر.س)', PER_TON_KM: 'السعر لكل طن·كم (ر.س)', FIXED_ROUTE: '' }[v.pricing_model];
  return (
    <div className="space-y-3">
      <Field label="نموذج التسعير">{(id) => <Select id={id} value={v.pricing_model} onChange={(e) => setV({ ...v, pricing_model: e.target.value as PricingModel })}>{PRICING_MODELS.map((m) => <option key={m} value={m}>{PRICING_MODEL_LABELS[m]}</option>)}</Select>}</Field>
      {v.pricing_model === 'FIXED_ROUTE' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="سعر المسار (ر.س)" required>{(id) => <Input id={id} dir="ltr" value={v.fixed} onChange={(e) => setV({ ...v, fixed: e.target.value })} />}</Field>
          <Field label="منطقة المنشأ" required>{(id) => <Select id={id} value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })}><option value="">اختر</option>{REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</Select>}</Field>
          <Field label="منطقة الوجهة" required>{(id) => <Select id={id} value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })}><option value="">اختر</option>{REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</Select>}</Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={rateLabel} hint="حتى 4 خانات عشرية" required>{(id) => <Input id={id} dir="ltr" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />}</Field>
          {v.pricing_model === 'PER_KM' && <Field label="أساس المسافة">{(id) => <Select id={id} value={v.distance_basis} onChange={(e) => setV({ ...v, distance_basis: e.target.value })}><option value="PER_SHIPMENT">مرة للشحنة</option><option value="PER_TRIP">لكل رحلة</option></Select>}</Field>}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-copper-dark">رسوم إضافية والحد الأدنى (اختياري)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="التحميل (ر.س)">{(id) => <Input id={id} dir="ltr" value={v.loading} onChange={(e) => setV({ ...v, loading: e.target.value })} />}</Field>
          <Field label="التفريغ (ر.س)">{(id) => <Input id={id} dir="ltr" value={v.unloading} onChange={(e) => setV({ ...v, unloading: e.target.value })} />}</Field>
          <Field label="المناولة (ر.س)">{(id) => <Input id={id} dir="ltr" value={v.handling} onChange={(e) => setV({ ...v, handling: e.target.value })} />}</Field>
          <Field label="أساس الرسوم">{(id) => <Select id={id} value={v.fee_basis} onChange={(e) => setV({ ...v, fee_basis: e.target.value })}><option value="FLAT">مقطوعة</option><option value="PER_TON">لكل طن</option></Select>}</Field>
          <Field label="الحد الأدنى للأجرة (ر.س)">{(id) => <Input id={id} dir="ltr" value={v.minimum} onChange={(e) => setV({ ...v, minimum: e.target.value })} />}</Field>
          <Field label="رسم الانتظار/ساعة (مشروط)">{(id) => <Input id={id} dir="ltr" value={v.waiting} onChange={(e) => setV({ ...v, waiting: e.target.value })} />}</Field>
        </div>
      </details>
    </div>
  );
}

function PricingTab() {
  const rules = useApi<{ data: Rule[] }>(['rules'], '/carrier/pricing-rules');
  const services = useApi<{ data: Service[] }>(['services'], '/carrier/services');
  const [create, setCreate] = useState<{ service_id: string; name: string; v: typeof emptyVersion } | null>(null);
  const [newVer, setNewVer] = useState<{ rule: Rule; v: typeof emptyVersion } | null>(null);
  const [preview, setPreview] = useState<{ rule: Rule; qty: string; km: string; result?: { lines: PriceLine[]; total: { display: string } }; error?: unknown } | null>(null);
  const createM = useAction((b: object) => api('/carrier/pricing-rules', { method: 'POST', body: b }), { success: 'فُعّل التسعير', invalidate: [['rules'], ['opportunities']], onSuccess: () => setCreate(null) });
  const versionM = useAction((b: object) => api(`/carrier/pricing-rules/${newVer?.rule.id}/versions`, { method: 'POST', body: b }), { success: 'فُعّل الإصدار الجديد', invalidate: [['rules']], onSuccess: () => setNewVer(null) });
  if (rules.isLoading || services.isLoading) return <Skeleton />;
  const unpriced = (services.data?.data ?? []).filter((s) => !(rules.data?.data ?? []).some((r) => r.service.id === s.id && r.active_version_id));

  async function runPreview() {
    if (!preview?.rule.active_version_id) return;
    try {
      const r = await api<{ lines: PriceLine[]; total: { display: string } }>(`/carrier/pricing-rules/${preview.rule.id}/versions/${preview.rule.active_version_id}/preview`, { method: 'POST', body: { quantity_tons: preview.qty, route_distance_km: preview.km } });
      setPreview({ ...preview, result: r, error: undefined });
    } catch (e) {
      setPreview({ ...preview, result: undefined, error: e });
    }
  }

  return (
    <div className="space-y-5">
      <Notice>الإصدار الساري لا يُعدل؛ عند تغيير الأسعار يُنشأ إصدار جديد ويحل محله. العروض المقدمة سابقًا تحتفظ بأسعارها.</Notice>
      {unpriced.length > 0 && (
        <Card title="خدمات بلا تسعير ساري">
          <ul className="space-y-2">{unpriced.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2"><span>{s.name}</span><Button onClick={() => setCreate({ service_id: s.id, name: `تسعير ${s.name}`, v: { ...emptyVersion } })}>أضف تسعيرًا</Button></li>)}</ul>
        </Card>
      )}
      {!services.data?.data.length && <EmptyState icon="truck" title="أضف خدمة أولًا" text="التسعير مرتبط بخدمة (نوع المركبة والحمولة)." />}
      {(rules.data?.data ?? []).map((r) => {
        const active = r.versions.find((v) => v.id === r.active_version_id);
        return (
          <Card key={r.id} title={r.name} action={<div className="flex gap-2"><Button variant="ghost" onClick={() => setPreview({ rule: r, qty: '600', km: '180' })} disabled={!active}>معاينة السعر</Button><Button variant="secondary" onClick={() => setNewVer({ rule: r, v: { ...emptyVersion, pricing_model: active?.pricing_model ?? 'PER_TON_KM' } })}>إصدار جديد</Button></div>}>
            <div className="text-sm text-muted">الخدمة: {r.service.name}</div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {r.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>الإصدار {v.version_no} · {PRICING_MODEL_LABELS[v.pricing_model]} · <bdi className="num">{v.rate_per_ton_km ?? v.rate_per_km ?? v.rate_per_ton ?? v.fixed_route_price?.display}</bdi> ر.س</span>
                  <Badge tone={v.status === 'ACTIVE' ? 'success' : 'muted'}>{PRICING_VERSION_STATUS_LABELS[v.status]}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <ConfirmDialog open={!!create} onClose={() => setCreate(null)} title="تسعير جديد" confirmLabel="حفظ وتفعيل" loading={createM.isPending} error={createM.error}
        onConfirm={() => create && createM.mutate({ service_id: create.service_id, name: create.name, version: versionBody(create.v) })}>
        {create && <><Field label="اسم القاعدة">{(id) => <Input id={id} value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} />}</Field><VersionEditor v={create.v} setV={(v) => setCreate({ ...create, v })} /></>}
      </ConfirmDialog>
      <ConfirmDialog open={!!newVer} onClose={() => setNewVer(null)} title="إصدار تسعير جديد" confirmLabel="حفظ وتفعيل" loading={versionM.isPending} error={versionM.error}
        onConfirm={() => newVer && versionM.mutate(versionBody(newVer.v))}>
        {newVer && <VersionEditor v={newVer.v} setV={(v) => setNewVer({ ...newVer, v })} />}
      </ConfirmDialog>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title="معاينة السعر">
        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="الوزن (طن)">{(id) => <Input id={id} dir="ltr" value={preview.qty} onChange={(e) => setPreview({ ...preview, qty: e.target.value })} />}</Field>
              <Field label="مسافة الطريق (كم)">{(id) => <Input id={id} dir="ltr" value={preview.km} onChange={(e) => setPreview({ ...preview, km: e.target.value })} />}</Field>
            </div>
            <Button onClick={() => void runPreview()}>احسب</Button>
            {preview.error ? <ErrorNote error={preview.error} /> : null}
            {preview.result && <ul className="space-y-1 text-sm">{preview.result.lines.map((l) => <li key={l.code} className="flex justify-between"><span>{l.label_ar}</span><bdi className="num">{formatHalalas(l.amount_halalas)} ر.س</bdi></li>)}<li className="flex justify-between border-t border-line pt-1 font-bold"><span>الإجمالي كما سيظهر للمصنع</span><bdi>{preview.result.total.display} ر.س</bdi></li></ul>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ─── SCR-OPP-01/02 ──────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const [band, setBand] = useState('');
  const q = useApi<{ data: Opportunity[]; has_active_pricing: boolean }>(['opportunities', band], `/carrier/opportunities${band ? `?filter[band]=${band}` : ''}`);
  return (
    <>
      <PageHeader title="فرص الشحن" subtitle="الشحنات التي تؤهلك لها خدماتك ومناطقك وتسعيرك الساري." />
      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'B1', 'B2', 'B3', 'B4'].map((b) => <button key={b} type="button" onClick={() => setBand(b)} className={cx('min-h-10 rounded-lg px-4', band === b ? 'bg-charcoal text-paper' : 'border border-line')}>{b || 'كل النطاقات'}</button>)}
      </div>
      {q.data && !q.data.has_active_pricing && <div className="mb-4"><Notice tone="warning">لن تظهر لك فرص حتى تفعّل قاعدة تسعير. <Link to="/carrier/setup" className="underline">الإعداد</Link></Notice></div>}
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.data.length ? <EmptyState icon="truck" title="لا توجد فرص مطابقة" /> : (
        <div className="space-y-3">
          {q.data.data.map((o) => (
            <Link key={o.deal_id} to={`/carrier/opportunities/${o.deal_id}`} className="block rounded-card border border-line bg-paper p-4 hover:border-copper">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{o.material.title} · {fmtTons(o.quantity_tons)}</div>
                  <div className="text-sm text-muted">{REGION_LABELS[o.origin.region_code as RegionCode]} ← {REGION_LABELS[o.destination.region_code as RegionCode]} · {CARGO_CLASS_LABELS[o.material.cargo_class as CargoClass]}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge tone="info">{o.distance_band}</Badge>
                  {o.is_reassignment && <Badge tone="warning">إعادة إسناد</Badge>}
                  {o.my_quote && <Badge tone="success">عرضك مقدم</Badge>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
                <DistanceLabel km={o.straight_line_km_to_mine} />
                <span>نافذة التحميل: {fmtDateTime(o.loading_window_start)}</span>
              </div>
              {o.deadline_at && <div className="mt-2"><DeadlineTimer at={o.deadline_at} label="آخر موعد للعروض" /></div>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function OpportunityPage() {
  const { dealId } = useParams();
  const { active } = useOrg();
  const q = useApi<Opportunity>(['opportunity', dealId], `/carrier/opportunities/${dealId}`);
  const [f, setF] = useState({ service_id: '', operating_location_id: '', route_distance_km: '', pickup: '', transit: '6', terms: '' });
  const [preview, setPreview] = useState<{ lines: PriceLine[]; total: { display: string }; conditional: { label_ar: string }[] } | null>(null);
  const [previewErr, setPreviewErr] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);
  const submit = useAction(postAction(`/deals/${dealId}/quotes`), { success: 'قُدم عرضك الملزم', invalidate: [['opportunity', dealId], ['opportunities']], onSuccess: () => setConfirm(false) });
  const withdraw = useAction((_: unknown, k: string) => api(`/quotes/${q.data?.my_quote?.id}/withdraw`, { method: 'POST', body: {}, idempotent: k }), { success: 'سُحب العرض', invalidate: [['opportunity', dealId]] });

  useEffect(() => {
    if (!q.data) return;
    setF((x) => ({
      ...x,
      service_id: x.service_id || q.data!.eligible_services[0]?.id || '',
      operating_location_id: x.operating_location_id || q.data!.nearest_location.id,
      route_distance_km: x.route_distance_km || q.data!.route_estimate_km,
      pickup: x.pickup || toRiyadhInput(q.data!.loading_window_start),
    }));
  }, [q.data]);

  // Live server-side calculation (the client never computes or sends prices — SEC-07).
  useEffect(() => {
    if (!f.service_id || !/^\d+(\.\d)?$/.test(f.route_distance_km)) return;
    const h = setTimeout(() => {
      api<{ lines: PriceLine[]; total: { display: string }; conditional: { label_ar: string }[] }>(`/deals/${dealId}/quotes/preview`, { method: 'POST', body: { service_id: f.service_id, route_distance_km: f.route_distance_km } })
        .then((r) => { setPreview(r); setPreviewErr(null); })
        .catch((e) => { setPreview(null); setPreviewErr(e); });
    }, 400);
    return () => clearTimeout(h);
  }, [f.service_id, f.route_distance_km, dealId]);

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const o = q.data;

  return (
    <>
      <PageHeader title={`${o.material.title} · ${fmtTons(o.quantity_tons)}`} subtitle={<bdi className="ltr font-mono">{o.reference}</bdi>} actions={<Badge tone="info">{o.distance_band}</Badge>} />
      {o.deadline_at && <DeadlineTimer at={o.deadline_at} label="آخر موعد للعروض" />}
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <Card title="الشحنة">
            <MapView line height={240} points={[{ id: 'o', lat: o.origin.lat, lng: o.origin.lng, label: o.origin.mine_name, kind: 'mine' }, { id: 'd', lat: o.destination.lat, lng: o.destination.lng, label: o.destination.site_name, kind: 'factory' }]} />
            <div className="mt-3">
              <KeyValue items={[
                ['من', `${o.origin.mine_name} — ${REGION_LABELS[o.origin.region_code as RegionCode]}`],
                ['إلى', `${o.destination.site_name} — ${REGION_LABELS[o.destination.region_code as RegionCode]}`],
                ['صنف الحمولة', CARGO_CLASS_LABELS[o.material.cargo_class as CargoClass]],
                ['المسافة من موقعك للمنجم', <DistanceLabel km={o.straight_line_km_to_mine} />],
                ['المنجم ← المصنع', <DistanceLabel km={o.straight_line_km_mine_to_factory} />],
                ['نافذة التحميل', `${fmtDateTime(o.loading_window_start)} — ${fmtDateTime(o.loading_window_end)}`],
                ['شروط التحميل', o.loading_conditions],
              ]} />
            </div>
          </Card>
        </div>
        <Card title={o.my_quote ? 'عرضك' : 'تقديم عرض ملزم'}>
          {o.my_quote ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><StatusChip kind="quote" status={o.my_quote.status} /> <MoneyText m={o.my_quote.total} className="text-lg font-bold" /></div>
              {o.my_quote.status === 'SUBMITTED' && <Button variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate(undefined)}>سحب العرض</Button>}
              {withdraw.error ? <ErrorNote error={withdraw.error} /> : null}
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="الخدمة" required>{(id) => <Select id={id} value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })}>{o.eligible_services.map((s) => <option key={s.id} value={s.id}>{s.name} · {VEHICLE_TYPE_LABELS[s.vehicle_type as VehicleType]} · {PRICING_MODEL_LABELS[s.pricing_model as PricingModel]}</option>)}</Select>}</Field>
              <Field label="موقع الانطلاق" required>{(id) => <Select id={id} value={f.operating_location_id} onChange={(e) => setF({ ...f, operating_location_id: e.target.value })}>{o.operating_locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>}</Field>
              <Field label="مسافة الطريق (كم)" hint={`تقدير لمسافة الطريق: ${o.route_estimate_km} كم (المباشرة × 1.3). أدخل المسافة الفعلية التي تؤكدها.`} required>
                {(id) => <Input id={id} dir="ltr" inputMode="decimal" value={f.route_distance_km} onChange={(e) => setF({ ...f, route_distance_km: e.target.value })} />}
              </Field>
              <Field label={`موعد الاستلام (${RIYADH_NOTE})`} hint="داخل نافذة التحميل فقط" required>
                {(id) => <Input id={id} type="datetime-local" dir="ltr" min={toRiyadhInput(o.loading_window_start)} max={toRiyadhInput(o.loading_window_end)} value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })} />}
              </Field>
              <Field label="المدة المتوقعة للنقل (ساعات)" required>{(id) => <Input id={id} dir="ltr" inputMode="decimal" value={f.transit} onChange={(e) => setF({ ...f, transit: e.target.value })} />}</Field>
              <Field label="الشروط">{(id) => <Textarea id={id} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />}</Field>
              <div className="rounded-lg border border-line bg-white p-3 text-sm">
                <div className="mb-1 font-semibold">السعر المحسوب من تسعيرك الساري</div>
                {previewErr ? <ErrorNote error={previewErr} /> : preview ? (
                  <ul className="space-y-1">
                    {preview.lines.map((l) => <li key={l.code} className="flex justify-between gap-2"><span>{l.label_ar}</span><bdi className="num">{formatHalalas(l.amount_halalas)} ر.س</bdi></li>)}
                    <li className="flex justify-between border-t border-line pt-1 font-bold"><span>الإجمالي</span><bdi>{preview.total.display} ر.س</bdi></li>
                    {preview.conditional.map((c, i) => <li key={i} className="text-xs text-muted">{c.label_ar}</li>)}
                  </ul>
                ) : <span className="text-muted">أدخل المسافة لحساب السعر.</span>}
              </div>
              <Button className="w-full" disabled={!active || !preview} onClick={() => setConfirm(true)}>مراجعة وتقديم العرض</Button>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="تقديم عرض نقل ملزم" confirmLabel="أقدّم العرض" loading={submit.isPending} error={submit.error}
        onConfirm={() => submit.mutate({ service_id: f.service_id, operating_location_id: f.operating_location_id, route_distance_km: f.route_distance_km, proposed_pickup_at: f.pickup ? fromRiyadhInput(f.pickup) : '', estimated_transit_hours: Number(f.transit), terms: f.terms || null })}>
        <p>بتقديم العرض تلتزم بالسعر <strong>{preview?.total.display} ر.س</strong> وموعد الاستلام حتى {fmtDateTime(o.deadline_at)}.</p>
      </ConfirmDialog>
    </>
  );
}

export function NearbyMinesPage() {
  const q = useApi<{ data: { mine: { id: string; name: string; region_code: string; lat: number; lng: number; organization_name: string; active_listings: number }; nearest_location: { name: string }; straight_line_km: string; distance_band: string }[]; has_locations: boolean }>(['nearby'], '/carrier/nearby-mines');
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader title="مناجم قريبة" subtitle="مرتبة بالمسافة المباشرة التقريبية من أقرب مواقعك التشغيلية." />
      {!q.data?.has_locations ? <EmptyState icon="pin" title="أضف موقعًا تشغيليًا أولًا" action={<Link to="/carrier/setup" className="underline">الإعداد</Link>} /> : (
        <div className="space-y-4">
          <MapView height={320} points={q.data.data.map((x) => ({ id: x.mine.id, lat: x.mine.lat, lng: x.mine.lng, label: x.mine.name, kind: 'mine' }))} />
          <ul className="divide-y divide-line rounded-card border border-line bg-paper">
            {q.data.data.map((x) => (
              <li key={x.mine.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div><div className="font-semibold">{x.mine.name}</div><div className="text-sm text-muted">{x.mine.organization_name} · {REGION_LABELS[x.mine.region_code as RegionCode]} · مواد منشورة: {x.mine.active_listings}</div></div>
                <div className="flex items-center gap-2"><Badge tone="info">{x.distance_band}</Badge><DistanceLabel km={x.straight_line_km} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
