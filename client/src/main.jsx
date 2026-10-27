// Browser entry point: picks the page component for each address (Routes below) and wraps the app
// in the shared providers. The admin bundle is loaded only when a staff member opens the staff address.
import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Router, AppProvider, useRouter, match, useApp } from './lib/core.jsx';
import { Header, Footer, WhatsApp } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { Inventory, CarDetail, PaySmallSmall, Compare } from './pages/Cars.jsx';
import { useApi, slugify, booted } from './lib/core.jsx';
import { bySlug } from '../../server/lib/categories.js';
// The staff address is only known when the page was opened at it (it is not in the site's code)
const ADMIN_PATH = (booted('/config') || {}).adminPath || null;
import { SwapHome, SwapListing, SwapNew } from './pages/Swap.jsx';
import { Account, AuthPage, VerifyEmail, ForgotPassword, ResetPassword } from './pages/Account.jsx';
import { Blog, Post, Page, Faqs, Contact, NotFound } from './pages/Content.jsx';
const Admin = lazy(() => import('./pages/Admin.jsx'));
import { QuickViewProvider } from './components/QuickView.jsx';

// /cars/toyota is a make page; /cars/2018-toyota-camry-se is a single car
function CarOrMake({ slug }) {
  const list = useApi('/cars?limit=100');
  const cars = (list.data && list.data.cars) || [];
  if (list.loading && !cars.length) return <div className="loading">Loading…</div>;
  return cars.some((c) => slugify(c.make) === slug) ? <Inventory makeSlug={slug} /> : <CarDetail slug={slug} />;
}

function Routes() {
  const { path } = useRouter();
  const { cfg } = useApp();
  let m;
  if (path === '/') return <Home />;
  if (path === '/cars') return <Inventory />;
  if ((m = match('/cars/:make/:model', path))) return <Inventory makeSlug={m.make} modelSlug={m.model} />;
  if ((m = match('/cars/:slug', path)) && bySlug(m.slug)) return <Inventory key={m.slug} category={bySlug(m.slug)} />; // /cars/suv, /cars/under-20-million…
  if ((m = match('/cars/:slug', path))) return <CarOrMake slug={m.slug} />;
  if (path === '/compare') return <Compare />;
  if (path === '/pay-small-small') return <PaySmallSmall />;
  if (/^\/swap(\/|$)/.test(path) && !(cfg && cfg.swap)) return <NotFound />; // Swap is switched off in Settings
  if (path === '/swap') return <SwapHome />;
  if (path === '/swap/new') return <SwapNew />;
  if ((m = match('/swap/:id', path))) return <SwapListing id={m.id} />;
  if (path === '/account') return <Account />;
  if (path === '/login') return <AuthPage mode="login" />;
  if (path === '/register') return <AuthPage mode="register" />;
  if (path === '/verify-email') return <VerifyEmail />;
  if (path === '/forgot-password') return <ForgotPassword />;
  if (path === '/reset-password') return <ResetPassword />;
  if (path === '/blog') return <Blog />;
  if ((m = match('/blog/:slug', path))) return <Post slug={m.slug} />;
  if (['/about-us', '/privacy-policy', '/terms-and-conditions'].includes(path)) return <Page slug={path.slice(1)} />;
  if (path === '/faqs') return <Faqs />;
  if (path === '/contact') return <Contact />;
  if (ADMIN_PATH && path === ADMIN_PATH) return <Suspense fallback={<div className="loading">Loading…</div>}><Admin /></Suspense>;
  return <NotFound />;
}

function App() {
  return (
    <Router>
      <AppProvider>
        <a href="#main" className="sr">Skip to content</a>
        <Header />
        <QuickViewProvider><main id="main"><Routes /></main></QuickViewProvider>
        <Footer />
        <WhatsApp />
      </AppProvider>
    </Router>
  );
}

createRoot(document.getElementById('root')).render(<App />);
