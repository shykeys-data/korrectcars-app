import React, { useState, useEffect, useRef } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, date, api, firstPhoto, waLink } from '../lib/core.jsx';
import { Loading } from '../components/Bits.jsx';

export function AuthPage({ mode, adminGate = false }) {
  useTitle(mode === 'login' ? 'Sign in | Korrect Cars' : 'Create account | Korrect Cars');
  const { user, setUser } = useApp();
  const { go, query } = useRouter();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(''); const [unverified, setUnverified] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const next = adminGate ? '/myadm' : (query.get('next') || '/account');
  if (user && !adminGate) return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 44 }}>You are signed in</h1>
      <p>Signed in as <b>{user.email}</b>.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link to="/account" className="btn btn-red">My account</Link>
        <button className="btn btn-line" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); }}>Sign out</button></div>
    </div>
  );
  if (pending) return <CheckEmail email={pending} />;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setUnverified(false); setBusy(true);
    try {
      const d = await api('/auth/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', body: mode === 'login' ? { email: f.email, password: f.password } : f });
      if (d.pending) { setPending(d.email); return; }
      setUser(d.user); go(next.startsWith('/') && !next.startsWith('//') ? next : '/account');
    } catch (e2) { setErr(e2.message); setUnverified(!!(e2.data && e2.data.unverified)); } finally { setBusy(false); }
  };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 48 }}>{adminGate ? 'Staff sign in' : mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      <form className="box" onSubmit={submit}>
        {err && <div className="err" role="alert">{err}{unverified && <div style={{ marginTop: 8 }}><ResendButton email={f.email} /></div>}</div>}
        {mode === 'register' && <>
          <div className="field"><label className="f" htmlFor="a-name">Full name</label><input id="a-name" className="input" required minLength={2} maxLength={80} autoComplete="name" value={f.name} onChange={set('name')} /></div>
          <div className="field"><label className="f" htmlFor="a-phone">Phone</label><input id="a-phone" className="input" type="tel" required autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="0803 000 0000" /></div>
        </>}
        <div className="field"><label className="f" htmlFor="a-email">Email</label><input id="a-email" className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label className="f" htmlFor="a-pw">Password</label><input id="a-pw" className="input" type="password" required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} />
          {mode === 'register' && <div className="hint">At least 8 characters, with a letter and a number. We will email you a link to confirm your address.</div>}
          {mode === 'login' && <div className="hint"><Link to="/forgot-password">Forgot your password?</Link></div>}</div>
        <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {!adminGate && <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>{mode === 'login'
          ? <>New here? <Link to={'/register' + (query.get('next') ? '?next=' + encodeURIComponent(query.get('next')) : '')}>Create an account</Link></>
          : <>Already have an account? <Link to={'/login' + (query.get('next') ? '?next=' + encodeURIComponent(query.get('next')) : '')}>Sign in</Link></>}</p>}
      </form>
      <p className="small muted" style={{ marginTop: 14 }}>After 5 wrong passwords an account is locked for 15 minutes.</p>
    </div>
  );
}

function ResendButton({ email }) {
  const [state, setState] = useState('');
  const resend = async () => { setState('sending'); try { await api('/auth/resend', { method: 'POST', body: { email } }); setState('sent'); } catch (e) { setState(e.message); } };
  if (state === 'sent') return <span>A new link is on its way to {email}.</span>;
  return <button type="button" className="btn btn-line btn-sm" onClick={resend} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send the link again'}</button>;
}

function CheckEmail({ email }) {
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 46 }}>Check your email</h1>
      <div className="box">
        <p>We sent a confirmation link to <b>{email}</b>. Click it to activate your account. The link works for 24 hours.</p>
        <p className="small muted">Can't find it? Check your spam or promotions folder.</p>
        <ResendButton email={email} />
      </div>
    </div>
  );
}

