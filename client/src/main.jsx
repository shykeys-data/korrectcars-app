// Browser entry point: picks the page component for each address (Routes below) and wraps the app
// in the shared providers. The admin bundle is loaded only when a staff member opens the staff address.
import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Router, AppProvider, useRouter, match, useApp } from './lib/core.jsx';
import { Header, Footer, CookieBar } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { Inventory, Compare } from './pages/Cars.jsx';
import { CarDetail } from './pages/CarDetail.jsx';
import { useApi, slugify, booted } from './lib/core.jsx';
import { bySlug } from '../../server/lib/categories.js';
// The staff address is only known when the page was opened at it (it is not in the site's code)
const ADMIN_PATH = (booted('/config') || {}).adminPath || null;
// Home, car lists and car pages (where most visitors land) are in the main file. Every other page is its own
// small file, downloaded only when someone opens it, so the first visit downloads and runs less code.
const part = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const swap = () => import('./pages/Swap.jsx');
const SwapHome = part(swap, 'SwapHome'), SwapListing = part(swap, 'SwapListing'), SwapNew = part(swap, 'SwapNew');
const acct = () => import('./pages/Account.jsx');
const Account = part(acct, 'Account'), AuthPage = part(acct, 'AuthPage'), VerifyEmail = part(acct, 'VerifyEmail'),
  ForgotPassword = part(acct, 'ForgotPassword'), ResetPassword = part(acct, 'ResetPassword');
const content = () => import('./pages/Content.jsx');
const Blog = part(content, 'Blog'), Post = part(content, 'Post'), Page = part(content, 'Page'), Faqs = part(content, 'Faqs'),
  Contact = part(content, 'Contact'), NotFound = part(content, 'NotFound'), HowWeCheckSellers = part(content, 'HowWeCheckSellers');
const SellerPage = part(() => import('./pages/Seller.jsx'), 'SellerPage');
const BoostPlans = part(() => import('./pages/BoostPlans.jsx'), 'BoostPlans');
const tools = () => import('./pages/Tools.jsx');
const VinCheck = part(tools, 'VinCheck'), Market = part(tools, 'Market');
const PaySmallSmall = part(() => import('./pages/PaySmallSmall.jsx'), 'PaySmallSmall');
const Admin = lazy(() => import('./pages/Admin.jsx'));
// Partner dealer pages: their own bundle, loaded only when a dealer opens them
const DealerJoin = lazy(() => import('./pages/Dealer.jsx').then((m) => ({ default: m.DealerJoin })));
const DealerHome = lazy(() => import('./pages/Dealer.jsx').then((m) => ({ default: m.DealerHome })));
const DealerInvite = lazy(() => import('./pages/Dealer.jsx').then((m) => ({ default: m.DealerInvite })));
const DealerCarForm = lazy(() => import('./pages/Dealer.jsx').then((m) => ({ default: m.DealerCarForm })));
const Lazy = ({ children }) => <Suspense fallback={<div className="loading">Loading…</div>}>{children}</Suspense>;
import { QuickViewProvider } from './components/QuickView.jsx';
import { InstallApp } from './components/InstallApp.jsx';

// /cars/toyota is a make page; /cars/2018-toyota-camry-se is a single car
function CarOrMake({ slug }) {
  const list = useApi('/cars?limit=all');
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
  if (/^\/(dealers?(\/|$)|how-we-check-sellers$|boost-plans$)/.test(path) && !(cfg && cfg.marketplace)) return <NotFound />; // Partner dealers switched off (the server answers 404 too)
  if (path === '/how-we-check-sellers') return <HowWeCheckSellers />;
  if (path === '/boost-plans') return <BoostPlans />;
  if (path === '/dealers/join') return <Lazy><DealerJoin /></Lazy>;
  if (path === '/dealers/invite') return <Lazy><DealerInvite /></Lazy>;
  if ((m = match('/dealers/:slug', path))) return <SellerPage key={m.slug} slug={m.slug} />;
  if (path === '/dealer') return <Lazy><DealerHome /></Lazy>;
  if (path === '/dealer/cars/new') return <Lazy><DealerCarForm /></Lazy>;
  if ((m = match('/dealer/cars/:id', path)) && /^\d+$/.test(m.id)) return <Lazy><DealerCarForm key={m.id} id={m.id} /></Lazy>;
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
  if (path === '/vin-check') return <VinCheck />;
  if (path === '/car-market-today') return <Market />;
  if (ADMIN_PATH && path === ADMIN_PATH) return <Suspense fallback={<div className="loading">Loading…</div>}><Admin /></Suspense>;
  return <NotFound />;
}

function App() {
  return (
    <Router>
      <AppProvider>
        <a href="#main" className="sr">Skip to content</a>
        <Header />
        <QuickViewProvider><main id="main"><Lazy><Routes /></Lazy></main></QuickViewProvider>
        <Footer />
        <CookieBar />
        <InstallApp />
      </AppProvider>
    </Router>
  );
}

// Links that leave korrectcars.com (guides, footer credits, Instagram, WhatsApp, CAC search...) open in a
// new tab so the site stays open. Set at click time, so links inside guide and page HTML are covered too.
const OWN_HOSTS = /^(www\.)?korrectcars\.com$/i;
document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a || !/^https?:$/.test(a.protocol) || a.host === location.host || OWN_HOSTS.test(a.hostname)) return;
  a.target = '_blank';
  if (!/\bnoopener\b/.test(a.rel)) a.rel = (a.rel + ' noopener').trim();
}, true);

createRoot(document.getElementById('root')).render(<App />);
window.__kcMounted = true; // the light server page (see index.html) is no longer needed
