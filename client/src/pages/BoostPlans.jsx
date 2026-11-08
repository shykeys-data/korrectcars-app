// Boost plan fees (/boost-plans): every plan with its fee, for 7 days, 14 days, 30 days, 3 months, 6 months or a year.
// Sellers signed in can pay from here (Paystack); everyone else is sent to sign up or sign in first.
// The same words and prices go to search engines from the server (render.js, pagecopy.js BOOSTS, boost-plans.js).
import React, { useState } from 'react';
import { Link, useApp, useRouter, useTitle, api, naira } from '../lib/core.jsx';
import { CopySections } from '../components/Copy.jsx';
import { BOOSTS } from '../../../server/lib/pagecopy.js';
import { priceList, DURATIONS, VAT_PCT } from '../../../server/lib/boost-plans.js';

export const LENGTHS = { 7: '7 days', 14: '14 days', 30: '30 days', 90: '3 months', 180: '6 months', 365: '1 year' };

export function BoostPlans() {
  useTitle('Boost plan fees: 7 days to 1 year | Korrect Cars', BOOSTS.lead);
  const { user } = useApp();
  const { query } = useRouter();
  const [days, setDays] = useState(DURATIONS.some(([d]) => d === Number(query.get('days'))) ? Number(query.get('days')) : 30);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const plans = priceList();
  const seller = user && user.dealer && !['rejected', 'suspended'].includes(user.dealer.status);
  const month = (k) => plans.find((p) => p.key === k).prices.find((x) => x.days === 30);
  const pay = async (plan) => {
    setErr(''); setBusy(plan);
    try { const d = await api('/dealer/boosts', { method: 'POST', body: { plan, days } }); window.location.href = d.url; } catch (e) { setErr(e.message); setBusy(''); }
  };
  return (
    <div className="wrap sec-sm">
      <div className="eyebrow">For sellers</div>
      <h1>{BOOSTS.h1}</h1>
      <p className="lead-text" style={{ maxWidth: 820 }}>{BOOSTS.lead}</p>

      <div className="box">
        <h2 style={{ marginTop: 0 }}>Plan fees</h2>
        <div className="pills" role="tablist" aria-label="How long" style={{ marginBottom: 14 }}>
          {DURATIONS.map(([d]) => <button key={d} type="button" role="tab" aria-selected={days === d} className={'pill' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>{LENGTHS[d]}</button>)}
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="plans-grid">
          {plans.map((p) => {
            const q = p.prices.find((x) => x.days === days);
            const save = days > 30 ? Math.round((1 - q.amount / (month(p.key).amount * days / 30)) * 100) : 0;
            return (
              <div key={p.key} className="plan-card">
                <h3>{p.name}</h3>
                <div className="plan-cars">{p.cars == null ? 'All your cars' : `${p.cars} car${p.cars === 1 ? '' : 's'}`} boosted at once</div>
                <div className="plan-price">{naira(q.amount)}</div>
                <div className="small muted">for {LENGTHS[days]} · {naira(q.total)} with VAT ({VAT_PCT}%)</div>
                <div className="small" style={{ marginTop: 6 }}>About {naira(q.perDay)} a day{save > 0 ? <b style={{ color: 'var(--ok)' }}> · save {save}%</b> : null}</div>
                {seller
                  ? <button className="btn btn-red btn-block" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => pay(p.key)}>{busy === p.key ? 'Opening Paystack…' : 'Pay with Paystack'}</button>
                  : <Link className="btn btn-dark btn-block" style={{ marginTop: 12 }} to={user ? '/dealers/join' : '/login?next=' + encodeURIComponent('/boost-plans?days=' + days)}>{user ? 'Start selling to boost' : 'Sign in to boost'}</Link>}
              </div>
            );
          })}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Prices before VAT; {VAT_PCT}% VAT is added at checkout and shown on your receipt. Shorter plans cost more per day, longer plans less. {seller ? <>After paying, choose the cars on <Link to="/dealer">your seller page</Link>.</> : <>New here? <Link to="/dealers/join">Start selling on Korrect Cars</Link>; it is free to list.</>}</p>
      </div>

      <details className="box" style={{ marginTop: 16 }}>
        <summary><b>Compare every plan and length in one table</b></summary>
        <div className="scroll-x" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Plan</th><th className="num">Cars</th>{DURATIONS.map(([d]) => <th key={d} className="num">{LENGTHS[d]}</th>)}</tr></thead>
          <tbody>{plans.map((p) => <tr key={p.key}><td><b>{p.name}</b></td><td className="num">{p.cars == null ? 'All' : p.cars}</td>{p.prices.map((q) => <td key={q.days} className="num">{naira(q.amount)}</td>)}</tr>)}</tbody></table></div>
        <p className="small muted">Before VAT.</p>
      </details>

      <div className="box" style={{ marginTop: 16 }}><CopySections page={BOOSTS} /></div>
    </div>
  );
}
