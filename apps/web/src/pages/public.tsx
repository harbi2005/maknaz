import {
  createOrganizationSchema,
  LOCATION_KIND_LABELS,
  LOCATION_KINDS,
  loginSchema,
  ORG_TYPE_DESCRIPTIONS,
  ORG_TYPE_LABELS,
  ORG_TYPES,
  REGION_CODES,
  REGION_LABELS,
  registerSchema,
  type OrgType,
} from '@maknaz/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import lockup from '@brand/logo/logo_lockup_on_dark.png';
import logoDark from '@brand/logo/logo_wordmark_dark.png';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { AuthShell } from '../components/Layout';
import { LocationPicker } from '../components/map';
import { Button, Card, Checkbox, cx, ErrorNote, Field, Input, Notice, Select } from '../components/ui';
import { api, ApiError, fieldErrorMap, setCsrf } from '../lib/api';

export function homeFor(role: string | null | undefined): string {
  if (role === 'ADMIN') return '/admin';
  if (!role) return '/setup';
  return '/dashboard';
}

export function LandingPage() {
  const { me } = useAuth();
  if (me) return <Navigate to={homeFor(me.app_role)} replace />;
  const steps: [IconName, string, string][] = [
    ['mine', 'المنجم يعرض المادة', 'كمية ومواصفات موسومة بمستوى التحقق ووثائق المختبر.'],
    ['factory', 'المصنع يفاوض', 'عرض شراء، ورد واحد من المنجم: قبول أو رفض أو عرض مقابل.'],
    ['truck', 'الناقل يؤكد', 'عروض نقل ملزمة محسوبة من تسعير الناقل، والمصنع يختار.'],
    ['receipt', 'الدفع والشحن', 'فاتورة ودفع بالمحاكاة، ثم جدولة الشحنة وتتبعها حتى الاستلام.'],
  ];
  return (
    <div className="min-h-screen">
      <section className="bg-charcoal text-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 lg:flex-row lg:items-center lg:px-8 lg:py-20">
          <div className="flex-1 space-y-6">
            <img src={lockup} alt="مَكْنَز MAKNAZ" className="h-20 w-auto" />
            <h1 className="text-3xl leading-snug font-bold lg:text-4xl">من الموارد غير المستغلة، إلى فرص صناعية قابلة للتقييم.</h1>
            <p className="max-w-xl text-lg text-paper/80">
              منصة تربط المناجم بالمصانع وشركات النقل: عرض المواد، التفاوض، تأكيد الناقل، ثم الدفع والشحن في مسار واحد واضح.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="inline-flex min-h-11 items-center rounded-lg bg-copper px-5 font-bold text-charcoal">
                أنشئ حسابًا
              </Link>
              <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg border border-paper/30 px-5 font-semibold">
                تسجيل الدخول
              </Link>
            </div>
            <p className="text-sm tracking-[0.3em] text-gray-dark ltr">HIDDEN RESOURCES. NEW VALUE.</p>
          </div>
          <div className="brand-pattern flex-1 rounded-card border border-white/10 p-6">
            <ol className="space-y-4">
              {steps.map(([icon, title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-copper/20 text-copper">
                    <Icon name={icon} />
                  </span>
                  <div>
                    <div className="font-semibold">
                      {i + 1}. {title}
                    </div>
                    <div className="text-sm text-paper/70">{text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
        <Notice tone="copper" icon="flask">
          نسخة عرض أولية: كل المدفوعات والفواتير محاكاة ولا تُحوَّل أي أموال. المنصة لا تتحقق من محتوى تقارير المختبر ولا تحكم بصلاحية المواد.
        </Notice>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={homeFor(me.app_role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = loginSchema.safeParse(form);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ csrf_token: string }>('/auth/login', { method: 'POST', body: r.data });
      setCsrf(res.csrf_token);
      await refresh();
      nav('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-xl font-bold">تسجيل الدخول</h1>
      <p className="mb-5 text-sm text-muted">ادخل إلى حساب جهتك في مَكْنَز.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="البريد الإلكتروني" error={errors.email} required>
          {(id) => <Input id={id} type="email" autoComplete="email" dir="ltr" value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="كلمة المرور" error={errors.password} required>
          {(id) => <Input id={id} type="password" autoComplete="current-password" dir="ltr" value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        {error ? <ErrorNote error={error} /> : null}
        <Button type="submit" loading={busy} className="w-full">
          دخول
        </Button>
      </form>
      <p className="mt-5 text-center text-sm">
        ليس لديك حساب؟{' '}
        <Link to="/register" className="font-semibold text-copper-dark underline">
          أنشئ حسابًا
        </Link>
      </p>
    </AuthShell>
  );
}

function passwordStrength(p: string): [number, string] {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return [s, ['ضعيفة جدًا', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'][s]!];
}

export function RegisterPage() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={homeFor(me.app_role)} replace />;
  const [score, label] = passwordStrength(form.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = registerSchema.safeParse(form);
    const errs: Record<string, string> = r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (form.password !== form.confirm) errs.confirm = 'كلمتا المرور غير متطابقتين';
    if (!form.terms) errs.terms = 'يلزم الموافقة على شروط الاستخدام';
    setErrors(errs);
    if (Object.keys(errs).length || !r.success) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ csrf_token: string }>('/auth/register', { method: 'POST', body: r.data });
      setCsrf(res.csrf_token);
      await refresh();
      nav('/setup', { replace: true });
    } catch (err) {
      setError(err);
      setErrors(fieldErrorMap(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-xl font-bold">إنشاء حساب</h1>
      <p className="mb-5 text-sm text-muted">بعد إنشاء الحساب تسجّل جهتك (منجم أو مصنع أو ناقل).</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="الاسم الكامل" error={errors.full_name} required>
          {(id) => <Input id={id} autoComplete="name" value={form.full_name} invalid={!!errors.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}
        </Field>
        <Field label="البريد الإلكتروني" error={errors.email} required>
          {(id) => <Input id={id} type="email" dir="ltr" autoComplete="email" value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="كلمة المرور" error={errors.password} hint="10 أحرف على الأقل" required>
          {(id) => (
            <>
              <Input id={id} type="password" dir="ltr" autoComplete="new-password" value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              {form.password && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <div className="flex h-1.5 flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cx('flex-1 rounded', i < score ? 'bg-copper' : 'bg-line')} />
                    ))}
                  </div>
                  {label}
                </div>
              )}
            </>
          )}
        </Field>
        <Field label="تأكيد كلمة المرور" error={errors.confirm} required>
          {(id) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" value={form.confirm} invalid={!!errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </Field>
        <div>
          <Checkbox label="أوافق على شروط استخدام النسخة التجريبية" checked={form.terms} onChange={(v) => setForm({ ...form, terms: v })} />
          {errors.terms && <p className="text-sm text-danger">{errors.terms}</p>}
        </div>
        {error ? <ErrorNote error={error} /> : null}
        <Button type="submit" loading={busy} className="w-full">
          إنشاء الحساب
        </Button>
      </form>
      <p className="mt-5 text-center text-sm">
        لديك حساب؟{' '}
        <Link to="/login" className="font-semibold text-copper-dark underline">
          سجّل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}

const TYPE_ICONS: Record<OrgType, IconName> = { MINE: 'mine', FACTORY: 'factory', CARRIER: 'truck' };
const SITE_TITLES: Record<OrgType, string> = { MINE: 'موقع المنجم الأول', FACTORY: 'موقع المصنع (موقع التسليم)', CARRIER: 'موقع انطلاق الأسطول' };

/** SCR-ORG-01, simplified into two steps: type, then one form with details and first location. */
export function OrgSetupPage() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [type, setType] = useState<OrgType | null>(null);
  const [form, setForm] = useState({
    legal_name_ar: '',
    legal_name_en: '',
    commercial_registration_no: '',
    city: '',
    region_code: '',
    contact_email: me?.user.email ?? '',
    contact_phone: '',
  });
  const [site, setSite] = useState<{ name: string; primary_activity: string; location_kind: string; lat: number | ''; lng: number | '' }>({
    name: '',
    primary_activity: '',
    location_kind: 'FLEET_YARD',
    lat: '',
    lng: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <Navigate to="/login" replace />;
  if (me.organization || me.is_platform_admin) return <Navigate to={homeFor(me.app_role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    const payload = { ...form, type, legal_name_en: form.legal_name_en || null };
    const r = createOrganizationSchema.safeParse(payload);
    const errs: Record<string, string> = r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (!site.name.trim()) errs['site.name'] = 'اسم الموقع مطلوب';
    if (type === 'MINE' && !site.primary_activity.trim()) errs['site.primary_activity'] = 'النشاط التعديني مطلوب';
    if (site.lat === '' || site.lng === '') errs['site.lat'] = 'حدد الموقع على الخريطة';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await api('/organizations', {
        method: 'POST',
        body: {
          ...payload,
          first_site: {
            name: site.name,
            region_code: form.region_code,
            lat: site.lat,
            lng: site.lng,
            ...(type === 'MINE' ? { primary_activity: site.primary_activity } : {}),
            ...(type === 'CARRIER' ? { location_kind: site.location_kind } : {}),
          },
        },
      });
      await refresh();
      nav('/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setErrors(fieldErrorMap(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-pattern min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <img src={logoDark} alt="مَكْنَز" className="h-12 w-auto" />
          <span className="text-sm text-muted">الخطوة {type ? 2 : 1} من 2</span>
        </div>
        {!type ? (
          <Card title="ما نوع جهتك؟">
            <p className="mb-4 text-sm text-muted">نوع الجهة لا يتغير بعد التسجيل.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ORG_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex flex-col items-start gap-2 rounded-card border-2 border-line bg-white p-4 text-start hover:border-copper focus-visible:border-copper"
                >
                  <Icon name={TYPE_ICONS[t]} className="size-8 text-copper" />
                  <span className="text-lg font-bold">{ORG_TYPE_LABELS[t]}</span>
                  <span className="text-sm text-muted">{ORG_TYPE_DESCRIPTIONS[t]}</span>
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <Card
              title={`بيانات ${ORG_TYPE_LABELS[type]}`}
              action={
                <button type="button" className="text-sm text-copper-dark underline" onClick={() => setType(null)}>
                  تغيير النوع
                </button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الاسم القانوني بالعربية" error={errors.legal_name_ar} required>
                  {(id) => <Input id={id} value={form.legal_name_ar} invalid={!!errors.legal_name_ar} onChange={(e) => setForm({ ...form, legal_name_ar: e.target.value })} />}
                </Field>
                <Field label="الاسم بالإنجليزية" error={errors.legal_name_en}>
                  {(id) => <Input id={id} dir="ltr" value={form.legal_name_en} onChange={(e) => setForm({ ...form, legal_name_en: e.target.value })} />}
                </Field>
                <Field label="رقم السجل التجاري" error={errors.commercial_registration_no} required>
                  {(id) => <Input id={id} dir="ltr" value={form.commercial_registration_no} invalid={!!errors.commercial_registration_no} onChange={(e) => setForm({ ...form, commercial_registration_no: e.target.value })} />}
                </Field>
                <Field label="المنطقة الإدارية" error={errors.region_code} required>
                  {(id) => (
                    <Select id={id} value={form.region_code} invalid={!!errors.region_code} onChange={(e) => setForm({ ...form, region_code: e.target.value })}>
                      <option value="">اختر المنطقة</option>
                      {REGION_CODES.map((r) => (
                        <option key={r} value={r}>
                          {REGION_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="المدينة" error={errors.city} required>
                  {(id) => <Input id={id} value={form.city} invalid={!!errors.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}
                </Field>
                <Field label="بريد التواصل" error={errors.contact_email} required>
                  {(id) => <Input id={id} type="email" dir="ltr" value={form.contact_email} invalid={!!errors.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />}
                </Field>
                <Field label="هاتف التواصل" error={errors.contact_phone} hint="مثال: ‎+966500000000" required>
                  {(id) => <Input id={id} dir="ltr" inputMode="tel" value={form.contact_phone} invalid={!!errors.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />}
                </Field>
              </div>
            </Card>
            <Card title={SITE_TITLES[type]}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم الموقع" error={errors['site.name']} required>
                  {(id) => <Input id={id} value={site.name} invalid={!!errors['site.name']} onChange={(e) => setSite({ ...site, name: e.target.value })} />}
                </Field>
                {type === 'MINE' && (
                  <Field label="النشاط التعديني الرئيسي" error={errors['site.primary_activity']} required>
                    {(id) => <Input id={id} value={site.primary_activity} invalid={!!errors['site.primary_activity']} onChange={(e) => setSite({ ...site, primary_activity: e.target.value })} />}
                  </Field>
                )}
                {type === 'CARRIER' && (
                  <Field label="نوع الموقع" hint="استخدم موقع انطلاق الأسطول لا المقر الإداري">
                    {(id) => (
                      <Select id={id} value={site.location_kind} onChange={(e) => setSite({ ...site, location_kind: e.target.value })}>
                        {LOCATION_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {LOCATION_KIND_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </div>
              <div className="mt-4">
                <LocationPicker lat={site.lat} lng={site.lng} onChange={(lat, lng) => setSite({ ...site, lat, lng })} />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Input aria-label="خط العرض" dir="ltr" placeholder="Lat" value={site.lat} onChange={(e) => setSite({ ...site, lat: e.target.value === '' ? '' : Number(e.target.value) })} />
                  <Input aria-label="خط الطول" dir="ltr" placeholder="Lng" value={site.lng} onChange={(e) => setSite({ ...site, lng: e.target.value === '' ? '' : Number(e.target.value) })} />
                </div>
                {errors['site.lat'] && <p className="mt-1 text-sm text-danger">{errors['site.lat']}</p>}
              </div>
            </Card>
            {error && !(error instanceof ApiError && error.fieldErrors.length) ? <ErrorNote error={error} /> : null}
            <div className="flex justify-end">
              <Button type="submit" loading={busy}>
                إرسال للمراجعة
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
