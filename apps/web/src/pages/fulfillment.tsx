import { EXTENSION_REASON_LABELS, EXTENSION_REASONS, NOT_TAX_INVOICE_AR, SIMULATION_NOTICE_AR } from '@maknaz/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import logoDark from '@brand/logo/logo_wordmark_dark.png';
import {
  Button,
  Card,
  ConfirmDialog,
  DeadlineTimer,
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
  SimulationBadge,
  Skeleton,
  StatusChip,
  Textarea,
  Timeline,
} from '../components/ui';
import { fmtDateTime, fmtTons, fromRiyadhInput, RIYADH_NOTE, toRiyadhInput } from '../lib/format';
import { postAction, useAction, useApi } from '../lib/hooks';
import type { Invoice, Shipment } from '../types';

// ─── SCR-INV-01 ─────────────────────────────────────────────────────────

export function InvoicePage() {
  const { id } = useParams();
  const q = useApi<Invoice>(['invoice', id], `/invoices/${id}`);
  const [confirm, setConfirm] = useState<null | 'PRIMARY' | 'ADJUSTMENT'>(null);
  const [receipt, setReceipt] = useState<{ simulated_reference: string; amount: { display: string } } | null>(null);
  const pay = useAction(postAction<{ payment: { simulated_reference: string; amount: { display: string } } }>(`/invoices/${id}/simulated-payments`), {
    success: 'اكتمل الدفع المحاكى',
    invalidate: [['invoice', id], ['deals'], ['deal']],
    onSuccess: (r) => { setReceipt(r.payment); setConfirm(null); },
  });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const i = q.data;
  const p = i.parties;

  return (
    <>
      <div className="no-print">
        <PageHeader title="الفاتورة المحاكاة" subtitle={<bdi className="ltr font-mono">{i.reference}</bdi>} actions={<Button variant="ghost" icon="download" onClick={() => window.print()}>طباعة / PDF</Button>} />
      </div>
      <div className="mb-4"><SimulationBadge large /></div>
      {receipt && (
        <div className="mb-4">
          <Notice tone="success" icon="check">
            إيصال محاكى <bdi className="ltr font-mono">{receipt.simulated_reference}</bdi> بمبلغ {receipt.amount.display} ر.س. {SIMULATION_NOTICE_AR}
          </Notice>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <img src={logoDark} alt="مَكْنَز" className="h-12 w-auto" />
            <div className="text-end text-sm">
              <div className="font-bold">{NOT_TAX_INVOICE_AR}</div>
              <div>تاريخ الإصدار: {fmtDateTime(i.issued_at)} ({RIYADH_NOTE})</div>
              <div>الصفقة: <Link to={`/deals/${i.deal.id}`} className="ltr font-mono underline">{i.deal.reference}</Link></div>
            </div>
          </div>
          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            {([['المشتري', p.buyer], ['البائع (المنجم)', p.mine], ['الناقل', p.carrier]] as const).map(([l, o]) => (
              <div key={l}><div className="text-muted">{l}</div><div className="font-semibold">{o.legal_name_ar}</div><div className="text-xs">سجل: <bdi className="ltr">{o.commercial_registration_no}</bdi> · {o.city}</div></div>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-muted"><th className="py-2 text-start font-medium">البند</th><th className="py-2 text-start font-medium">الكمية</th><th className="py-2 text-start font-medium">سعر الوحدة</th><th className="py-2 text-end font-medium">الإجمالي</th></tr></thead>
            <tbody>
              {i.items.map((it) => (
                <tr key={it.id} className="border-b border-line/60">
                  <td className="py-2">{it.description_ar}</td>
                  <td className="py-2">{it.quantity ? fmtTons(it.quantity) : '—'}</td>
                  <td className="py-2">{it.unit_amount ? <MoneyText m={it.unit_amount} /> : '—'}</td>
                  <td className="py-2 text-end"><MoneyText m={it.line_total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>إجمالي المادة</dt><dd><MoneyText m={i.material_total} /></dd></div>
            <div className="flex justify-between"><dt>النقل</dt><dd><MoneyText m={i.transport_total} /></dd></div>
            <div className="flex justify-between"><dt>رسوم إضافية</dt><dd><MoneyText m={i.additional_charges} /></dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><dt>الإجمالي</dt><dd><MoneyText m={i.grand_total} /></dd></div>
            {i.adjustments_total.amount_halalas !== 0 && <div className="flex justify-between text-muted"><dt>تسويات إعادة الإسناد</dt><dd><MoneyText m={i.adjustments_total} /></dd></div>}
          </dl>
          {p.conditional_charges?.length > 0 && <p className="mt-3 text-xs text-muted">رسوم مشروطة خارج الإجمالي: {p.conditional_charges.map((c) => c.label_ar).join('، ')}</p>}
          <p className="mt-3 text-xs text-muted">{i.tax_note}</p>
          <div className="mt-3"><SimulationBadge /></div>
        </Card>
        <div className="no-print space-y-5">
          <Card title="الدفع (محاكاة)">
            <div className="space-y-3">
              <StatusChip kind="payment" status={i.payment_status} />
              {i.payment_status === 'PAYMENT_PENDING' && <DeadlineTimer at={i.payment_deadline_at} label="مهلة الدفع" />}
              {i.payment_status === 'PAYMENT_EXPIRED' && <Notice tone="danger" icon="alert">انتهت مهلة الدفع وأُلغيت الصفقة.</Notice>}
              {i.can_pay && <Button className="w-full" onClick={() => setConfirm('PRIMARY')}>تنفيذ دفع محاكى</Button>}
              {i.pending_adjustment && <Button className="w-full" onClick={() => setConfirm('ADJUSTMENT')}>دفع فرق السعر (محاكاة) <MoneyText m={i.pending_adjustment.amount} /></Button>}
              <KeyValue items={[['المدفوع', <MoneyText m={i.paid_total} />], ['المسترد', <MoneyText m={i.refunded_total} />]]} />
            </div>
          </Card>
          {i.payments.length > 0 && (
            <Card title="الإيصالات المحاكاة">
              <ul className="space-y-2 text-sm">{i.payments.map((p2) => <li key={p2.id} className="flex justify-between gap-2"><bdi className="ltr font-mono">{p2.simulated_reference}</bdi><MoneyText m={p2.amount} /></li>)}</ul>
            </Card>
          )}
          {i.refunds.length > 0 && (
            <Card title="الاستردادات المحاكاة" action={<SimulationBadge />}>
              <ul className="space-y-2 text-sm">{i.refunds.map((r) => <li key={r.id}><div className="flex justify-between gap-2"><MoneyText m={r.amount} className="font-semibold" /><span className="text-success">مكتمل</span></div><div className="text-xs text-muted">{r.reason} · <bdi className="ltr">{r.simulated_reference}</bdi></div></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} title="تأكيد الدفع المحاكى" confirmLabel="ادفع (محاكاة)" loading={pay.isPending} error={pay.error}
        onConfirm={() => pay.mutate(confirm === 'ADJUSTMENT' ? { kind: 'ADJUSTMENT', invoice_item_id: i.pending_adjustment?.invoice_item_id } : {})}>
        <SimulationBadge large />
        <p className="font-semibold">عملية محاكاة — لن يتم تحويل أي أموال.</p>
        <p>المبلغ: <MoneyText m={confirm === 'ADJUSTMENT' ? i.pending_adjustment?.amount : i.grand_total} className="font-bold" /></p>
        {confirm === 'PRIMARY' && <p className="text-sm text-muted">بعد الدفع تُجدول الشحنة على موعد الاستلام المحدد في عرض الناقل.</p>}
      </ConfirmDialog>
    </>
  );
}

// ─── SCR-SHP-01..03 ─────────────────────────────────────────────────────

export function ShipmentsPage() {
  const q = useApi<{ data: Shipment[] }>(['shipments'], '/shipments');
  return (
    <>
      <PageHeader title="الشحنات" />
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data?.data.length ? <EmptyState icon="truck" title="لا توجد شحنات بعد" /> : (
        <div className="space-y-3">
          {q.data.data.map((s) => (
            <Link key={s.id} to={`/shipments/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-paper p-4 hover:border-copper">
              <div><div className="font-semibold">{s.material_title}</div><div className="text-sm text-muted">{s.origin} ← {s.destination} · <bdi className="ltr font-mono">{s.deal.reference}</bdi></div></div>
              <StatusChip kind="shipment" status={s.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function ShipmentPage() {
  const { id } = useParams();
  const q = useApi<Shipment>(['shipment', id], `/shipments/${id}`, { refetchInterval: 30_000 });
  const [dialog, setDialog] = useState<null | 'extend' | 'reconfirm' | 'decline' | 'pickup' | 'receipt'>(null);
  const [ext, setExt] = useState({ at: '', reason_code: 'MATERIAL_NOT_READY', reason_text: '' });
  const [tons, setTons] = useState('');
  const [note, setNote] = useState('');
  const inv = [['shipment', id], ['deal'], ['deals']];
  const act = (path: string, success: string) => useAction(postAction(`/shipments/${id}/${path}`), { success, invalidate: inv, onSuccess: () => setDialog(null) });
  const ready = act('ready', 'تم إبلاغ الناقل بالجاهزية');
  const handover = act('handover-confirm', 'تم تأكيد المناولة');
  const pickup = act('pickup', 'سُجل الاستلام من المنجم');
  const transit = act('in-transit', 'الشحنة في الطريق');
  const deliver = act('deliver', 'سُجل الوصول');
  const receipt = act('confirm-receipt', 'اكتملت الصفقة');
  const extend = act('extensions', 'مُدد موعد الاستلام');
  const reconfirm = act('reconfirm', 'تم إرسال ردك');

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const a = s.actions;
  const maxNew = s.pickup_deadline_at ? new Date(new Date(s.pickup_deadline_at).getTime() + s.max_extension_hours * 3_600_000).toISOString() : null;
  const anyError = ready.error ?? handover.error ?? transit.error ?? deliver.error;

  return (
    <>
      <PageHeader title={s.material_title} subtitle={<>{s.origin} ← {s.destination} · <Link to={`/deals/${s.deal.id}`} className="ltr font-mono underline">{s.deal.reference}</Link></>} actions={<StatusChip kind="shipment" status={s.status} />} />
      {s.status === 'DELAYED' && <Notice tone="warning" icon="alert">الشحنة متأخرة عن موعد الوصول المتوقع. لا تُلغى الشحنات المنقولة؛ تابع مع الناقل.</Notice>}
      {s.status === 'PENDING_CARRIER' && s.reassignment_deadline_at && <Notice tone="warning" icon="truck">يجري إسناد ناقل بديل حتى {fmtDateTime(s.reassignment_deadline_at)}.</Notice>}
      {s.status === 'RECONFIRM_REQUIRED' && <Notice tone="warning" icon="clock">مدد المنجم الموعد؛ مطلوب من الناقل إعادة تأكيد جاهزيته قبل {fmtDateTime(s.reconfirm_deadline_at)}.</Notice>}
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card title="الإجراءات">
            <div className="flex flex-wrap gap-2">
              {a.can_mark_ready && <Button onClick={() => ready.mutate({})} loading={ready.isPending}>جاهز للاستلام</Button>}
              {a.can_extend && <Button variant="secondary" onClick={() => { setExt({ ...ext, at: s.pickup_deadline_at ? toRiyadhInput(new Date(new Date(s.pickup_deadline_at).getTime() + 24 * 3_600_000).toISOString()) : '' }); setDialog('extend'); }}>تمديد الموعد ({s.extensions_remaining} متبقٍ)</Button>}
              {a.can_confirm_handover && <Button variant="ghost" onClick={() => handover.mutate({})} loading={handover.isPending}>تأكيد المناولة</Button>}
              {a.can_reconfirm && <><Button onClick={() => reconfirm.mutate({ decision: 'CONFIRM' })} loading={reconfirm.isPending}>أؤكد الجاهزية</Button><Button variant="ghost" onClick={() => setDialog('decline')}>لا أستطيع</Button></>}
              {a.can_pickup && <Button onClick={() => setDialog('pickup')}>تم الاستلام من المنجم</Button>}
              {a.can_start_transit && <Button onClick={() => transit.mutate({})} loading={transit.isPending}>في الطريق</Button>}
              {a.can_deliver && <Button onClick={() => deliver.mutate({})} loading={deliver.isPending}>تم الوصول</Button>}
              {a.can_confirm_receipt && <Button onClick={() => setDialog('receipt')}>تأكيد الاستلام</Button>}
              {!Object.values(a).some(Boolean) && <p className="text-muted">لا توجد إجراءات مطلوبة منك الآن.</p>}
            </div>
            {anyError ? <div className="mt-3"><ErrorNote error={anyError} /></div> : null}
          </Card>
          <Card title="الخط الزمني">
            <Timeline items={s.events.map((e) => ({ key: e.id, title: e.to_status ? <StatusChip kind="shipment" status={e.to_status} /> : 'ملاحظة', meta: `${fmtDateTime(e.occurred_at)} · ${e.actor_type === 'SYSTEM' ? 'النظام' : (e.actor_org_name ?? '')}`, body: e.note, tone: e.to_status === 'CANCELLED' ? 'danger' : e.to_status === 'COMPLETED' ? 'success' : undefined }))} />
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="المواعيد">
            <KeyValue items={[
              ['نافذة التحميل', `${fmtDateTime(s.pickup_window.start)} — ${fmtDateTime(s.pickup_window.end)}`],
              ['موعد الاستلام الحالي', fmtDateTime(s.pickup_deadline_at ?? s.planned_pickup_at)],
              ...(s.original_pickup_deadline_at && s.original_pickup_deadline_at !== s.pickup_deadline_at ? [['الموعد الأصلي', fmtDateTime(s.original_pickup_deadline_at)] as [string, string]] : []),
              ['التمديدات المستخدمة', `${s.extension_count} / ${s.extension_count + s.extensions_remaining}`],
              ['الوصول المتوقع', fmtDateTime(s.expected_delivery_at)],
              ['الناقل', s.carrier?.name_ar ?? '—'],
              ...(s.loaded_tons ? [['الكمية المحمّلة', fmtTons(s.loaded_tons)] as [string, string]] : []),
            ]} />
            <p className="mt-2 text-xs text-muted">كل المواعيد {RIYADH_NOTE}.</p>
            {s.auto_cancel_at && <div className="mt-3"><DeadlineTimer at={s.auto_cancel_at} label="إلغاء تلقائي إن لم تُستلم" /></div>}
          </Card>
          {s.extensions.length > 0 && (
            <Card title="سجل التمديد">
              <ul className="space-y-3 text-sm">{s.extensions.map((e) => <li key={e.sequence_no}><div className="font-semibold">تمديد {e.sequence_no}: {e.reason_label}</div><div className="text-muted">{fmtDateTime(e.previous_deadline_at)} ← {fmtDateTime(e.new_deadline_at)}</div><div>{e.reason_text}</div><div className="text-xs">إعادة التأكيد: {({ PENDING: 'بانتظار الناقل', CONFIRMED: 'أكد الناقل', DECLINED: `اعتذر الناقل${e.decline_reason ? `: ${e.decline_reason}` : ''}`, TIMED_OUT: 'انقضت المهلة', SUPERSEDED: 'استُبدل بتمديد لاحق', NOT_REQUIRED: 'غير مطلوبة' } as Record<string, string>)[e.reconfirmation_status]}</div></li>)}</ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog open={dialog === 'extend'} onClose={() => setDialog(null)} title="تمديد موعد الاستلام" confirmLabel="تمديد" loading={extend.isPending} error={extend.error}
        onConfirm={() => extend.mutate({ new_pickup_deadline_at: ext.at ? fromRiyadhInput(ext.at) : '', reason_code: ext.reason_code, reason_text: ext.reason_text })}>
        <KeyValue items={[['الموعد الحالي', fmtDateTime(s.pickup_deadline_at)], ['أقصى موعد مسموح', fmtDateTime(maxNew)], ['التمديدات المتبقية', String(s.extensions_remaining)]]} />
        <Field label={`الموعد الجديد (${RIYADH_NOTE})`} required>
          {(fid) => <Input id={fid} type="datetime-local" dir="ltr" value={ext.at} min={s.pickup_deadline_at ? toRiyadhInput(s.pickup_deadline_at) : undefined} max={maxNew ? toRiyadhInput(maxNew) : undefined} onChange={(e) => setExt({ ...ext, at: e.target.value })} />}
        </Field>
        <Field label="السبب" required>
          {(fid) => <Select id={fid} value={ext.reason_code} onChange={(e) => setExt({ ...ext, reason_code: e.target.value })}>{EXTENSION_REASONS.map((r) => <option key={r} value={r}>{EXTENSION_REASON_LABELS[r]}</option>)}</Select>}
        </Field>
        <Field label="الوصف (10–500 حرف)" required>{(fid) => <Textarea id={fid} value={ext.reason_text} onChange={(e) => setExt({ ...ext, reason_text: e.target.value })} />}</Field>
        <Notice>سيُبلَّغ المصنع والناقل. لا تتطلب موافقة المصنع. سيُطلب من الناقل تأكيد جاهزيته، وإن لم يؤكد سيُسند ناقل بديل مع بقاء الموعد الجديد.</Notice>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'decline'} onClose={() => setDialog(null)} danger title="الاعتذار عن الموعد الجديد" confirmLabel="تأكيد الاعتذار" loading={reconfirm.isPending} error={reconfirm.error}
        onConfirm={() => reconfirm.mutate({ decision: 'DECLINE', reason: note })}>
        <Notice tone="danger" icon="alert">سيُحرر إسنادك لهذه الشحنة ويُبحث عن ناقل بديل.</Notice>
        <Field label="السبب" required>{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'pickup'} onClose={() => setDialog(null)} title="تسجيل الاستلام من المنجم" confirmLabel="تأكيد الاستلام" loading={pickup.isPending} error={pickup.error}
        onConfirm={() => pickup.mutate({ loaded_tons: tons || null, note: note || null })}>
        <Field label="الكمية المحمّلة (طن، اختياري)">{(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={tons} onChange={(e) => setTons(e.target.value)} />}</Field>
        <Field label="ملاحظة">{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'receipt'} onClose={() => setDialog(null)} title="تأكيد استلام المادة" confirmLabel="تأكيد الاستلام وإغلاق الصفقة" loading={receipt.isPending} error={receipt.error}
        onConfirm={() => receipt.mutate({ received_tons: tons || null, note: note || null })}>
        <Field label="الكمية المستلمة (طن، اختياري)">{(fid) => <Input id={fid} dir="ltr" inputMode="decimal" value={tons} onChange={(e) => setTons(e.target.value)} />}</Field>
        <Field label="ملاحظة اختلاف (اختياري)">{(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </ConfirmDialog>
    </>
  );
}
