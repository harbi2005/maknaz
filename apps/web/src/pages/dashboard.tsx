import type { Money } from '@maknaz/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Card, DeadlineTimer, EmptyState, ErrorState, MoneyText, Notice, PageHeader, Skeleton, Stat, StatusChip } from '../components/ui';
import { fmtTons } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Deal, Listing, Offer, Opportunity } from '../types';

interface Task {
  key: string;
  icon: IconName;
  title: ReactNode;
  meta?: ReactNode;
  deadline?: string | null;
  to: string;
  cta: string;
}

/** "What needs your attention": one list, one button per item (UX simplification). */
function TaskList({ tasks, empty }: { tasks: Task[]; empty: ReactNode }) {
  if (tasks.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <li key={t.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-copper/15 text-copper-dark">
              <Icon name={t.icon} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{t.title}</div>
              {t.meta && <div className="text-sm text-muted">{t.meta}</div>}
              {t.deadline && (
                <div className="mt-1">
                  <DeadlineTimer at={t.deadline} />
                </div>
              )}
            </div>
          </div>
          <Link to={t.to} className="inline-flex min-h-11 items-center rounded-lg bg-copper px-4 font-bold text-charcoal">
            {t.cta}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { me } = useAuth();
  const role = me?.app_role;
  return (
    <>
      <PageHeader title={`أهلًا ${me?.user.full_name ?? ''}`} subtitle="ما يحتاج انتباهك الآن." />
      {role === 'MINE' && <MineDashboard />}
      {role === 'FACTORY' && <FactoryDashboard />}
      {role === 'CARRIER' && <CarrierDashboard />}
    </>
  );
}

function useDeals() {
  return useApi<{ data: Deal[] }>(['deals', 'active'], '/deals?filter[group]=active');
}

function MineDashboard() {
  const offers = useApi<{ data: Offer[] }>(['offers', 'open'], '/offers?filter[open]=true');
  const deals = useDeals();
  const listings = useApi<{ data: Listing[] }>(['listings', 'own'], '/material-listings?filter[own]=true');
  if (offers.isLoading || deals.isLoading || listings.isLoading) return <Skeleton />;
  if (offers.error || deals.error) return <ErrorState error={offers.error ?? deals.error} onRetry={() => { void offers.refetch(); void deals.refetch(); }} />;

  const tasks: Task[] = [];
  for (const o of offers.data?.data ?? []) {
    if (o.status === 'SUBMITTED') {
      tasks.push({ key: o.id, icon: 'handshake', title: `عرض شراء من ${o.factory.name_ar}`, meta: `${o.listing.title} · ${fmtTons(o.current_round.quantity_tons)} · ${o.current_round.unit_price.display} ر.س/طن`, deadline: o.current_round.expires_at, to: `/offers/${o.id}`, cta: 'رد على العرض' });
    }
  }
  for (const d of deals.data?.data ?? []) {
    if (d.shipment?.status === 'SCHEDULED') tasks.push({ key: d.id, icon: 'mine', title: `جهّز الشحنة ${d.reference}`, meta: `${d.material.title} · ${fmtTons(d.commercial.quantity_tons)}`, deadline: d.shipment.pickup_deadline_at, to: `/shipments/${d.shipment.id}`, cta: 'جاهز / تمديد' });
  }
  const all = listings.data?.data ?? [];
  const sum = (k: 'available' | 'reserved' | 'sold') => all.reduce((s, l) => s + Number(l.quantity[k]), 0);
  const low = all.filter((l) => l.status === 'ACTIVE' && Number(l.quantity.available) < Number(l.quantity.total) * 0.1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon="layers" label="الكمية المتاحة" value={fmtTons(sum('available'))} />
        <Stat icon="clock" label="المحجوزة" value={fmtTons(sum('reserved'))} />
        <Stat icon="check" label="المباعة" value={fmtTons(sum('sold'))} />
      </div>
      <Card title="بانتظارك">
        <TaskList
          tasks={tasks}
          empty={<EmptyState icon="check" title="لا شيء ينتظرك الآن" text="ستظهر هنا عروض الشراء الواردة والشحنات التي تحتاج تجهيزًا." action={<Link to="/listings/new" className="font-semibold text-copper-dark underline">أضف مادة جديدة</Link>} />}
        />
      </Card>
      {low.length > 0 && (
        <Notice tone="warning">
          مواد كميتها المتاحة منخفضة: {low.map((l) => l.title).join('، ')}.
        </Notice>
      )}
      <DealsMini deals={deals.data?.data ?? []} />
    </div>
  );
}

function FactoryDashboard() {
  const offers = useApi<{ data: Offer[] }>(['offers', 'open'], '/offers?filter[open]=true');
  const deals = useDeals();
  const done = useApi<{ data: Deal[] }>(['deals', 'completed'], '/deals?filter[group]=completed');
  if (offers.isLoading || deals.isLoading) return <Skeleton />;
  if (offers.error || deals.error) return <ErrorState error={offers.error ?? deals.error} />;

  const tasks: Task[] = [];
  for (const o of offers.data?.data ?? []) {
    if (o.status === 'COUNTERED') tasks.push({ key: o.id, icon: 'handshake', title: `عرض مقابل من ${o.mine_org.name_ar}`, meta: `${o.listing.title} · ${o.current_round.unit_price.display} ر.س/طن`, deadline: o.current_round.expires_at, to: `/offers/${o.id}`, cta: 'راجع العرض' });
  }
  for (const d of deals.data?.data ?? []) {
    if (d.actions.can_select_quote && d.quotes_summary.submitted > 0) tasks.push({ key: `${d.id}-q`, icon: 'truck', title: `${d.quotes_summary.submitted} عرض نقل على ${d.reference}`, meta: 'قارن واختر ناقلًا', deadline: d.deadlines.next?.at, to: `/deals/${d.id}`, cta: 'اختر الناقل' });
    if (d.actions.can_pay) tasks.push({ key: `${d.id}-p`, icon: 'receipt', title: `فاتورة بانتظار الدفع (محاكاة) ${d.reference}`, meta: <MoneyText m={d.grand_total} />, deadline: d.deadlines.payment_deadline_at, to: `/invoices/${d.invoice!.id}`, cta: 'ادفع (محاكاة)' });
    if (d.invoice?.pending_adjustment) tasks.push({ key: `${d.id}-a`, icon: 'receipt', title: `فرق سعر نقل بعد إعادة الإسناد ${d.reference}`, to: `/invoices/${d.invoice.id}`, cta: 'ادفع الفرق' });
    if (d.shipment?.status === 'DELIVERED') tasks.push({ key: `${d.id}-r`, icon: 'check', title: `وصلت الشحنة ${d.reference}`, meta: 'أكد الاستلام لإغلاق الصفقة', to: `/shipments/${d.shipment.id}`, cta: 'تأكيد الاستلام' });
  }
  const completed = done.data?.data ?? [];
  const tons = completed.reduce((s, d) => s + Number(d.commercial.quantity_tons), 0);
  const total = completed.reduce((s, d) => s + (d.grand_total?.amount_halalas ?? 0), 0);
  const perTon: Money | null = tons > 0 ? { amount_halalas: Math.round(total / tons), currency: 'SAR', display: (total / tons / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon="handshake" label="عروض بانتظار رد المنجم" value={(offers.data?.data ?? []).filter((o) => o.status === 'SUBMITTED').length} />
        <Stat icon="check" label="أطنان مستلمة" value={fmtTons(tons)} hint="من بياناتك على المنصة" />
        <Stat icon="chart" label="متوسط تكلفة الطن واصلًا" value={perTon ? <MoneyText m={perTon} /> : '—'} hint="من بياناتك على المنصة" />
      </div>
      <Card title="بانتظارك">
        <TaskList
          tasks={tasks}
          empty={<EmptyState icon="search" title="ابدأ باستكشاف المواد المتاحة" text="ابحث عن مواد قريبة من مصنعك وقدّم عرض شراء." action={<Link to="/search" className="inline-flex min-h-11 items-center rounded-lg bg-copper px-4 font-bold text-charcoal">ابحث عن مواد</Link>} />}
        />
      </Card>
      <DealsMini deals={deals.data?.data ?? []} />
    </div>
  );
}

function CarrierDashboard() {
  const opps = useApi<{ data: Opportunity[]; has_active_pricing: boolean }>(['opportunities'], '/carrier/opportunities');
  const deals = useDeals();
  if (opps.isLoading || deals.isLoading) return <Skeleton />;
  if (opps.error) return <ErrorState error={opps.error} />;
  const tasks: Task[] = [];
  for (const d of deals.data?.data ?? []) {
    const s = d.shipment;
    if (!s) continue;
    if (s.status === 'RECONFIRM_REQUIRED') tasks.push({ key: d.id, icon: 'alert', title: `إعادة تأكيد مطلوبة ${d.reference}`, meta: 'مدد المنجم موعد الاستلام', deadline: d.deadlines.next?.at, to: `/shipments/${s.id}`, cta: 'أكد أو اعتذر' });
    if (['SCHEDULED', 'READY_FOR_PICKUP'].includes(s.status)) tasks.push({ key: d.id, icon: 'truck', title: `استلام من ${d.route.mine.name}`, meta: `${fmtTons(d.commercial.quantity_tons)} · ${s.status === 'READY_FOR_PICKUP' ? 'المادة جاهزة' : 'مجدولة'}`, deadline: s.pickup_deadline_at, to: `/shipments/${s.id}`, cta: 'تحديث الشحنة' });
    if (['PICKED_UP', 'IN_TRANSIT', 'DELAYED'].includes(s.status)) tasks.push({ key: d.id, icon: 'truck', title: `شحنة ${d.reference}`, meta: <StatusChip kind="shipment" status={s.status} />, to: `/shipments/${s.id}`, cta: 'تحديث الحالة' });
  }
  const fresh = (opps.data?.data ?? []).filter((o) => !o.my_quote);
  return (
    <div className="space-y-5">
      {!opps.data?.has_active_pricing && (
        <Notice tone="warning">
          لن تظهر لك فرص حتى تفعّل قاعدة تسعير. <Link to="/carrier/setup" className="underline">أعدّ خدماتك وتسعيرك</Link>
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon="truck" label="فرص جديدة" value={fresh.length} />
        <Stat icon="doc" label="عروضي المعلقة" value={(opps.data?.data ?? []).filter((o) => o.my_quote?.status === 'SUBMITTED').length} />
        <Stat icon="list" label="شحنات نشطة" value={(deals.data?.data ?? []).length} />
      </div>
      <Card title="بانتظارك">
        <TaskList
          tasks={[
            ...tasks,
            ...fresh.slice(0, 5).map((o) => ({ key: `o-${o.deal_id}`, icon: 'truck' as IconName, title: `فرصة شحن ${o.reference} (${o.distance_band})`, meta: `${o.material.title} · ${fmtTons(o.quantity_tons)}`, deadline: o.deadline_at, to: `/carrier/opportunities/${o.deal_id}`, cta: 'قدّم عرضك' })),
          ]}
          empty={<EmptyState icon="truck" title="لا توجد فرص شحن حاليًا" text="تظهر الفرص عندما يتفق منجم ومصنع في مناطق خدمتك." />}
        />
      </Card>
    </div>
  );
}

function DealsMini({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;
  return (
    <Card title="الصفقات النشطة" action={<Link to="/deals" className="text-sm text-copper-dark underline">كل الصفقات</Link>}>
      <ul className="divide-y divide-line">
        {deals.slice(0, 5).map((d) => (
          <li key={d.id}>
            <Link to={`/deals/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-sand/40">
              <span>
                <bdi className="ltr font-mono text-sm">{d.reference}</bdi> · {d.material.title}
              </span>
              <StatusChip kind="deal" status={d.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
