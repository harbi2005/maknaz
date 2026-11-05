import {
  LICENSE_REVIEW_LABELS,
  LICENSE_TYPE_LABELS,
  LICENSE_TYPES,
  MEMBER_ROLE_LABELS,
  ORG_TYPE_LABELS,
  REGION_CODES,
  REGION_LABELS,
  type LicenseDto,
  type MemberDto,
  type OrganizationDto,
} from '@maknaz/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth, useOrg } from '../auth';
import { Icon } from '../components/icons';
import { Button, Card, cx, EmptyState, ErrorNote, ErrorState, Field, Input, KeyValue, Notice, PageHeader, Select, Skeleton, StatusChip } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

/** SCR-ORG-02: profile, members, declared licenses. */
export function OrganizationPage() {
  const { org, isOwner, role } = useOrg();
  const { refresh } = useAuth();
  const id = org?.id;
  const o = useApi<OrganizationDto>(['org', id], id ? `/organizations/${id}` : null);
  const members = useApi<{ data: MemberDto[] }>(['members', id], id ? `/organizations/${id}/members` : null);
  const licenses = useApi<{ data: LicenseDto[] }>(['licenses', id], id && (role === 'MINE' || role === 'CARRIER') ? `/organizations/${id}/licenses` : null);
  const [tab, setTab] = useState<'profile' | 'members' | 'licenses'>('profile');
  const [edit, setEdit] = useState<Partial<OrganizationDto> | null>(null);
  const [newMember, setNewMember] = useState('');
  const [lic, setLic] = useState({ license_type: 'COMMERCIAL_TRANSPORT', license_number: '', issuing_authority: '', expires_on: '' });
  const save = useAction((b: object) => api(`/organizations/${id}`, { method: 'PATCH', body: b }), { success: 'حُفظ ملف الجهة', invalidate: [['org', id]], onSuccess: () => { setEdit(null); void refresh(); } });
  const addM = useAction((b: object) => api(`/organizations/${id}/members`, { method: 'POST', body: b }), { success: 'أُضيف العضو', invalidate: [['members', id]], onSuccess: () => setNewMember('') });
  const removeM = useAction((mid: string) => api(`/organizations/${id}/members/${mid}`, { method: 'DELETE' }), { success: 'أُزيل العضو', invalidate: [['members', id]] });
  const addL = useAction((b: object) => api(`/organizations/${id}/licenses`, { method: 'POST', body: b }), { success: 'أُضيف الترخيص', invalidate: [['licenses', id]], onSuccess: () => setLic({ ...lic, license_number: '', issuing_authority: '', expires_on: '' }) });

  if (!org) return <EmptyState title="لا توجد جهة" action={<Link to="/setup" className="underline">أنشئ جهتك</Link>} />;
  if (o.isLoading) return <Skeleton />;
  if (o.error || !o.data) return <ErrorState error={o.error} />;
  const d = o.data;
  const tabs = [['profile', 'البيانات'], ['members', 'الأعضاء'], ...(role === 'MINE' || role === 'CARRIER' ? [['licenses', 'التراخيص المصرّح بها']] : [])] as [typeof tab, string][];

  return (
    <>
      <PageHeader title={d.legal_name_ar} subtitle={ORG_TYPE_LABELS[d.type]} actions={<StatusChip kind="org" status={d.status} />} />
      {d.status_reason && <div className="mb-4"><Notice tone="danger">السبب: {d.status_reason}</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={cx('min-h-10 rounded-lg px-4', tab === k ? 'bg-charcoal text-paper' : 'border border-line')}>{l}</button>)}</div>
      {tab === 'profile' && (
        <Card action={isOwner && d.status !== 'REJECTED' && !edit ? <Button variant="ghost" icon="pen" onClick={() => setEdit({ ...d })}>تعديل</Button> : undefined}>
          {edit ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم العربي">{(fid) => <Input id={fid} value={edit.legal_name_ar ?? ''} onChange={(e) => setEdit({ ...edit, legal_name_ar: e.target.value })} />}</Field>
                <Field label="الاسم الإنجليزي">{(fid) => <Input id={fid} dir="ltr" value={edit.legal_name_en ?? ''} onChange={(e) => setEdit({ ...edit, legal_name_en: e.target.value })} />}</Field>
                <Field label="المدينة">{(fid) => <Input id={fid} value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />}</Field>
                <Field label="المنطقة">{(fid) => <Select id={fid} value={edit.region_code} onChange={(e) => setEdit({ ...edit, region_code: e.target.value as OrganizationDto['region_code'] })}>{REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</Select>}</Field>
                <Field label="البريد">{(fid) => <Input id={fid} dir="ltr" value={edit.contact_email ?? ''} onChange={(e) => setEdit({ ...edit, contact_email: e.target.value })} />}</Field>
                <Field label="الهاتف">{(fid) => <Input id={fid} dir="ltr" value={edit.contact_phone ?? ''} onChange={(e) => setEdit({ ...edit, contact_phone: e.target.value })} />}</Field>
              </div>
              {save.error ? <ErrorNote error={save.error} /> : null}
              <div className="flex gap-2"><Button loading={save.isPending} onClick={() => save.mutate({ legal_name_ar: edit.legal_name_ar, legal_name_en: edit.legal_name_en || null, city: edit.city, region_code: edit.region_code, contact_email: edit.contact_email, contact_phone: edit.contact_phone })}>حفظ</Button><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
            </div>
          ) : (
            <KeyValue items={[
              ['النوع', `${ORG_TYPE_LABELS[d.type]} (لا يتغير)`],
              ['رقم السجل التجاري', <bdi className="ltr">{d.commercial_registration_no}</bdi>],
              ['المدينة والمنطقة', `${d.city} — ${REGION_LABELS[d.region_code]}`],
              ['البريد', <bdi className="ltr">{d.contact_email}</bdi>],
              ['الهاتف', <bdi className="ltr">{d.contact_phone}</bdi>],
              ['تاريخ التسجيل', fmtDate(d.created_at)],
            ]} />
          )}
        </Card>
      )}
      {tab === 'members' && (
        <Card>
          <ul className="divide-y divide-line">
            {members.data?.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{m.full_name}</div><div className="text-sm text-muted ltr">{m.email}</div></div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{MEMBER_ROLE_LABELS[m.role]}</span>
                  {isOwner && m.role !== 'OWNER' && <Button variant="ghost" onClick={() => removeM.mutate(m.id)} loading={removeM.isPending}>إزالة</Button>}
                </div>
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <p className="text-sm text-muted">يُضاف العضو بعد إنشائه حسابًا على المنصة، بدور «عضو».</p>
              <div className="flex flex-wrap gap-2">
                <Input aria-label="بريد العضو" dir="ltr" placeholder="email@example.com" className="max-w-sm" value={newMember} onChange={(e) => setNewMember(e.target.value)} />
                <Button icon="plus" loading={addM.isPending} onClick={() => addM.mutate({ email: newMember })}>إضافة</Button>
              </div>
              {addM.error ? <ErrorNote error={addM.error} /> : null}
            </div>
          )}
        </Card>
      )}
      {tab === 'licenses' && (
        <Card>
          <Notice tone="warning" icon="shield">المنصة لا تمنح إذنًا نظاميًا؛ التراخيص تصريح ذاتي تراجعه الإدارة مراجعة شكلية.</Notice>
          <ul className="mt-3 divide-y divide-line">
            {licenses.data?.data.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{LICENSE_TYPE_LABELS[l.license_type]} · <bdi className="ltr">{l.license_number}</bdi> · {l.issuing_authority}{l.expires_on ? ` · ينتهي ${fmtDate(l.expires_on)}` : ''}</span>
                <span className="text-sm text-muted">{LICENSE_REVIEW_LABELS[l.review_status]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Select aria-label="نوع الترخيص" value={lic.license_type} onChange={(e) => setLic({ ...lic, license_type: e.target.value })}>{LICENSE_TYPES.map((t) => <option key={t} value={t}>{LICENSE_TYPE_LABELS[t]}</option>)}</Select>
            <Input aria-label="رقم الترخيص" placeholder="رقم الترخيص" value={lic.license_number} onChange={(e) => setLic({ ...lic, license_number: e.target.value })} />
            <Input aria-label="جهة الإصدار" placeholder="جهة الإصدار" value={lic.issuing_authority} onChange={(e) => setLic({ ...lic, issuing_authority: e.target.value })} />
            <Input aria-label="تاريخ الانتهاء" type="date" dir="ltr" value={lic.expires_on} onChange={(e) => setLic({ ...lic, expires_on: e.target.value })} />
          </div>
          {addL.error ? <ErrorNote error={addL.error} /> : null}
          <Button className="mt-3" icon="plus" loading={addL.isPending} onClick={() => addL.mutate({ ...lic, expires_on: lic.expires_on || null })}>إضافة ترخيص</Button>
        </Card>
      )}
    </>
  );
}

