// Pay Small Small page: how instalments work through our credit partners, the estimate calculator and FAQs.
import React, { useState } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, waLink, bnpl, api } from '../lib/core.jsx';


const PSS_FAQ = [
  ['How does Pay Small Small work at Korrect Cars?', 'Pick a car and get an estimate of your deposit and monthly payment. Apply in minutes, and with your consent we pass your details to our credit partners. Once a credit partner approves you, Korrect Cars sells you the car.'],
  ['Who decides if I qualify?', 'Our credit partners. They check if you qualify, tell you which documents they need (usually a government ID and proof of income) and set the final deposit, charge and months.'],
  ['Is the calculator figure final?', 'No. It is an estimate based on a 40% deposit and a 20% charge on the balance. The credit partner sets your real terms.'],
  ['Can I pay off early?', 'Early payoff, rates and months are set by the credit partner. Ask them when they contact you.'],
  ['Who sees my details?', 'Korrect Cars staff and our credit partners, and only after you agree on the last step.']
];

export function PaySmallSmall() {
  useTitle('Pay Small Small — Car Payment Plans in Lagos | Korrect Cars');
  const { query } = useRouter();
  const { cfg, user } = useApp();
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 };
  // One or more credit partners (banks or finance companies), set in admin Settings
  const names = String((cfg && cfg.bankPartner) || '').split(',').map((x) => x.trim()).filter(Boolean);
  const partner = names.length ? `our credit partners (${names.join(', ')})` : 'our credit partners';
  const list = useApi('/cars?limit=100');
  const cars = ((list.data && list.data.cars) || []).filter((c) => c.status === 'available');
  const [slug, setSlug] = useState(query.get('car') || '');
  const [custom, setCustom] = useState(Number(query.get('price')) || 10000000);
  const [pct, setPct] = useState(Math.max(b.minDeposit, Number(query.get('deposit')) || b.minDeposit));
  const [months, setMonths] = useState(Number(query.get('months')) || 24);
  const [step, setStep] = useState(1);
  const [d, setD] = useState({ name: (user && user.name) || '', phone: (user && user.phone) || '', email: (user && user.email) || '', employment: 'Salaried', employer: '', income: '', consent: false, website: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const car = cars.find((c) => c.slug === slug);
  const price = car ? Number(car.price) : custom;
  const plan = bnpl(price, pct, months, cfg);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const detailsOk = d.name.trim().length >= 2 && /^\+?[0-9 ()-]{7,20}$/.test(d.phone.trim());
  const next = () => { setErr(''); if (step === 2 && !detailsOk) { setErr('Enter your name and a valid phone number to continue.'); return; } setStep(step + 1); };
  const send = async () => {
    if (!d.consent) { setErr('Tick the box to agree before you send.'); return; }
    setErr(''); setBusy(true);
    try {
      const message = [`Pay Small Small application (estimate) for ${car ? car.title : 'a car priced ' + naira(price)}.`, `Deposit ${naira(plan.deposit)} (${plan.pct}%), ${plan.months} months, about ${naira(plan.monthly)}/month.`,
        `Employment: ${d.employment}${d.employer ? ' — ' + d.employer : ''}.`, d.income ? `Monthly income: ₦${d.income}.` : '', 'Customer agreed to share details with the credit partner.'].filter(Boolean).join(' ');
      await api('/enquiries', { method: 'POST', body: { type: 'bnpl', car: car ? String(car.id) : undefined, name: d.name, phone: d.phone, email: d.email, message, deposit: plan.deposit, months: plan.months, consent: true, website: d.website } });
      setStep(4);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const labels = ['Estimate', 'Your details', 'Review and send'];
  return (
    <>
      <section className="sec-dark sec-sm"><div className="wrap">
        <div className="eyebrow">Pay Small Small</div>
        <h1>Drive now. Pay small small.</h1>
        <p style={{ color: '#D5D8DE', maxWidth: 680, fontSize: 19 }}>Spread the cost of your car through our credit partners. Get an estimate here, apply in minutes, and we pass your application to our credit partners (banks or finance companies). Once one approves you, we sell you the car.</p>
      </div></section>
      <section className="sec-sm"><div className="wrap pss">
        <div className="pss-side">
          <div className="box">
            <h2 style={{ fontSize: 28 }}>How it works</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li><b>Estimate:</b> see a rough deposit and monthly cost.</li>
              <li><b>Apply:</b> your details, about 3 minutes.</li>
              <li><b>Partner decides:</b> {partner} check if you qualify.</li>
              <li><b>Drive:</b> approved? We sell you the car.</li>
            </ol>
          </div>
          <div className="box">
            <h2 style={{ fontSize: 28 }}>Questions</h2>
            {PSS_FAQ.map(([q, a]) => <details key={q} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}><summary style={{ fontWeight: 600, cursor: 'pointer' }}>{q}</summary><p className="small" style={{ margin: '6px 0 0' }}>{a}</p></details>)}
          </div>
        </div>
        <div className="box pss-main">
          {step < 4 && <>
            <h2 style={{ fontSize: 30 }}>Apply through our credit partners</h2>
            <ol className="stepbar" aria-label="Application steps">{labels.map((l, k) => <li key={l} className={k + 1 < step ? 'done' : k + 1 === step ? 'on' : ''} aria-current={k + 1 === step ? 'step' : undefined}><span />{k + 1} {l}</li>)}</ol>
          </>}
          {err && <div className="err" role="alert">{err}</div>}
          {step === 1 && <>
            <div className="field">
              <label className="f" htmlFor="pss-car">Choose a car</label>
              <select id="pss-car" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
                <option value="">Enter my own price</option>
                {cars.map((c) => <option key={c.id} value={c.slug}>{c.title} — {naira(c.price)}</option>)}
              </select>
            </div>
            {!car && <div className="field"><label className="f" htmlFor="pss-price">Car price</label><input id="pss-price" className="input" inputMode="numeric" value={custom ? custom.toLocaleString('en-NG') : ''} onChange={(e) => setCustom(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} /></div>}
            <div className="field"><div className="f">Deposit you can pay <span className="muted small">(estimate)</span></div><div className="pills">{[40, 50, 60, 70].map((v) => <button key={v} type="button" className={'pill' + (pct === v ? ' on' : '')} onClick={() => setPct(v)}>{v}%</button>)}</div></div>
            <div className="field"><div className="f">Months</div><div className="pills">{[6, 12, 24, 36, 48].filter((m) => m >= b.minMonths && m <= b.maxMonths).map((m) => <button key={m} type="button" className={'pill' + (months === m ? ' on' : '')} onClick={() => setMonths(m)}>{m}</button>)}</div></div>
            <div className="pss-est"><span>Estimate: deposit {naira(plan.deposit)} · then</span><strong>{naira(plan.monthly)} × {plan.months}</strong></div>
            <p className="small muted">Based on a {b.minDeposit}% minimum deposit and a {b.markup}% charge on the balance. The credit partner sets your real terms.</p>
          </>}
          {step === 2 && <div className="grid2">
            <div className="field"><label className="f" htmlFor="pss-name">Full name</label><input id="pss-name" className="input" value={d.name} onChange={set('name')} autoComplete="name" required /></div>
            <div className="field"><label className="f" htmlFor="pss-phone">Phone (WhatsApp)</label><input id="pss-phone" className="input" type="tel" value={d.phone} onChange={set('phone')} autoComplete="tel" placeholder="0803 000 0000" required /></div>
            <div className="field"><label className="f" htmlFor="pss-email">Email (optional)</label><input id="pss-email" className="input" type="email" value={d.email} onChange={set('email')} autoComplete="email" /></div>
            <div className="field"><label className="f" htmlFor="pss-emp">Employment</label><select id="pss-emp" className="input" value={d.employment} onChange={set('employment')}><option>Salaried</option><option>Self-employed</option><option>Business owner</option></select></div>
            <div className="field"><label className="f" htmlFor="pss-er">Employer or business</label><input id="pss-er" className="input" value={d.employer} onChange={set('employer')} maxLength={100} /></div>
            <div className="field"><label className="f" htmlFor="pss-inc">Monthly income (₦, optional)</label><input id="pss-inc" className="input" inputMode="numeric" value={d.income} onChange={(e) => setD({ ...d, income: e.target.value.replace(/[^0-9,]/g, '').slice(0, 15) })} /></div>
            <div style={{ position: 'absolute', left: -9999 }} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={d.website} onChange={set('website')} /></label></div>
          </div>}
          {step === 3 && <>
            <div className="pss-review">
              <div><span>Car</span><b>{car ? car.title : 'Own price'} · {naira(price)}</b></div>
              <div><span>Deposit you can pay</span><b>{naira(plan.deposit)} ({plan.pct}%)</b></div>
              <div><span>Estimated monthly</span><b>{naira(plan.monthly)} × {plan.months}</b></div>
              <div><span>Your details</span><b>{d.name} · {d.phone}</b></div>
            </div>
            <div className="note-grey" style={{ marginTop: 14 }}>This is an estimate. {partner.charAt(0).toUpperCase() + partner.slice(1)} check if you qualify and set the final deposit, charge and months. Korrect Cars sells you the car once a credit partner approves you.</div>
            <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={d.consent} onChange={set('consent')} /> I agree that Korrect Cars can share my details with its credit partner so they can check if I qualify, as described in the <Link to="/privacy-policy">privacy policy</Link>.</label>
          </>}
          {step < 4 && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18 }}>
            <button className="btn btn-line" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={() => { setErr(''); setStep(step - 1); }}>Back</button>
            {step < 3 ? <button className="btn btn-red" onClick={next}>Continue</button> : <button className="btn btn-red" onClick={send} disabled={busy || !d.consent}>{busy ? 'Sending…' : 'Send to credit partner'}</button>}
          </div>}
          {step === 4 && <div>
            <div className="okmsg"><div className="disp" style={{ fontSize: 28 }}>Application sent</div>We have passed your details to {partner}. They will contact you directly. We will also follow up on WhatsApp.</div>
            <h3 style={{ marginTop: 18 }}>What happens next</h3>
            <ol className="track"><li className="done">Application received</li><li className="on">Sent to our credit partner</li><li>Partner checks if you qualify</li><li>Approved: we sell you the car</li></ol>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>{user ? <Link to="/account?tab=requests" className="btn btn-red">Track it in My account</Link> : <Link to="/register?next=/account?tab=requests" className="btn btn-red">Create an account to track it</Link>}<Link to="/cars" className="btn btn-line">Back to cars</Link><a className="btn btn-wa" href={waLink(cfg, 'Hello Korrect Cars, I just applied for Pay Small Small.')} target="_blank" rel="noopener noreferrer">WhatsApp us</a></div>
          </div>}
        </div>
      </div></section>
    </>
  );
}