export function VerifyEmail() {
  useTitle('Confirm your email | Korrect Cars');
  const { setUser } = useApp();
  const { query, go } = useRouter();
  const [state, setState] = useState({ busy: true, err: '' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    api('/auth/verify', { method: 'POST', body: { token: query.get('token') || '' } })
      .then((d) => { setUser(d.user); setState({ busy: false, err: '' }); setTimeout(() => go('/account', { replace: true }), 1800); })
      .catch((e) => setState({ busy: false, err: e.message }));
  }, []); // eslint-disable-line
  return (
    <div className="wrap sec" style={{ maxWidth: 560 }}>
      {state.busy ? <><h1 style={{ fontSize: 44 }}>Confirming…</h1><p className="muted">One moment.</p></>
        : state.err ? <><h1 style={{ fontSize: 44 }}>Link not valid</h1><div className="err">{state.err}</div><Link to="/login" className="btn btn-red">Sign in</Link></>
          : <><h1 style={{ fontSize: 44 }}>Email confirmed</h1><div className="okmsg">Your account is active. Taking you to your account…</div></>}
    </div>
  );
}

export function ForgotPassword() {
  useTitle('Forgot password | Korrect Cars');
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api('/auth/forgot', { method: 'POST', body: { email } }); setDone(true); } catch (e2) { setErr(e2.message); } };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 46 }}>Reset your password</h1>
      {done ? <div className="okmsg">If an account uses {email}, a reset link is on its way. It works for 1 hour.</div>
        : <form className="box" onSubmit={submit}>
          {err && <div className="err">{err}</div>}
          <div className="field"><label className="f" htmlFor="fp-email">Your email</label><input id="fp-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <button className="btn btn-red btn-block">Email me a reset link</button>
        </form>}
    </div>
  );
}

export function ResetPassword() {
  useTitle('Choose a new password | Korrect Cars');
  const { setUser } = useApp();
  const { query, go } = useRouter();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    setBusy(true);
    try { const d = await api('/auth/reset', { method: 'POST', body: { token: query.get('token') || '', password: pw } }); setUser(d.user); go('/account'); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 46 }}>Choose a new password</h1>
      <form className="box" onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="field"><label className="f" htmlFor="rp-1">New password</label><input id="rp-1" className="input" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /><div className="hint">At least 8 characters, with a letter and a number.</div></div>
        <div className="field"><label className="f" htmlFor="rp-2">Type it again</label><input id="rp-2" className="input" type="password" required minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </div>
  );
}

const ST = { pending: ['Pending review', 'tag-info'], live: ['Live', 'tag-ok'], rejected: ['Not approved', 'tag-bad'], swapped: ['Swapped', 'tag-grey'], withdrawn: ['Withdrawn', 'tag-grey'],
  accepted: ['Accepted', 'tag-ok'], declined: ['Declined', 'tag-bad'], inspection: ['Inspection booked', 'tag-warn'], completed: ['Completed', 'tag-ok'], cancelled: ['Cancelled', 'tag-grey'] };
const Tag = ({ s }) => <span className={'tag ' + (ST[s] ? ST[s][1] : 'tag-warn')}>{ST[s] ? ST[s][0] : s === 'pending' ? 'Waiting' : s}</span>;