interface Note { id: string; event_type: string; title_ar: string; body_ar: string; link_path: string | null; is_read: boolean; created_at: string }

export function NotificationsPage() {
  const q = useApi<{ data: Note[] }>(['notifications'], '/notifications');
  const readAll = useAction(() => api('/notifications/read-all', { method: 'POST' }), { invalidate: [['notifications'], ['unread']] });
  const readOne = useAction((nid: string) => api(`/notifications/${nid}/read`, { method: 'POST' }), { invalidate: [['notifications'], ['unread']] });
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} />;
  const groups = new Map<string, Note[]>();
  for (const n of q.data?.data ?? []) {
    const k = fmtDate(n.created_at);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return (
    <>
      <PageHeader title="الإشعارات" actions={<Button variant="ghost" icon="check" onClick={() => readAll.mutate(undefined)}>تعليم الكل كمقروء</Button>} />
      {!q.data?.data.length ? <EmptyState icon="bell" title="لا توجد إشعارات" /> : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, items]) => (
            <Card key={day} title={day}>
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id} className={cx('flex items-start gap-3 py-3', !n.is_read && 'font-medium')}>
                    <Icon name="bell" className={cx('mt-1 size-4 shrink-0', n.is_read ? 'text-muted' : 'text-copper')} />
                    <div className="min-w-0 flex-1">
                      {n.link_path ? <Link to={n.link_path} onClick={() => !n.is_read && readOne.mutate(n.id)} className="hover:underline">{n.title_ar}</Link> : n.title_ar}
                      <div className="text-sm font-normal text-muted">{n.body_ar}</div>
                      <div className="text-xs text-muted">{fmtDateTime(n.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
