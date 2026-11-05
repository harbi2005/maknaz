import { mineSchema, factorySiteSchema, REGION_CODES, REGION_LABELS } from '@maknaz/shared';
import { useState, type FormEvent } from 'react';
import { useOrg } from '../auth';
import { LocationPicker, MapView } from '../components/map';
import { Badge, Button, Card, Dialog, EmptyState, ErrorNote, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '../components/ui';
import { api, fieldErrorMap } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import type { Mine, Site } from '../types';

type Kind = 'mine' | 'factory';

function SiteForm({ kind, initial, onDone, locked }: { kind: Kind; initial?: Mine | Site; onDone: () => void; locked?: boolean }) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    primary_activity: (initial as Mine | undefined)?.primary_activity ?? '',
    region_code: initial?.region_code ?? '',
    address_text: initial?.address_text ?? '',
    lat: (initial?.lat ?? '') as number | '',
    lng: (initial?.lng ?? '') as number | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const path = kind === 'mine' ? '/mines' : '/factory-sites';
  const save = useAction((body: object) => api(initial ? `${path}/${initial.id}` : path, { method: initial ? 'PATCH' : 'POST', body }), {
    success: 'تم حفظ الموقع',
    invalidate: [[kind === 'mine' ? 'mines' : 'sites']],
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...f, address_text: f.address_text || null, ...(kind === 'factory' ? { primary_activity: undefined } : {}) };
    const r = (kind === 'mine' ? mineSchema : factorySiteSchema).safeParse(body);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(r.data as object, { onError: (err) => setErrors(fieldErrorMap(err)) });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم" error={errors.name} required>
          {(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} />}
        </Field>
        {kind === 'mine' && (
          <Field label="النشاط التعديني الرئيسي" error={errors.primary_activity} required>
            {(id) => <Input id={id} value={f.primary_activity} onChange={(e) => setF({ ...f, primary_activity: e.target.value })} invalid={!!errors.primary_activity} />}
          </Field>
        )}
        <Field label="المنطقة الإدارية" error={errors.region_code} required>
          {(id) => (
            <Select id={id} value={f.region_code} onChange={(e) => setF({ ...f, region_code: e.target.value })} invalid={!!errors.region_code}>
              <option value="">اختر المنطقة</option>
              {REGION_CODES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="العنوان">
          {(id) => <Input id={id} value={f.address_text} onChange={(e) => setF({ ...f, address_text: e.target.value })} />}
        </Field>
      </div>
      <LocationPicker lat={f.lat} lng={f.lng} disabled={locked} onChange={(lat, lng) => setF({ ...f, lat, lng })} />
      {locked && <p className="text-sm text-warning">لا يمكن تعديل إحداثيات منجم له صفقات قائمة، لأنها تدخل في حساب المسافات.</p>}
      {(errors.lat || errors.lng) && <p className="text-sm text-danger">حدد الموقع على الخريطة.</p>}
      {save.error ? <ErrorNote error={save.error} /> : null}
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>حفظ</Button>
      </div>
    </form>
  );
}

export function SitesPage({ kind }: { kind: Kind }) {
  const { active } = useOrg();
  const q = useApi<{ data: Mine[] }>([kind === 'mine' ? 'mines' : 'sites'], kind === 'mine' ? '/mines?filter[org]=mine' : '/factory-sites');
  const [editing, setEditing] = useState<Mine | Site | 'new' | null>(null);
  const [locked, setLocked] = useState(false);
  const title = kind === 'mine' ? 'مناجمي' : 'مواقع المصنع';

  async function openEdit(s: Mine) {
    setLocked(false);
    if (kind === 'mine') {
      const full = await api<Mine>(`/mines/${s.id}`).catch(() => null);
      setLocked(!!full?.has_open_deals);
    }
    setEditing(s);
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={kind === 'factory' ? 'مواقع التسليم المستخدمة في عروض الشراء وحساب المسافات.' : undefined}
        actions={<Button icon="plus" onClick={() => setEditing('new')} disabled={kind === 'mine' && !active}>إضافة موقع</Button>}
      />
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.data.length ? (
        <EmptyState icon="pin" title="لا توجد مواقع بعد" action={<Button onClick={() => setEditing('new')}>أضف أول موقع</Button>} />
      ) : (
        <div className="space-y-4">
          <MapView points={q.data.data.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: s.name, kind: kind === 'mine' ? 'mine' : 'factory' }))} height={280} />
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.data.map((s) => (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{s.name}</div>
                    <div className="text-sm text-muted">{REGION_LABELS[s.region_code as keyof typeof REGION_LABELS]}{kind === 'mine' ? ` · ${s.primary_activity}` : ''}</div>
                    {kind === 'mine' && <div className="mt-1 text-sm">مواد منشورة: {s.active_listings}</div>}
                  </div>
                  <Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{s.status === 'ACTIVE' ? 'نشط' : 'موقوف'}</Badge>
                </div>
                <div className="mt-3">
                  <Button variant="ghost" icon="pen" onClick={() => void openEdit(s)}>تعديل</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'موقع جديد' : 'تعديل الموقع'}>
        {editing !== null && <SiteForm kind={kind} initial={editing === 'new' ? undefined : editing} locked={locked} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
