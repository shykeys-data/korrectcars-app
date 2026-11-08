// Staff area (loaded only for staff): the frame, tabs and overview. Each tab lives in its own file:
// AdminAuth (two-step login), AdminCars (cars with photos and inspection notes), AdminLeads (leads, swap listings, swaps),
// AdminSettings (site settings, users, audit log), AdminGuides (guides and market figures). Every action is checked again on the server.
import React, { useState } from 'react';
import { Link, useApi, useApp, useTitle, naira, date, api } from '../lib/core.jsx';
import { Guides, MarketFigures } from './AdminGuides.jsx';
import { Loading } from '../components/Bits.jsx';
import { AuthPage } from './Account.jsx';
import { TwoFASetup, TwoFAVerify } from './AdminAuth.jsx';
import { Cars } from './AdminCars.jsx';
import { Dealers, CarChecks, Reports } from './AdminDealers.jsx';
import { Leads, Listings, STATUS_LABEL, Swaps, TYPE_LABEL } from './AdminLeads.jsx';
import { Audit, Settings, Users } from './AdminSettings.jsx';
import { ROLE_LABEL, STAFF, T, stTag } from './AdminShared.jsx';


// Tabs each role can see. admin = Administrator; moderator is the old name for sales.
// Grouped by the job: daily selling work first, then stock, then content, then admin. [key, label, roles, group]
const ALL_TABS = [
  ['overview', 'Overview', 'admin sales editor', 'Today'], ['leads', 'Leads', 'admin sales', 'Today'],
  ['cars', 'Cars', 'admin sales editor', 'Stock'], ['dealers', 'Sellers to review', 'admin sales editor', 'Stock'],
  ['checks', 'Cars to check', 'admin sales editor', 'Stock'], ['reports', 'Reported listings', 'admin sales editor', 'Stock'],
  ['listings', 'Swap listings', 'admin sales', 'Swap'], ['swaps', 'Swaps & fees', 'admin sales', 'Swap'],
  ['blog', 'Guides', 'admin editor', 'Content'], ['market', 'Market figures', 'admin editor', 'Content'],
  ['users', 'Staff & users', 'admin', 'Admin'], ['settings', 'Settings', 'admin', 'Admin'], ['audit', 'Activity log', 'admin', 'Admin']];
const roleKey = (r) => (r === 'moderator' ? 'sales' : r);

export default function Admin() {
  useTitle('Admin | Korrect Cars');
  const { user } = useApp();
  if (user === undefined) return <Loading />;
  if (!user) return <AuthPage mode="login" adminGate />;
  if (!STAFF.includes(user.role)) return <NoAccess user={user} />;
  if (user.twofa && !user.twofa.enabled) return <TwoFASetup user={user} />;
  if (user.twofa && !user.twofa.ok) return <TwoFAVerify user={user} />;
  return <Console user={user} />;
}

function NoAccess({ user }) {
  const { setUser } = useApp();
  const switchAcc = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 48 }}>Staff only</h1>
      <p>You are signed in as <b>{user.email}</b>, which is a customer account. The admin console needs a staff account.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button className="btn btn-red" onClick={switchAcc}>Sign out and use a staff account</button><Link to="/" className="btn btn-line">Back to the site</Link></div>
    </div>
  );
}

