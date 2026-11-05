import { ORG_STATUS_LABELS, ORG_TYPE_LABELS, type AppRole } from '@maknaz/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import logoLight from '@brand/logo/logo_wordmark_light.png';
import logoIcon from '@brand/logo/logo_icon.png';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { Icon, type IconName } from './icons';
import { cx, Notice } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  mobile?: boolean;
}

/** Only features that exist for the role appear in navigation (UX-AC3). */
const NAV: Record<AppRole, NavItem[]> = {
  MINE: [
    { to: '/dashboard', label: 'الرئيسية', icon: 'home', mobile: true },
    { to: '/listings', label: 'موادي', icon: 'layers', mobile: true },
    { to: '/offers', label: 'عروض الشراء', icon: 'handshake', mobile: true },
    { to: '/deals', label: 'الصفقات', icon: 'list', mobile: true },
    { to: '/mines', label: 'مناجمي', icon: 'mine' },
  ],
  FACTORY: [
    { to: '/dashboard', label: 'الرئيسية', icon: 'home', mobile: true },
    { to: '/search', label: 'ابحث عن مواد', icon: 'search', mobile: true },
    { to: '/offers', label: 'عروضي', icon: 'handshake', mobile: true },
    { to: '/deals', label: 'الصفقات', icon: 'list', mobile: true },
    { to: '/sites', label: 'مواقع المصنع', icon: 'factory' },
  ],
  CARRIER: [
    { to: '/dashboard', label: 'الرئيسية', icon: 'home', mobile: true },
    { to: '/carrier/opportunities', label: 'فرص الشحن', icon: 'truck', mobile: true },
    { to: '/deals', label: 'شحناتي', icon: 'list', mobile: true },
    { to: '/carrier/setup', label: 'الأسطول والتسعير', icon: 'settings', mobile: true },
    { to: '/carrier/nearby', label: 'مناجم قريبة', icon: 'map' },
  ],
  ADMIN: [
    { to: '/admin', label: 'الإشراف', icon: 'chart', mobile: true },
    { to: '/admin/organizations', label: 'الجهات', icon: 'shield', mobile: true },
    { to: '/admin/deals', label: 'الصفقات', icon: 'list', mobile: true },
    { to: '/admin/audit', label: 'سجل التدقيق', icon: 'doc', mobile: true },
    { to: '/admin/categories', label: 'فئات المواد', icon: 'tag' },
    { to: '/admin/policy', label: 'السياسة السارية', icon: 'clock' },
  ],
};

function useUnread() {
  return useQuery({ queryKey: ['unread'], queryFn: () => api<{ count: number }>('/notifications/unread-count'), refetchInterval: 30_000 });
}

export function AppLayout() {
  const { me, logout } = useAuth();
  const unread = useUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const role = me?.app_role ?? 'FACTORY';
  const items = NAV[role];
  const org = me?.organization;

  return (
    <div className="min-h-screen lg:flex">
      {/* Fixed right sidebar on large screens (UI_UX §1.2). */}
      <aside className="hidden w-64 shrink-0 flex-col bg-charcoal text-paper lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src={logoLight} alt="مَكْنَز MAKNAZ" className="h-10 w-auto" />
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="التنقل الرئيسي">
          {items.map((i) => (
            <SideLink key={i.to} item={i} />
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="font-semibold">{me?.user.full_name}</div>
          <div className="text-gray-dark">{org ? `${ORG_TYPE_LABELS[org.type]} · ${org.legal_name_ar}` : me?.is_platform_admin ? 'إدارة المنصة' : ''}</div>
          <button type="button" onClick={logout} className="mt-3 inline-flex items-center gap-2 text-gray-dark hover:text-paper">
            <Icon name="logout" className="size-4" /> تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <img src={logoIcon} alt="مَكْنَز" className="h-8 w-auto" />
            <span className="font-bold">مَكْنَز</span>
          </div>
          <div className="hidden text-sm text-muted lg:block">{org?.legal_name_ar ?? (me?.is_platform_admin ? 'لوحة إدارة المنصة' : '')}</div>
          <div className="flex items-center gap-1">
            <NavLink to="/notifications" className="relative rounded-lg p-2.5 hover:bg-sand" aria-label="الإشعارات">
              <Icon name="bell" />
              {!!unread.data?.count && (
                <span className="absolute -top-0.5 -start-0.5 min-w-5 rounded-full bg-copper px-1 text-center text-xs font-bold text-charcoal">{unread.data.count}</span>
              )}
            </NavLink>
            {org && (
              <NavLink to="/organization" className="rounded-lg p-2.5 hover:bg-sand" aria-label="ملف الجهة">
                <Icon name="user" />
              </NavLink>
            )}
            <button type="button" className="rounded-lg p-2.5 hover:bg-sand lg:hidden" aria-label="القائمة" onClick={() => setMenuOpen((v) => !v)}>
              <Icon name="menu" />
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="border-b border-line bg-paper px-4 py-2 lg:hidden" onClick={() => setMenuOpen(false)}>
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} className="flex min-h-11 items-center gap-2 rounded px-2">
                <Icon name={i.icon} /> {i.label}
              </NavLink>
            ))}
            <button type="button" onClick={logout} className="flex min-h-11 items-center gap-2 px-2 text-danger">
              <Icon name="logout" /> تسجيل الخروج
            </button>
          </div>
        )}

        <main key={loc.pathname} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-10">
          {org && org.status !== 'ACTIVE' && (
            <div className="mb-5">
              <Notice tone={org.status === 'PENDING_REVIEW' ? 'warning' : 'danger'} icon="shield">
                {org.status === 'PENDING_REVIEW'
                  ? 'جهتك قيد المراجعة من إدارة المنصة. يمكنك إكمال ملفك الآن، وتُفتح الإجراءات التجارية بعد الاعتماد.'
                  : `حالة جهتك: ${ORG_STATUS_LABELS[org.status]}. الإجراءات التجارية متوقفة.`}{' '}
                <NavLink to="/organization" className="underline">
                  ملف الجهة
                </NavLink>
              </Notice>
            </div>
          )}
          <Outlet />
        </main>

        {/* Bottom navigation on phones (UI_UX §1.2, sm). */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-paper sm:hidden" aria-label="التنقل السفلي">
          {items
            .filter((i) => i.mobile)
            .slice(0, 4)
            .map((i) => (
              <NavLink key={i.to} to={i.to} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-xs', isActive ? 'text-copper-dark' : 'text-muted')}>
                <Icon name={i.icon} />
                {i.label}
              </NavLink>
            ))}
        </nav>
      </div>
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin' || item.to === '/dashboard'}
      className={({ isActive }) =>
        cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-base', isActive ? 'bg-copper font-bold text-charcoal' : 'text-paper/85 hover:bg-white/10')
      }
    >
      <Icon name={item.icon} />
      {item.label}
    </NavLink>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="brand-pattern flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <img src={logoIcon} alt="مَكْنَز MAKNAZ" className="h-16 w-auto" />
        </div>
        <div className="rounded-card border border-line bg-paper p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
