import { formatHalalas, haversineKm, riyalsToHalalas, round1 } from '@maknaz/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOrg } from '../auth';
import {
  Button,
  Card,
  ConfirmDialog,
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
  Timeline,
} from '../components/ui';
import { ApiError } from '../lib/api';
import { fmtDateTime, fmtTons, fromRiyadhInput, RIYADH_NOTE, toRiyadhInput } from '../lib/format';
import { postAction, useAction, useApi } from '../lib/hooks';
import type { ListingDetail, Offer, Site } from '../types';

const tonsOk = (v: string) => /^\d{1,9}(\.\d{1,3})?$/.test(v) && Number(v) > 0;

/** SCR-OFR-01: side panel with live material value; transport cost comes later from carriers. */
export function OfferPanel({ open, onClose, listing }: { open: boolean; onClose: () => void; listing: ListingDetail }) {
  const nav = useNavigate();
  const sites = useApi<{ data: Site[] }>(['sites'], '/factory-sites');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState(formatHalalas(listing.asking_price.amount_halalas).replace(/,/g, ''));
  const [siteId, setSiteId] = useState(listing.reference_site_id ?? '');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const submit = useAction(postAction<Offer>('/offers'), {
    success: 'أُرسل عرض الشراء',
    invalidate: [['offers'], ['listing', listing.id]],
    onSuccess: (o) => nav(`/offers/${o.id}`),
  });
  const halalas = riyalsToHalalas(price);
  const site = sites.data?.data.find((s) => s.id === (siteId || sites.data?.data[0]?.id));
  const valid = tonsOk(qty) && Number(qty) <= Number(listing.quantity.available) && !!halalas && !!site;
  // Display-only estimate; the server computes and stores the authoritative value.
  const value = valid ? Math.round(Number(qty) * halalas!) : null;
  const errQty = qty && (!tonsOk(qty) ? 'أدخل كمية صحيحة' : Number(qty) > Number(listing.quantity.available) ? `الكمية تتجاوز المتاح (${fmtTons(listing.quantity.available)})` : '');
  const apiErr = submit.error instanceof ApiError ? submit.error : null;

  return (
    <Dialog open={open} onClose={onClose} title="تقديم عرض شراء">
      <div className="space-y-4">
        <div className="text-sm text-muted">{listing.title} — المتاح الآن: <strong>{fmtTons(listing.quantity.available)}</strong></div>
        <Field label="الكمية (طن)" error={errQty || (apiErr?.code === 'QUANTITY_EXCEEDS_AVAILABLE' ? apiErr.message : undefined)} required>
          {(id) => <Input id={id} dir="ltr" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} invalid={!!errQty} />}
        </Field>
        <Field label="سعر الوحدة (ر.س للطن)" hint={`سعر الطلب: ${listing.asking_price.display} ر.س`} required>
          {(id) => <Input id={id} dir="ltr" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} invalid={!halalas && price !== ''} />}
        </Field>
        <Field label="موقع التسليم" required>
          {(id) => (
            <Select id={id} value={site?.id ?? ''} onChange={(e) => setSiteId(e.target.value)}>
              {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        {!sites.data?.data.length && <Notice tone="warning">أضف موقعًا لمصنعك أولًا من «مواقع المصنع».</Notice>}
        <Field label="رسالة للمنجم">{(id) => <Textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
        <div className="rounded-lg border border-line bg-white p-3 text-sm">
          <div className="flex justify-between"><span>قيمة المادة</span><bdi className="num font-bold">{value != null ? `${formatHalalas(value)} ر.س` : '—'}</bdi></div>
          {site && <div className="mt-1 flex justify-between"><span>المسافة</span><DistanceLabel km={round1(haversineKm(site, listing.mine))} /></div>}
          <p className="mt-2 text-xs text-muted">تكلفة النقل تُحدد لاحقًا من عروض الناقلين.</p>
        </div>
        {submit.error && !(apiErr?.code === 'QUANTITY_EXCEEDS_AVAILABLE') ? <ErrorNote error={submit.error} /> : null}
        <Button className="w-full" disabled={!valid} onClick={() => setConfirm(true)}>مراجعة وإرسال</Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="تأكيد عرض الشراء"
        confirmLabel="إرسال العرض"
        loading={submit.isPending}
        error={submit.error}
        onConfirm={() => submit.mutate({ listing_id: listing.id, quantity_tons: qty, unit_price_halalas: halalas, delivery_site_id: site?.id, message: message || null }, { onSuccess: () => setConfirm(false) })}
      >
        <KeyValue items={[['الكمية', fmtTons(qty)], ['السعر', `${price} ر.س/طن`], ['قيمة المادة', value != null ? `${formatHalalas(value)} ر.س` : '—'], ['التسليم إلى', site?.name ?? '—']]} />
        <Notice>صلاحية العرض 48 ساعة. لا تُحجز الكمية إلا عند الاتفاق.</Notice>
      </ConfirmDialog>
    </Dialog>
  );
}

export function OffersPage() {
  const { role } = useOrg();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const q = useApi<{ data: Offer[] }>(['offers', tab], tab === 'open' ? '/offers?filter[open]=true' : '/offers');
  return (
    <>
      <PageHeader title={role === 'MINE' ? 'عروض الشراء الواردة' : 'عروض الشراء المرسلة'} />
      <div className="mb-4 flex gap-2">
        {(['open', 'all'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`min-h-10 rounded-lg px-4 ${tab === t ? 'bg-charcoal text-paper' : 'border border-line'}`}>
            {t === 'open' ? 'مفتوحة' : 'الكل'}
          </button>
        ))}
      </div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.data.length ? (
        <EmptyState icon="handshake" title="لا توجد عروض" text={role === 'FACTORY' ? 'ابحث عن مادة وقدّم أول عرض شراء.' : 'ستظهر هنا عروض المصانع على موادك.'} action={role === 'FACTORY' ? <Link to="/search" className="font-semibold text-copper-dark underline">ابحث عن مواد</Link> : undefined} />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((o) => (
            <Link key={o.id} to={`/offers/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-paper p-4 hover:border-copper">
              <div>
                <div className="font-semibold">{o.listing.title}</div>
                <div className="text-sm text-muted">
                  <bdi className="ltr font-mono">{o.reference}</bdi> · {role === 'MINE' ? o.factory.name_ar : o.mine_org.name_ar} · {fmtTons(o.current_round.quantity_tons)} · <MoneyText m={o.current_round.unit_price} />/طن
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusChip kind="offer" status={o.status} />
                {['SUBMITTED', 'COUNTERED'].includes(o.status) && <span className="text-xs text-muted">تنتهي {fmtDateTime(o.current_round.expires_at)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function defaultWindow() {
  const start = new Date(Date.now() + 72 * 3_600_000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 96 * 3_600_000);
  return { start: toRiyadhInput(start.toISOString()), end: toRiyadhInput(end.toISOString()) };
}

function WindowFields({ w, setW }: { w: { start: string; end: string }; setW: (v: { start: string; end: string }) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`بداية نافذة التحميل (${RIYADH_NOTE})`} hint="بعد 48 ساعة على الأقل" required>
        {(id) => <Input id={id} type="datetime-local" dir="ltr" value={w.start} onChange={(e) => setW({ ...w, start: e.target.value })} />}
      </Field>
      <Field label={`نهاية نافذة التحميل (${RIYADH_NOTE})`} required>
        {(id) => <Input id={id} type="datetime-local" dir="ltr" value={w.end} onChange={(e) => setW({ ...w, end: e.target.value })} />}
      </Field>
    </div>
  );
}

export function OfferDetailPage() {
  const { id } = useParams();
  const { role } = useOrg();
  const nav = useNavigate();
  const q = useApi<Offer>(['offer', id], `/offers/${id}`);
  const [dialog, setDialog] = useState<null | 'accept' | 'reject' | 'counter' | 'counterAccept' | 'counterReject' | 'withdraw'>(null);
  const [w, setW] = useState(defaultWindow);
  const [note, setNote] = useState('');
  const [counter, setCounter] = useState({ price: '', qty: '' });
  const inv = [['offer', id], ['offers'], ['deals']];
  const goDeal = (r: { deal?: { id: string } }) => r.deal && nav(`/deals/${r.deal.id}`);
  const accept = useAction(postAction<{ deal: { id: string } }>(`/offers/${id}/accept`), { success: 'تم الاتفاق وحُجزت الكمية', invalidate: inv, onSuccess: goDeal });
  const reject = useAction(postAction(`/offers/${id}/reject`), { success: 'رُفض العرض', invalidate: inv, onSuccess: () => setDialog(null) });
  const counterM = useAction(postAction(`/offers/${id}/counter`), { success: 'أُرسل العرض المقابل', invalidate: inv, onSuccess: () => setDialog(null) });
  const cAccept = useAction(postAction<{ deal: { id: string } }>(`/offers/${id}/counter/accept`), { success: 'تم الاتفاق وحُجزت الكمية', invalidate: inv, onSuccess: goDeal });
  const cReject = useAction(postAction(`/offers/${id}/counter/reject`), { success: 'رُفض العرض المقابل', invalidate: inv, onSuccess: () => setDialog(null) });
  const withdraw = useAction(postAction(`/offers/${id}/withdraw`), { success: 'سُحب العرض', invalidate: inv, onSuccess: () => setDialog(null) });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const cur = o.current_round;
  const pending = cur.status === 'PENDING';
  const mineTurn = role === 'MINE' && o.status === 'SUBMITTED' && pending;
  const factoryTurn = role === 'FACTORY' && o.status === 'COUNTERED' && pending;
  const window = { loading_window_start: w.start ? fromRiyadhInput(w.start) : '', loading_window_end: w.end ? fromRiyadhInput(w.end) : '' };
  const counterHalalas = riyalsToHalalas(counter.price || cur.unit_price.display.replace(/,/g, ''));
  const insufficient = [accept.error, cAccept.error].find((e) => e instanceof ApiError && e.code === 'INSUFFICIENT_QUANTITY') as ApiError | undefined;

  return (
    <>
      <PageHeader title={o.listing.title} subtitle={<><bdi className="ltr font-mono">{o.reference}</bdi> · {o.factory.name_ar} ← {o.mine_org.name_ar}</>} actions={<StatusChip kind="offer" status={o.status} />} />
      {o.deal && (
        <Notice tone="success" icon="check">
          تم الاتفاق التجاري. <Link to={`/deals/${o.deal.id}`} className="font-semibold underline">انتقل إلى الصفقة {o.deal.reference}</Link>
        </Notice>
      )}
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card title="الجولة الحالية">
          <KeyValue
            items={[
              ['الطرف', cur.proposed_by === 'FACTORY' ? 'المصنع' : 'المنجم (عرض مقابل)'],
              ['الكمية', fmtTons(cur.quantity_tons)],
              ['سعر الوحدة', <><MoneyText m={cur.unit_price} /> / طن</>],
              ['قيمة المادة', <MoneyText m={cur.material_value} className="font-bold" />],
              ['موقع التسليم', o.delivery_site.name],
              ['المسافة', <DistanceLabel km={o.distance.straight_line_km} />],
              ...(cur.loading_window_start ? [['نافذة التحميل', `${fmtDateTime(cur.loading_window_start)} — ${fmtDateTime(cur.loading_window_end)}`] as [string, string]] : []),
            ]}
          />
          {cur.message && <p className="mt-3 rounded-lg bg-sand/60 p-3 text-sm">«{cur.message}»</p>}
          {pending && <div className="mt-3"><DeadlineTimer at={cur.expires_at} label="مهلة الرد" /></div>}
          {insufficient && (
            <Notice tone="danger" icon="alert">
              حُجزت الكمية لصفقة أخرى. المتاح الحالي: {fmtTons(String(insufficient.details?.available ?? '0'))}.
            </Notice>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {mineTurn && (
              <>
                <Button onClick={() => setDialog('accept')}>قبول</Button>
                <Button variant="secondary" onClick={() => { setCounter({ price: '', qty: cur.quantity_tons }); setDialog('counter'); }}>عرض مقابل</Button>
                <Button variant="ghost" onClick={() => setDialog('reject')}>رفض</Button>
              </>
            )}
            {factoryTurn && (
              <>
                <Button onClick={() => setDialog('counterAccept')}>قبول العرض المقابل</Button>
                <Button variant="ghost" onClick={() => setDialog('counterReject')}>رفض</Button>
              </>
            )}
            {role === 'FACTORY' && o.status === 'SUBMITTED' && <Button variant="ghost" onClick={() => setDialog('withdraw')}>سحب العرض</Button>}
          </div>
          {factoryTurn && <p className="mt-2 text-xs text-muted">لا يوجد عرض مقابل ثانٍ؛ يمكنك تقديم عرض جديد بعد الرفض.</p>}
        </Card>
        <Card title="سجل التفاوض">
          <Timeline
            items={o.rounds.map((r) => ({
              key: r.id,
              title: <>الجولة {r.round_no} — {r.proposed_by === 'FACTORY' ? 'المصنع' : 'المنجم'} <StatusChip kind="round" status={r.status} /></>,
              meta: fmtDateTime(r.created_at),
              body: <>{fmtTons(r.quantity_tons)} × <MoneyText m={r.unit_price} /> = <MoneyText m={r.material_value} />{r.response_note && <div className="text-muted">ملاحظة: {r.response_note}</div>}</>,
              tone: r.status === 'ACCEPTED' ? 'success' : r.status === 'REJECTED' ? 'danger' : undefined,
            }))}
          />
        </Card>
      </div>

      <ConfirmDialog open={dialog === 'accept'} onClose={() => setDialog(null)} title="قبول عرض الشراء" confirmLabel="قبول وحجز الكمية" loading={accept.isPending} error={accept.error}
        onConfirm={() => accept.mutate(window)}>
        <p>سيُحجز {fmtTons(cur.quantity_tons)} وتُنشأ صفقة. بعدها تُعرض الشحنة على الناقلين المؤهلين لمدة 24 ساعة.</p>
        <WindowFields w={w} setW={setW} />
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'counter'} onClose={() => setDialog(null)} title="عرض مقابل (مرة واحدة)" confirmLabel="إرسال العرض المقابل" loading={counterM.isPending} error={counterM.error}
        onConfirm={() => counterM.mutate({ unit_price_halalas: counterHalalas, quantity_tons: counter.qty, message: note || null, ...window })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="السعر الجديد (ر.س/طن)" hint={`سعر المصنع: ${cur.unit_price.display}`} required>
            {(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={counter.price} onChange={(e) => setCounter({ ...counter, price: e.target.value })} />}
          </Field>
          <Field label="الكمية (طن)" hint="يجوز خفضها فقط" required>
            {(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={counter.qty} onChange={(e) => setCounter({ ...counter, qty: e.target.value })} />}
          </Field>
        </div>
        <WindowFields w={w} setW={setW} />
        <Field label="رسالة">{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'counterAccept'} onClose={() => setDialog(null)} title="قبول العرض المقابل" confirmLabel="قبول" loading={cAccept.isPending} error={cAccept.error}
        onConfirm={() => cAccept.mutate({})}>
        <p>ستُحجز الكمية وتُنشأ الصفقة بسعر <MoneyText m={cur.unit_price} />/طن ونافذة التحميل المحددة من المنجم. «القبول» اتفاق تجاري، والطلب يتأكد بعد تأكيد الناقل.</p>
      </ConfirmDialog>
      {(['reject', 'counterReject', 'withdraw'] as const).map((k) => {
        const m = k === 'reject' ? reject : k === 'counterReject' ? cReject : withdraw;
        return (
          <ConfirmDialog key={k} open={dialog === k} onClose={() => setDialog(null)} danger title={k === 'withdraw' ? 'سحب العرض' : 'رفض'} confirmLabel={k === 'withdraw' ? 'سحب' : 'رفض'} loading={m.isPending} error={m.error}
            onConfirm={() => m.mutate(k === 'withdraw' ? {} : { note: note || null })}>
            {k !== 'withdraw' ? <Field label="سبب (اختياري)">{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field> : <p>سيُغلق العرض ولن يحتاج ردًا من المنجم.</p>}
          </ConfirmDialog>
        );
      })}
      {(accept.error || cAccept.error) && !insufficient ? <div className="mt-3"><ErrorNote error={accept.error ?? cAccept.error} /></div> : null}
    </>
  );
}
