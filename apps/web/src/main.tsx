import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { AppLayout } from './components/Layout';
import { ToastProvider } from './components/toast';
import { EmptyState, Skeleton } from './components/ui';
import { ApiError } from './lib/api';
import { OrganizationPage, NotificationsPage } from './pages/account';
import { AdminHomePage, AdminOrganizationPage, AdminOrganizationsPage, AuditPage, CategoriesPage, PolicyPage } from './pages/admin';
import { CarrierSetupPage, NearbyMinesPage, OpportunitiesPage, OpportunityPage } from './pages/carrier';
import { DashboardPage } from './pages/dashboard';
import { DealDetailPage, DealsPage } from './pages/deals';
import { InvoicePage, ShipmentPage, ShipmentsPage } from './pages/fulfillment';
import { ListingDetailPage, ListingFormPage, MyListingsPage, SearchPage } from './pages/listings';
import { OfferDetailPage, OffersPage } from './pages/offers';
import { homeFor, LandingPage, LoginPage, OrgSetupPage, RegisterPage } from './pages/public';
import { SitesPage } from './pages/sites';
import './styles.css';
import type { AppRole } from '@maknaz/shared';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
});

/** Client-side route guard for UX only; every rule is enforced again by the API (UX-AC3). */
function Guard({ roles, children }: { roles?: AppRole[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-8"><Skeleton /></div>;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.app_role) return <Navigate to="/setup" replace />;
  if (roles && !roles.includes(me.app_role)) return <EmptyState icon="shield" title="هذه الصفحة غير متاحة لدورك" />;
  return <>{children}</>;
}

function Home() {
  const { me, loading } = useAuth();
  if (loading) return null;
  return me ? <Navigate to={homeFor(me.app_role)} replace /> : <LandingPage />;
}

const g = (el: ReactNode, roles?: AppRole[]) => <Guard roles={roles}>{el}</Guard>;
const parties: AppRole[] = ['MINE', 'FACTORY', 'CARRIER', 'ADMIN'];

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/setup" element={<OrgSetupPage />} />
      <Route element={<Guard><AppLayout /></Guard>}>
        <Route path="/dashboard" element={g(<DashboardPage />, ['MINE', 'FACTORY', 'CARRIER'])} />
        <Route path="/organization" element={g(<OrganizationPage />, ['MINE', 'FACTORY', 'CARRIER'])} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/mines" element={g(<SitesPage kind="mine" />, ['MINE'])} />
        <Route path="/sites" element={g(<SitesPage kind="factory" />, ['FACTORY'])} />
        <Route path="/listings" element={g(<MyListingsPage />, ['MINE'])} />
        <Route path="/listings/new" element={g(<ListingFormPage />, ['MINE'])} />
        <Route path="/listings/:id/edit" element={g(<ListingFormPage />, ['MINE'])} />
        <Route path="/listings/:id" element={g(<ListingDetailPage />, parties)} />
        <Route path="/search" element={g(<SearchPage />, ['FACTORY'])} />
        <Route path="/offers" element={g(<OffersPage />, ['MINE', 'FACTORY'])} />
        <Route path="/offers/:id" element={g(<OfferDetailPage />, ['MINE', 'FACTORY', 'ADMIN'])} />
        <Route path="/deals" element={g(<DealsPage />, ['MINE', 'FACTORY', 'CARRIER'])} />
        <Route path="/deals/:id" element={g(<DealDetailPage />, parties)} />
        <Route path="/invoices/:id" element={g(<InvoicePage />, parties)} />
        <Route path="/shipments" element={g(<ShipmentsPage />, ['MINE', 'FACTORY', 'CARRIER'])} />
        <Route path="/shipments/:id" element={g(<ShipmentPage />, parties)} />
        <Route path="/carrier/setup" element={g(<CarrierSetupPage />, ['CARRIER'])} />
        <Route path="/carrier/opportunities" element={g(<OpportunitiesPage />, ['CARRIER'])} />
        <Route path="/carrier/opportunities/:dealId" element={g(<OpportunityPage />, ['CARRIER'])} />
        <Route path="/carrier/nearby" element={g(<NearbyMinesPage />, ['CARRIER'])} />
        <Route path="/admin" element={g(<AdminHomePage />, ['ADMIN'])} />
        <Route path="/admin/organizations" element={g(<AdminOrganizationsPage />, ['ADMIN'])} />
        <Route path="/admin/organizations/:id" element={g(<AdminOrganizationPage />, ['ADMIN'])} />
        <Route path="/admin/deals" element={g(<DealsPage admin />, ['ADMIN'])} />
        <Route path="/admin/deals/:id" element={g(<DealDetailPage />, ['ADMIN'])} />
        <Route path="/admin/audit" element={g(<AuditPage />, ['ADMIN'])} />
        <Route path="/admin/categories" element={g(<CategoriesPage />, ['ADMIN'])} />
        <Route path="/admin/policy" element={g(<PolicyPage />, ['ADMIN'])} />
        <Route path="*" element={<EmptyState icon="help" title="الصفحة غير موجودة" />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