export function Account() {
  useTitle('My account | Korrect Cars');
  const { user, setUser, cfg } = useApp();
  const { go } = useRouter();
  const [view, setView] = useState('offers');
  const [open, setOpen] = useState(null);
  const mine = useApi(user ? '/swap/mine' : null, [user]);
  useEffect(() => { if (user === null) go('/login?next=/account', { replace: true }); }, [user]); // eslint-disable-line
  if (!user) return <Loading />;
  const offers = (mine.data && mine.data.offers) || [];
  const listings = (mine.data && mine.data.listings) || [];
  const waiting = offers.filter((o) => !o.mine && o.status === 'pending').length;
  const logout = async (all) => { await api('/auth/' + (all ? 'logout-all' : 'logout'), { method: 'POST' }); setUser(null); go('/'); };
  const act = async (o, action) => { try { await api(`/swap/offers/${o.id}/respond`, { method: 'POST', body: { action } }); mine.reload(); } catch (e) { alertBox(e.message); } };
  const withdraw = async (l) => { await api(`/swap/listings/${l.id}/withdraw`, { method: 'POST' }); mine.reload(); };
  const tabs = [['offers', 'Swap offers', waiting], ['cars', 'My cars', 0], ['security', 'Login & security', 0]];
  return (
    <div className="wrap sec-sm">
      <div className="dash">
        <aside className="box" style={{ padding: 14 }}>
          <div style={{ padding: '6px 6px 14px', borderBottom: '1px solid var(--line)', marginBottom: 8 }}>
            <b>{user.name}</b><div className="small" style={{ color: user.verified ? 'var(--ok)' : 'var(--muted)', fontWeight: 600 }}>{user.verified ? 'Verified owner' : 'Owner ID not checked yet'}</div>
          </div>
          <nav className="sidenav">{tabs.map(([k, l, n]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}{n ? <span className="n">{n}</span> : null}</button>)}</nav>
          <Link to="/swap/new" className="btn btn-red btn-sm btn-block" style={{ marginTop: 10, color: '#fff' }}>List a car</Link>
          {['admin', 'moderator'].includes(user.role) && <Link to="/myadm" className="btn btn-dark btn-sm btn-block" style={{ marginTop: 8, color: '#fff' }}>Admin console</Link>}
          <button className="btn btn-line btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => logout(false)}>Sign out</button>
        </aside>
        <main style={{ minWidth: 0, display: 'grid', gap: 18 }}>
          {mine.loading && !mine.data ? <Loading /> : null}
          {view === 'offers' && (offers.length === 0
            ? <div className="empty"><h3>No swap offers yet</h3><p className="muted">When your car is live, browse cars and make offers, or wait for owners to make offers on yours.</p><Link to="/swap" className="btn btn-line">Browse swaps</Link></div>
            : offers.map((o) => (
              <div key={o.id} className="box">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div><div className="small muted">Offer #{o.id} · {o.mine ? 'you offered' : `${o.from.name} offered`}</div>
                    <h3 style={{ margin: '4px 0 0' }}>{o.offered.make} {o.offered.model} ⇄ {o.target.make} {o.target.model}</h3></div>
                  <Tag s={o.status} />
                </div>
                <div className="grid2" style={{ marginTop: 14 }}>
                  {[['Their car', o.mine ? o.target : o.offered], ['Your car', o.mine ? o.offered : o.target]].map(([lab, c]) => (
                    <div key={lab} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={firstPhoto(c)} alt="" /><div><div className="small muted">{lab}</div><b>{c.year} {c.make} {c.model}</b><div className="small">{naira(c.value)}{c.location ? ' · ' + c.location : ''}</div></div></div>
                  ))}
                </div>
                {o.top_up > 0 && <p style={{ marginTop: 12 }}><b>Cash top-up:</b> {(o.top_up_payer === 'from') === o.mine ? 'you add' : 'they add'} {naira(o.top_up)}</p>}
                {o.inspection && <p><b>Inspection:</b> {o.inspection.place}, {o.inspection.time}</p>}
                {o.contact && <div className="okmsg" style={{ marginTop: 10 }}>Contact {o.contact.name}: <a href={'tel:' + o.contact.phone}>{o.contact.phone}</a> · <a href={waLink({ whatsapp: String(o.contact.phone).replace(/[^0-9]/g, '').replace(/^0/, '234') }, `Hello ${o.contact.name}, this is about our Korrect Swap offer #${o.id}.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a><div className="small" style={{ fontWeight: 500 }}>Meet only at a Korrect Cars inspection point. Message us to book it.</div></div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  {!o.mine && o.status === 'pending' && <><button className="btn btn-ok btn-sm" onClick={() => act(o, 'accept')}>Accept offer</button><button className="btn btn-line btn-sm" onClick={() => act(o, 'decline')}>Decline</button></>}
                  {o.mine && ['pending', 'accepted'].includes(o.status) && <button className="btn btn-line btn-sm" onClick={() => act(o, 'withdraw')}>Withdraw offer</button>}
                  <button className="btn btn-dark btn-sm" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? 'Hide messages' : 'Messages'}</button>
                  {['accepted', 'inspection'].includes(o.status) && <a className="btn btn-wa btn-sm" href={waLink(cfg, `Hello Korrect Cars, please book the inspection for swap offer #${o.id}.`)} target="_blank" rel="noopener noreferrer">Book inspection</a>}
                </div>
                {open === o.id && <Chat offerId={o.id} closed={['declined', 'withdrawn', 'cancelled'].includes(o.status)} />}
              </div>
            )))}
          {view === 'cars' && <div className="box">
            <h2>My cars</h2>
            {listings.length === 0 ? <p className="muted">You have not listed a car yet. <Link to="/swap/new">List one now</Link>.</p>
              : listings.map((l) => (
                <div className="row" key={l.id}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={firstPhoto(l)} alt="" /><div><b>{l.year} {l.make} {l.model}</b><div className="small muted">{naira(l.value)} · listed {date(l.created_at)}</div>{l.status === 'rejected' && l.reject_reason && <div className="small" style={{ color: 'var(--bad)' }}>{l.reject_reason}</div>}</div></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Tag s={l.status} />{['pending', 'live'].includes(l.status) && <button className="btn btn-line btn-sm" onClick={() => withdraw(l)}>Withdraw</button>}</div>
                </div>))}
          </div>}
          {view === 'security' && <div className="box">
            <h2>Login &amp; security</h2>
            <div className="row"><div><b>Email</b><div className="small muted">{user.email}</div></div></div>
            <div className="row"><div><b>Phone</b><div className="small muted">{user.phone}</div></div></div>
            <div className="row"><div><b>Sign out everywhere</b><div className="small muted">Ends every session on every device, including this one</div></div><button className="btn btn-line btn-sm" onClick={() => logout(true)}>Sign out all devices</button></div>
            <div className="row" style={{ borderBottom: 0 }}><div><b>Your data</b><div className="small muted">To download or delete your data, message us from your registered number</div></div><a className="btn btn-line btn-sm" href={waLink(cfg, 'Hello Korrect Cars, I want to manage my account data.')} target="_blank" rel="noopener noreferrer">Request</a></div>
            <button className="btn btn-dark" style={{ marginTop: 14 }} onClick={() => logout(false)}>Sign out</button>
          </div>}
        </main>
      </div>
    </div>
  );
}

function alertBox(msg) { const d = document.createElement('div'); d.className = 'err'; d.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 4000); }

function Chat({ offerId, closed }) {
  const { data, reload } = useApi(`/swap/offers/${offerId}/messages`);
  const [text, setText] = useState(''); const [note, setNote] = useState('');
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [data]);
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]);
  const send = async (e) => {
    e.preventDefault(); if (!text.trim()) return;
    try { const r = await api(`/swap/offers/${offerId}/messages`, { method: 'POST', body: { text } }); setText(''); setNote(r.masked ? 'Contact details were hidden. They are shared automatically once the offer is accepted.' : ''); reload(); } catch (e2) { setNote(e2.message); }
  };
  const report = async (m) => { await api(`/swap/messages/${m.id}/report`, { method: 'POST' }); setNote('Thanks. Our team will review that message.'); };
  const msgs = (data && data.messages) || [];
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="chat" ref={box}>
        {msgs.length === 0 && <p className="muted small">No messages yet.</p>}
        {msgs.map((m) => <div key={m.id} className={'bubble ' + (m.me ? 'me' : 'them')}><div>{m.text}</div><div className="small muted">{m.me ? 'You' : m.name} · {date(m.created_at)}{!m.me && <> · <button onClick={() => report(m)} style={{ background: 'none', border: 0, color: 'var(--link)', cursor: 'pointer', padding: 0, font: 'inherit' }}>Report</button></>}</div></div>)}
      </div>
      {!closed && <form onSubmit={send} style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <label className="sr" htmlFor={'m-' + offerId}>Message</label>
        <input id={'m-' + offerId} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message…" />
        <button className="btn btn-red">Send</button>
      </form>}
      {note && <p className="small muted" style={{ marginTop: 6 }}>{note}</p>}
    </div>
  );
}