function Console({ user }) {
  const { setUser, cfg } = useApp();
  const rk = roleKey(user.role);
  const TABS = ALL_TABS.filter((t) => t[2].split(' ').includes(rk) && ((cfg && cfg.swap) || !['listings', 'swaps'].includes(t[0])) && ((cfg && cfg.marketplace) || !['dealers', 'checks'].includes(t[0])));
  const [tab, setTab] = useState('overview');
  const stats = useApi('/admin/stats');
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec-sm">
      <div className="dash">
        <aside className="admin-side">
          <div style={{ padding: '6px 8px 14px', borderBottom: '1px solid #26262b', marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 22, color: '#fff' }}>Admin console</div>
            <div className="small" style={{ color: '#a1a1aa' }}>{user.name} · {ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <nav className="sidenav">{TABS.map(([k, l, , g], i) => {
            const n = stats.data ? { listings: stats.data.pendingListings, leads: stats.data.newEnquiries, dealers: stats.data.dealersWaiting, checks: stats.data.carsToCheck, reports: stats.data.listingReports }[k] : 0;
            return <React.Fragment key={k}>{(i === 0 || TABS[i - 1][3] !== g) && <div className="grp" aria-hidden="true">{g}</div>}
              <button className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}{n ? <span className="n">{n}</span> : null}</button></React.Fragment>;
          })}</nav>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={logout}>Sign out</button>
        </aside>
        <main style={{ minWidth: 0, display: 'grid', gap: 18 }}>
          {tab === 'overview' && <Overview stats={stats} go={setTab} />}
          {tab === 'cars' && <Cars isAdmin={user.role === 'admin'} />}
          {tab === 'leads' && <Leads onChange={stats.reload} />}
          {tab === 'dealers' && <Dealers onChange={stats.reload} isAdmin={user.role === 'admin'} />}
          {tab === 'checks' && <CarChecks onChange={stats.reload} />}
          {tab === 'reports' && <Reports onChange={stats.reload} />}
          {tab === 'settings' && <Settings />}
          {tab === 'listings' && <Listings onChange={stats.reload} />}
          {tab === 'swaps' && <Swaps />}
          {tab === 'users' && <Users me={user} />}
          {tab === 'blog' && <Guides />}
          {tab === 'market' && <MarketFigures />}
          {tab === 'audit' && <Audit />}
        </main>
      </div>
    </div>
  );
}

function Overview({ stats, go }) {
  const { cfg } = useApp();
  const swap = !!(cfg && cfg.swap);
  const s = stats.data;
  const seesLeads = s && ['admin', 'sales', 'moderator'].includes(s.role);
  const enq = useApi(seesLeads ? '/admin/enquiries' : null);
  if (!s) return <Loading />;
  const K = ({ l, v, sub, to }) => <button className="box kpi" style={{ textAlign: 'left', cursor: to ? 'pointer' : 'default', font: 'inherit' }} onClick={() => to && go(to)}><div className="small muted">{l}</div><div className="v">{v}</div>{sub && <div className="small muted">{sub}</div>}</button>;
  return (
    <>
      <div className="kpis">
        <K l="Cars in stock" v={s.carsAvail} sub={`${s.carsSold} sold`} to="cars" />
        {cfg && cfg.marketplace && <K l="Sellers to review" v={s.dealersWaiting || 0} to="dealers" />}
        {cfg && cfg.marketplace && <K l="Private seller cars to check" v={s.carsToCheck || 0} to="checks" />}
        {s.listingReports > 0 && <K l="Reported listings" v={s.listingReports} to="reports" />}
        {seesLeads && <K l="New leads" v={s.newEnquiries} sub={s.newPss ? `${s.newPss} Pay Small Small` : ''} to="leads" />}
        {swap && <K l="Swap listings to review" v={s.pendingListings} sub={`${s.liveListings} live`} to="listings" />}
        {swap && <K l="Open swap offers" v={s.openOffers} to="swaps" />}
        {swap && <K l="Success fees paid" v={naira(s.feePaid)} sub={`${naira(s.feeDue)} due`} to="swaps" />}
        {s.role === 'admin' && <K l="Registered users" v={s.users} sub={s.reported ? `${s.reported} reported messages` : ''} to="users" />}
      </div>
      {seesLeads && <div className="box"><h3>Latest leads</h3>{enq.data && enq.data.enquiries.slice(0, 6).map((e) => (
        <div className="row" key={e.id}><div><b>{e.name}</b> · {TYPE_LABEL[e.type] || e.type}{e.car_title ? ` · ${e.car_title}` : ''}<div className="small muted">{e.phone} · {date(e.created_at)}</div></div><T c={stTag[e.status]}>{STATUS_LABEL[e.status] || e.status}</T></div>
      ))}{enq.data && !enq.data.enquiries.length && <p className="muted">No leads yet.</p>}</div>}
    </>
  );
}
