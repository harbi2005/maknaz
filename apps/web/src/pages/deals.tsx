import { CANCELLATION_REASON_LABELS, formatHalalas, REGION_LABELS, VEHICLE_TYPE_LABELS, type CancellationReason, type RegionCode, type VehicleType } from '@maknaz/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth';
import { Icon } from '../components/icons';
import { MapView } from '../components/map';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  cx,
  DeadlineTimer,
  DistanceLabel,
  EmptyState,
  ErrorNote,
  ErrorState,
  Field,
  KeyValue,
  MoneyBreakdown,
  MoneyText,
  Notice,
  PageHeader,
  Select,
  SimulationBadge,
  Skeleton,
  StatusChip,
  Textarea,
  VerificationTag,
} from '../components/ui';
import { ApiError } from '../lib/api';
import { fmtDateTime, fmtTons } from '../lib/format';
import { postAction, useAction, useApi } from '../lib/hooks';
import type { Deal, EligibleCarrier, Quote } from '../types';

export function DealsPage({ admin }: { admin?: boolean }) {
  const [group, setGroup] = useState<'active' | 'completed' | 'cancelled'>('active');
  const base = admin ? '/admin/deals' : '/deals';
  const q = useApi<{ data: Deal[] }>(['deals', group, admin], `${base}?filter[group]=${group}`);
  return (
    <>
      <PageHeader title={admin ? 'كل الصفقات' : 'الصفقات'} />
      <div className="mb-4 flex flex-wrap gap-2">
        {([['active', 'نشطة'], ['completed', 'مكتملة'], ['cancelled', 'ملغاة']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setGroup(k)} className={cx('min-h-10 rounded-lg px-4', group === k ? 'bg-charcoal text-paper' : 'border border-line')}>{l}</button>
        ))}
      </div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.data.length ? (
        <EmptyState icon="list" title="لا توجد صفقات هنا" text="تنشأ الصفقة عند الاتفاق التجاري بين المنجم والمصنع." />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((d) => (
            <Link key={d.id} to={`/deals/${d.id}`} className="grid gap-2 rounded-card border border-line bg-paper p-4 hover:border-copper sm:grid-cols-[1.5fr_1fr_auto] sm:items-center">
              <div>
                <div className="font-semibold">{d.material.title}</div>
                <div className="text-sm text-muted"><bdi className="ltr font-mono">{d.reference}</bdi> · {d.parties.mine.name_ar} ← {d.parties.factory.name_ar}</div>
              </div>
              <div className="text-sm">
                {fmtTons(d.commercial.quantity_tons)} · <MoneyText m={d.grand_total ?? d.commercial.material_total} />
                {!d.grand_total && <span className="text-xs text-muted"> (قيمة المادة)</span>}
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <StatusChip kind="deal" status={d.status} />
                {d.deadlines.next && <span className="text-xs text-muted">المهلة: {fmtDateTime(d.deadlines.next.at)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const STAGES = [
  ['AGREEMENT', 'اتفاق تجاري'],
  ['CARRIER', 'تأكيد الناقل'],
  ['PAYMENT', 'الدفع المحاكى'],
  ['PREPARATION', 'التجهيز'],
  ['TRANSPORT', 'النقل'],
  ['RECEIPT', 'الاستلام'],
] as const;

function StageBar({ stage }: { stage: string }) {
  const idx = stage === 'DONE' ? STAGES.length : STAGES.findIndex(([k]) => k === stage);
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="مراحل الصفقة">
      {STAGES.map(([k, label], i) => {
        const done = i < idx || stage === 'DONE';
        const current = i === idx;
        return (
          <li key={k} className={cx('flex items-center gap-2 rounded-lg border px-2 py-2 text-sm', done ? 'border-success/40 bg-success/10 text-success' : current ? 'border-copper bg-copper/15 font-bold' : 'border-line text-muted')} aria-current={current ? 'step' : undefined}>
            <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-xs', done ? 'bg-success text-paper' : current ? 'bg-copper text-charcoal' : 'bg-line')}>{done ? <Icon name="check" className="size-4" /> : i + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export function DealDetailPage() {
  const { id } = useParams();
  const q = useApi<Deal>(['deal', id], `/deals/${id}`, { refetchInterval: 30_000 });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const reassigning = d.status === 'PAID' && d.shipment?.status === 'PENDING_CARRIER';

  return (
    <>
      <PageHeader
        title={d.material.title}
        subtitle={<><bdi className="ltr font-mono">{d.reference}</bdi> · {fmtTons(d.commercial.quantity_tons)}</>}
        actions={<><StatusChip kind="deal" status={d.status} />{d.status !== 'PENDING_CARRIER' && d.status !== 'PENDING_CARRIER_RETRY' && <SimulationBadge />}</>}
      />
      {d.stage !== 'CANCELLED' ? <StageBar stage={d.stage} /> : (
        <Notice tone="danger" icon="alert">
          أُلغيت الصفقة: {CANCELLATION_REASON_LABELS[d.cancellation!.reason as CancellationReason]}{d.cancellation?.note ? ` — ${d.cancellation.note}` : ''} ({fmtDateTime(d.cancellation?.cancelled_at)})
        </Notice>
      )}
      {d.status === 'PENDING_CARRIER' && <div className="mt-3"><Notice>«القبول» اتفاق تجاري مبدئي، ويصبح طلبًا مؤكدًا بعد تأكيد الناقل واختيار المصنع لعرضه.</Notice></div>}
      {d.status === 'PENDING_CARRIER_RETRY' && <div className="mt-3"><Notice tone="warning" icon="alert">لم يُؤكد ناقل خلال 24 ساعة؛ فترة إضافية أخيرة حتى {fmtDateTime(d.deadlines.retry_deadline_at)}.</Notice></div>}
      {reassigning && <div className="mt-3"><Notice tone="warning" icon="truck">يجري إسناد ناقل بديل حتى {fmtDateTime(d.shipment?.reassignment_deadline_at)}. موعد الاستلام الحالي يبقى ساريًا.</Notice></div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {d.deadlines.next && <DeadlineTimer at={d.deadlines.next.at} label="المهلة القادمة" />}
          {(['PENDING_CARRIER', 'PENDING_CARRIER_RETRY'].includes(d.status) || reassigning) && <CarrierStage d={d} />}
          {d.invoice && (
            <Card title="الفاتورة المحاكاة" action={<SimulationBadge />}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <bdi className="ltr font-mono">{d.invoice.reference}</bdi> · <StatusChip kind="payment" status={d.invoice.payment_status} />
                  {d.invoice.pending_adjustment && <div className="mt-1 text-sm text-warning">فرق سعر نقل بانتظار الدفع: <MoneyText m={d.invoice.pending_adjustment.amount} /></div>}
                </div>
                <Link to={`/invoices/${d.invoice.id}`} className={cx('inline-flex min-h-11 items-center rounded-lg px-4 font-bold', d.actions.can_pay || d.invoice.pending_adjustment ? 'bg-copper text-charcoal' : 'border border-line')}>
                  {d.actions.can_pay ? 'عرض الفاتورة والدفع (محاكاة)' : 'عرض الفاتورة'}
                </Link>
              </div>
            </Card>
          )}
          {d.shipment && !['PENDING_CARRIER'].includes(d.shipment.status) && d.shipment.status !== 'CANCELLED' && (
            <Card title="الشحنة">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <StatusChip kind="shipment" status={d.shipment.status} />
                  <div className="text-sm text-muted">موعد الاستلام: {fmtDateTime(d.shipment.pickup_deadline_at ?? d.shipment.planned_pickup_at)}</div>
                </div>
                <Link to={`/shipments/${d.shipment.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-charcoal px-4 font-semibold text-paper">تفاصيل الشحنة</Link>
              </div>
            </Card>
          )}
          <Card title="المسار">
            <MapView line height={260} points={[
              { id: 'mine', lat: d.route.mine.lat, lng: d.route.mine.lng, label: `المنجم: ${d.route.mine.name}`, kind: 'mine' },
              { id: 'site', lat: d.route.delivery_site.lat, lng: d.route.delivery_site.lng, label: `المصنع: ${d.route.delivery_site.name}`, kind: 'factory' },
            ]} />
            <div className="mt-3 space-y-1 text-sm">
              <div><DistanceLabel km={d.route.straight_line_km} /></div>
              {d.route.route_distance_km && <div><DistanceLabel km={d.route.route_distance_km} kind="route" /></div>}
            </div>
          </Card>
          {d.commercial.specifications_at_agreement.length > 0 && (
            <Card title="المواصفات وقت الاتفاق">
              <ul className="space-y-2 text-sm">
                {d.commercial.specifications_at_agreement.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.property_name}: <bdi className="num">{s.value_numeric ?? s.value_text ?? '—'}</bdi> {s.unit}</span>
                    <VerificationTag status={s.verification_status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card title="التكلفة">
            <MoneyBreakdown material={d.commercial.material_total} transport={d.transport?.total} total={d.grand_total} transportPending={!d.transport} />
            <div className="mt-2 text-sm text-muted">{fmtTons(d.commercial.quantity_tons)} × <MoneyText m={d.commercial.unit_price} />/طن</div>
          </Card>
          <Card title="الأطراف">
            <KeyValue items={[
              [<span className="inline-flex items-center gap-1"><Icon name="mine" className="size-4" />المنجم</span>, d.parties.mine.name_ar],
              [<span className="inline-flex items-center gap-1"><Icon name="factory" className="size-4" />المصنع</span>, d.parties.factory.name_ar],
              [<span className="inline-flex items-center gap-1"><Icon name="truck" className="size-4" />الناقل</span>, d.parties.carrier?.name_ar ?? 'لم يُحدد بعد'],
              ['نافذة التحميل', `${fmtDateTime(d.loading_window.start)} — ${fmtDateTime(d.loading_window.end)}`],
            ]} />
          </Card>
          <CancelBox d={d} />
        </div>
      </div>
    </>
  );
}

function CarrierStage({ d }: { d: Deal }) {
  const isFactory = d.viewer_role === 'FACTORY';
  const quotes = useApi<{ data: Quote[] }>(['quotes', d.id], `/deals/${d.id}/quotes`, { refetchInterval: 30_000 });
  const eligible = useApi<{ data: EligibleCarrier[]; matching_scope: { bands: string[] } }>(['eligible', d.id], d.viewer_role === 'CARRIER' ? null : `/deals/${d.id}/eligible-carriers`);
  const [sort, setSort] = useState<'total' | 'transit'>('total');
  const [selected, setSelected] = useState<Quote | null>(null);
  const [acceptDiff, setAcceptDiff] = useState(false);
  const reassigning = d.status === 'PAID';
  const select = useAction(postAction(`/deals/${d.id}/quotes/${selected?.id}/select`), {
    success: reassigning ? 'أُسند الناقل البديل' : 'اكتمل التأكيد الثلاثي وصدرت الفاتورة المحاكاة',
    invalidate: [['deal', d.id], ['quotes', d.id], ['deals']],
    onSuccess: () => setSelected(null),
  });
  const decline = useAction(postAction(`/deals/${d.id}/reassignment/decline`), { success: 'أُلغيت الصفقة مع استرجاع كامل (محاكاة)', invalidate: [['deal', d.id]] });

  const submitted = useMemo(() => {
    const list = (quotes.data?.data ?? []).filter((q) => q.status === 'SUBMITTED');
    return [...list].sort((a, b) => (sort === 'total' ? a.total.amount_halalas - b.total.amount_halalas : Number(a.estimated_transit_hours) - Number(b.estimated_transit_hours)));
  }, [quotes.data, sort]);
  const cheapest = submitted.length ? Math.min(...submitted.map((q) => q.total.amount_halalas)) : null;
  const fastest = submitted.length ? Math.min(...submitted.map((q) => Number(q.estimated_transit_hours ?? Infinity))) : null;
  const billed = d.transport?.total.amount_halalas ?? 0;
  const diff = selected && reassigning ? selected.total.amount_halalas - billed : 0;

  if (d.viewer_role === 'CARRIER') {
    return <Card title="عرض النقل"><Link className="text-copper-dark underline" to={`/carrier/opportunities/${d.id}`}>عرض الفرصة وعرضك</Link></Card>;
  }

  return (
    <Card title={isFactory ? 'عروض النقل — قارن واختر' : 'الناقلون'} action={isFactory && submitted.length > 1 ? (
      <Select aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value as 'total' | 'transit')} className="w-auto">
        <option value="total">الأقل إجماليًا</option>
        <option value="transit">الأسرع</option>
      </Select>
    ) : undefined}>
      {quotes.isLoading ? <Skeleton lines={2} /> : submitted.length === 0 ? (
        <EmptyState icon="truck" title="لم يقدم أي ناقل عرضًا بعد" text={`ناقلون مؤهلون: ${eligible.data?.data.length ?? '—'}. يُشعرون تلقائيًا بالفرصة.`} />
      ) : (
        <div className="space-y-3">
          {submitted.map((qt) => (
            <div key={qt.id} className="rounded-lg border border-line bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{qt.carrier.name_ar}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {qt.total.amount_halalas === cheapest && <Badge tone="success">الأقل إجماليًا</Badge>}
                    {Number(qt.estimated_transit_hours) === fastest && <Badge tone="info">الأسرع</Badge>}
                    {qt.distance_band && <Badge>{qt.distance_band}</Badge>}
                  </div>
                </div>
                <div className="text-end">
                  <MoneyText m={qt.total} className="text-lg font-bold" />
                  {qt.per_ton && <div className="text-xs text-muted"><MoneyText m={qt.per_ton} /> للطن</div>}
                </div>
              </div>
              {isFactory && (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>الاستلام: {fmtDateTime(qt.proposed_pickup_at)}</div>
                  <div>المدة المتوقعة: {qt.estimated_transit_hours} ساعة · {qt.trips} رحلة</div>
                  <div>{qt.service ? `${VEHICLE_TYPE_LABELS[qt.service.vehicle_type as VehicleType]} · ${qt.service.includes_loading ? 'يشمل التحميل' : 'لا يشمل التحميل'}` : ''}</div>
                  <div><DistanceLabel km={qt.route_distance_km} kind="route" /></div>
                  <details className="sm:col-span-2">
                    <summary className="cursor-pointer text-copper-dark">تفصيل السعر</summary>
                    <ul className="mt-2 space-y-1">
                      {qt.price_breakdown?.lines.map((l) => <li key={l.code} className="flex justify-between gap-2"><span>{l.label_ar}</span><bdi className="num">{formatHalalas(l.amount_halalas)} ر.س</bdi></li>)}
                      {qt.price_breakdown?.conditional.map((c) => <li key={c.code} className="text-xs text-muted">{c.label_ar}: {formatHalalas(c.rate_halalas_per_hour)} ر.س/ساعة</li>)}
                    </ul>
                    {qt.terms && <p className="mt-2 text-muted">الشروط: {qt.terms}</p>}
                  </details>
                  <div className="text-xs text-muted sm:col-span-2">صالح حتى {fmtDateTime(qt.expires_at)}</div>
                </div>
              )}
              {isFactory && d.actions.can_select_quote && (
                <div className="mt-3"><Button onClick={() => { setAcceptDiff(false); setSelected(qt); }}>اختيار هذا العرض</Button></div>
              )}
            </div>
          ))}
        </div>
      )}
      {isFactory && reassigning && (
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="ghost" onClick={() => decline.mutate({})} loading={decline.isPending}>رفض إعادة الإسناد وإلغاء الصفقة (استرجاع كامل)</Button>
          {decline.error ? <ErrorNote error={decline.error} /> : null}
        </div>
      )}
      {eligible.data && eligible.data.data.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-copper-dark">الناقلون المؤهلون ({eligible.data.data.length}) — النطاقات {eligible.data.matching_scope.bands.join('، ')}</summary>
          <ul className="mt-2 space-y-2 text-sm">
            {eligible.data.data.map((e) => (
              <li key={e.carrier.id} className="flex flex-wrap justify-between gap-2 rounded border border-line/70 p-2">
                <span>{e.carrier.name_ar} · {e.distance_band} · <DistanceLabel km={e.straight_line_km_to_mine} /></span>
                <span className="text-muted">{e.indicative_price ? <>{e.indicative_price.display} ر.س — {e.indicative_price.label}</> : ''}{e.has_submitted_quote ? ' · قدّم عرضًا' : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ConfirmDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={reassigning ? 'اختيار الناقل البديل' : 'اختيار الناقل — التأكيد الثلاثي'}
        confirmLabel="تأكيد الاختيار"
        loading={select.isPending}
        error={select.error instanceof ApiError && select.error.code === 'PRICE_DIFFERENCE_NOT_ACCEPTED' ? null : select.error}
        onConfirm={() => select.mutate({ accept_price_difference: acceptDiff })}
      >
        {selected && (
          <>
            {!reassigning ? (
              <p>باختيار هذا العرض يكتمل تأكيد الأطراف الثلاثة وتصدر الفاتورة المحاكاة، ومهلة الدفع 24 ساعة.</p>
            ) : (
              <p>سيُسند {selected.carrier.name_ar} للشحنة مع بقاء موعد الاستلام الحالي.</p>
            )}
            <MoneyBreakdown material={d.commercial.material_total} transport={selected.total} total={{ amount_halalas: d.commercial.material_total.amount_halalas + selected.total.amount_halalas, currency: 'SAR', display: formatHalalas(d.commercial.material_total.amount_halalas + selected.total.amount_halalas) }} />
            {reassigning && diff > 0 && <Checkbox label={`أوافق على فرق سعر النقل (+${formatHalalas(diff)} ر.س) كدفعة محاكاة إضافية`} checked={acceptDiff} onChange={setAcceptDiff} />}
            {reassigning && diff < 0 && <Notice tone="success">السعر أقل من النقل المفوتر؛ سيُسترجع الفرق ({formatHalalas(-diff)} ر.س) استرجاعًا محاكى.</Notice>}
            <SimulationBadge />
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function CancelBox({ d }: { d: Deal }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [fault, setFault] = useState('UNDETERMINED');
  const admin = !!me?.is_platform_admin;
  const m = useAction(postAction(admin ? `/admin/deals/${d.id}/cancel` : `/deals/${d.id}/cancel`), { success: 'أُلغيت الصفقة', invalidate: [['deal', d.id], ['deals']], onSuccess: () => setOpen(false) });
  if (['COMPLETED', 'CANCELLED'].includes(d.status)) return null;
  if (!d.actions.can_cancel && !d.actions.can_admin_cancel) {
    if (['PAID', 'IN_FULFILLMENT'].includes(d.status) && d.viewer_role !== 'CARRIER') return <Notice tone="muted">بعد الدفع لا يلغي الصفقة إلا إدارة المنصة؛ تواصل معها عند الحاجة.</Notice>;
    return null;
  }
  return (
    <>
      <Button variant="ghost" className="w-full text-danger" onClick={() => setOpen(true)}>{admin ? 'إلغاء إداري' : 'إلغاء الصفقة'}</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} danger title="إلغاء الصفقة" confirmLabel="تأكيد الإلغاء" loading={m.isPending} error={m.error}
        onConfirm={() => m.mutate(admin ? { reason_text: reason, fault_party: fault } : { reason_text: reason })}>
        <p>سيُحرر الحجز وتنتهي عروض النقل. {d.status === 'PAID' ? 'وسيُنشأ استرجاع محاكى كامل.' : ''}</p>
        <Field label="السبب" required>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {admin && (
          <Field label="الطرف المتسبب">
            {(id) => (
              <Select id={id} value={fault} onChange={(e) => setFault(e.target.value)}>
                {[['UNDETERMINED', 'غير محدد'], ['FACTORY', 'المصنع'], ['MINE', 'المنجم'], ['CARRIER', 'الناقل'], ['NONE', 'لا أحد']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}

export const regionName = (r: string) => REGION_LABELS[r as RegionCode] ?? r;
