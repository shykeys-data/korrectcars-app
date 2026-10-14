import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Router, AppProvider, useRouter, match } from './lib/core.jsx';
import { Header, Footer, WhatsApp } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { Inventory, CarDetail, PaySmallSmall } from './pages/Cars.jsx';
import { SwapHome, SwapListing, SwapNew } from './pages/Swap.jsx';
import { Account, AuthPage, VerifyEmail, ForgotPassword, ResetPassword } from './pages/Account.jsx';
import { Blog, Post, Page, Faqs, Contact, NotFound } from './pages/Content.jsx';
import Admin from './pages/Admin.jsx';

function Routes() {
  const { path } = useRouter();
  let m;
  if (path === '/') return <Home />;
  if (path === '/cars') return <Inventory />;
  if ((m = match('/cars/:slug', path))) return <CarDetail slug={m.slug} />;
  if (path === '/pay-small-small') return <PaySmallSmall />;
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
  if (path === '/myadm') return <Admin />;
  return <NotFound />;
}

function App() {
  return (
    <Router>
      <AppProvider>
        <a href="#main" className="sr">Skip to content</a>
        <Header />
        <main id="main"><Routes /></main>
        <Footer />
        <WhatsApp />
      </AppProvider>
    </Router>
  );
}

createRoot(document.getElementById('root')).render(<App />);
