// Partner dealers (loaded only on /dealers/join and /dealer...): sign-up in steps (email code -> account -> phone code
// -> business papers), the dealer's home page with their cars, and the add / edit car form, which starts with the VIN.
// Everything is checked again on the server; the VIN rules come from the same file the server uses.
import React, { useState, useEffect, useRef } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, priceText, date, api, firstPhoto, rs, shrinkPhoto, waLink, forgetBoot, ContactUs } from '../lib/core.jsx';
import { Loading, SellerBadge } from '../components/Bits.jsx';
import { check as checkVin } from '../../../server/lib/vehicle-id.js';
import { STATES, lgasOf } from '../../../server/lib/ng-lgas.js';
import { applyPrefill } from '../lib/prefill.js';
import { PriceField, MileageField, ColourFields, FeatureTicks, VinChoices, DescriptionField } from '../components/CarFields.jsx';

const STATUS = {
  pending_review: ['Waiting for review', 'tag-warn', 'Our team is checking your CAC certificate and phone, usually within 2 working days. You can add cars now: they go live when you are approved.'],
  more_info: ['We need a little more', 'tag-warn', 'Please read the note from our team below, then send your details again.'],
  approved: ['Approved', 'tag-ok', 'Your cars are live on Korrect Cars.'],
  rejected: ['Not approved', 'tag-bad', 'Your application was not approved. Contact us if you think this is a mistake.'],
  suspended: ['Paused', 'tag-bad', 'Your listings are paused while our team looks into something. Please contact us.'],
  draft: ['Not sent yet', 'tag-grey', '']
};
// People selling their own car (kind 'personal')
const SELLER_STATUS = {
  unverified: ['Private Seller · not verified', 'tag-grey', 'You can list 1 car. Our team looks at it before it goes live, and buyers are told we have not checked who you are.'],
  pending_review: ['ID being checked', 'tag-warn', 'Our team is checking your ID, usually within 2 working days. Until then you can list 1 car, which we look at before it goes live.'],
  more_info: ['We need a little more', 'tag-warn', 'Please read the note from our team below, then send your ID again.'],
  approved: ['✓ Verified Seller', 'tag-ok', 'Your ID is checked. You can have up to 5 cars for sale, and they go live at once.'],
  rejected: STATUS.rejected, suspended: STATUS.suspended
};
const CAR_STATUS = { pending: ['Waiting for approval', 'tag-warn'], available: ['For sale', 'tag-ok'], reserved: ['Reserved', 'tag-info'], sold: ['Sold', 'tag-grey'], hidden: ['Hidden', 'tag-bad'] };
const Tag = ({ s, map }) => { const x = map[s] || [s, 'tag-grey']; return <span className={'tag ' + x[1]}>{x[0]}</span>; };
const Err = ({ e }) => (e ? <div className="err" role="alert">{e}</div> : null);

function Steps({ at, phone = true }) {
  // While phone texts are paused (no SMS sender yet) the Phone step is skipped: the email code is the check
  const names = ['Email', 'Account', 'Phone', 'Seller details'].filter((n) => phone || n !== 'Phone');
  const pos = !phone && at === 3 ? 2 : at;
  return <ol className="signup-steps" aria-label="Sign-up steps">{names.map((n, i) => <li key={n} className={i < pos ? 'done' : i === pos ? 'on' : ''} aria-current={i === pos ? 'step' : undefined}><span>{i + 1}</span>{n}</li>)}</ol>;
}

// ---------- /dealers/join ----------
// One sign-up for every seller. After the account (and phone) step the seller says who they are:
//   a dealer (business with CAC papers)  -> BusinessStep  -> "Verified Dealer" once staff check the CAC
//   selling my own car                   -> PersonalStep  -> "Private Seller" (1 car, each checked by staff),
//                                                           or "Verified Seller" (up to 5) once staff check an ID
// ?as=dealer lets a private or verified seller register as a dealer; ?as=id lets a private seller send their ID.
export function DealerJoin() {
  useTitle('Sell your car on Korrect Cars | Dealers and private sellers', 'Car dealers and people selling their own car can list on Korrect Cars. Free to join; we check every dealer\'s CAC papers and verified sellers\' ID.');
  const { user, setUser } = useApp();
  const { go, query } = useRouter();
  const me = useApi(user ? '/dealer/me' : null, [user && user.id]);
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  const [stage, setStage] = useState('email'); // email -> code -> account (then phone / seller details, from /dealer/me)
  const [kind, setKind] = useState(query.get('as') === 'dealer' ? 'business' : query.get('as') === 'private' || query.get('as') === 'id' ? 'personal' : '');
  if (user === undefined || (user && me.loading && !me.data)) return <Loading />;
  if (user && me.data && me.data.user.staff) return <Box title="Staff account"><p>You are signed in with a Korrect Cars staff account. Sellers need their own account: sign out and use a different email.</p></Box>;
  const d = user && me.data && me.data.dealer;
  const blocked = d && ['rejected', 'suspended'].includes(d.status);
  const upgrade = d && d.kind === 'personal' && !blocked && query.get('as') === 'dealer';
  const sendId = d && d.kind === 'personal' && ['unverified', 'more_info'].includes(d.status);
  const fixing = d && ['more_info', 'draft'].includes(d.status);
  if (d && !upgrade && !sendId && !fixing) { go('/dealer', { replace: true }); return <Loading />; }
  const shownKind = upgrade ? 'business' : d ? d.kind : kind;
  const at = !user ? (stage === 'account' ? 1 : 0) : me.data && !me.data.user.phoneVerified ? 2 : 3;
  const done = async () => { forgetBoot('/auth/me'); try { setUser((await api('/auth/me')).user); } catch (_e) { /* header updates on the next page load */ } go('/dealer'); };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 44 }}>{upgrade ? 'Register as a dealer' : 'Sell your car on Korrect Cars'}</h1>
      <p className="muted">Free to join. Dealers and private sellers both list here. We check every dealer's CAC papers, and buyers always see who has been checked.</p>
      <Steps at={at} phone={!me.data || me.data.user.phoneCheck !== false} />
      {!user && stage === 'email' && <EmailStep onSent={(e) => { setEmail(e); setStage('code'); }} />}
      {!user && stage === 'code' && <CodeStep email={email} onBack={() => setStage('email')} onOk={(p) => { setPass(p); setStage('account'); }} />}
      {!user && stage === 'account' && <AccountStep email={email} pass={pass} onRestart={() => setStage('email')} onDone={(u) => setUser(u)} />}
      {user && at === 2 && <PhoneStep phone={me.data.user.phone} onDone={me.reload} />}
      {user && at === 3 && !shownKind && <KindStep onPick={setKind} />}
      {user && at === 3 && shownKind === 'business' && <BusinessStep dealer={upgrade ? null : d} upgrading={upgrade} onDone={done} />}
      {user && at === 3 && shownKind === 'personal' && <PersonalStep dealer={d} name={me.data.user.name} onDone={done} onBack={d ? null : () => setKind('')} />}
      {!user && <p className="small muted" style={{ marginTop: 16 }}>Already have a Korrect Cars account? <Link to="/login?next=/dealers/join">Sign in</Link> and carry on from here.</p>}
    </div>
  );
}

function KindStep({ onPick }) {
  return (
    <div className="box">
      <h2>Who is selling?</h2>
      <div className="opts" role="group" aria-label="Who is selling" style={{ display: 'grid', gap: 12 }}>
        <button type="button" className="opt" style={{ textAlign: 'center', padding: '16px 22px' }} onClick={() => onPick('business')}>
          <b>I'm a car dealer (a business)</b><div className="small muted">You have CAC papers (RC or BN). Once we check them, your cars show <SellerBadge type="dealer" />. Up to 50 cars in your first 3 months, then no limit.</div></button>
        <button type="button" className="opt" style={{ textAlign: 'center', padding: '16px 22px' }} onClick={() => onPick('personal')}>
          <b>I'm selling my own car</b><div className="small muted">No CAC needed. Without an ID check you can list 1 car, shown as <SellerBadge type="private" />, and our team looks at it before it goes live. Send your ID to become a <SellerBadge type="verified" /> and list up to 5.</div></button>
      </div>
    </div>
  );
}

// Selling my own car: the name buyers see, where the car is, and (optional) an ID + selfie for "Verified Seller"
const ID_TYPES = [['nin', 'NIN slip'], ['licence', "Driver's licence"], ['passport', 'International passport'], ['voter', "Voter's card"]];
function PersonalStep({ dealer, name, onDone, onBack }) {
  const d = dealer || {};
  const okLga = d.state && lgasOf(d.state).includes(d.lga) ? d.lga : '';
  const [f, setF] = useState({ displayName: d.businessName || name || '', state: STATES.includes(d.state) ? d.state : '', lga: okLga, whatsapp: d.whatsapp || '', idType: '' });
  const [idDoc, setIdDoc] = useState(null); const [selfie, setSelfie] = useState(null);
  const [withId, setWithId] = useState(!!dealer);
  const [err, setErr] = useState(''); const [field, setField] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const IMG = ['image/jpeg', 'image/png', 'image/webp'];
  const problem = () => {
    if (f.displayName.trim().length < 2) return ['displayName', 'Enter the name buyers will see.'];
    if (!f.state) return ['state', 'Choose the state the car is in.'];
    if (!f.lga) return ['lga', `Choose the local government area (LGA) in ${f.state}.`];
    if (withId) {
      if (!f.idType) return ['idType', 'Choose which ID you are sending.'];
      if (!idDoc) return ['idDoc', 'Add a photo of your ID.'];
      if (![...IMG, 'application/pdf'].includes(idDoc.type)) return ['idDoc', 'The ID must be a photo (JPG, PNG or WEBP) or a PDF.'];
      if (!selfie) return ['selfie', 'Add a selfie holding the same ID.'];
      if (!IMG.includes(selfie.type)) return ['selfie', 'The selfie must be a photo (JPG, PNG or WEBP).'];
    }
    return null;
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setField('');
    const p = problem();
    if (p) { setField(p[0]); setErr(p[1]); const el = document.getElementById('ps-' + p[0]); if (el) el.focus(); return; }
    setBusy(true);
    const fd = new FormData();
    for (const k of ['displayName', 'state', 'lga', 'whatsapp']) if (f[k]) fd.append(k, f[k]);
    try {
      if (withId) { fd.append('idType', f.idType); fd.append('idDoc', idDoc.type === 'application/pdf' ? idDoc : await shrinkPhoto(idDoc)); fd.append('selfie', await shrinkPhoto(selfie)); }
      await api('/dealer/personal', { method: 'POST', form: fd }); onDone();
    } catch (e2) { setErr(e2.message); setField((e2.data && e2.data.field) || ''); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit} noValidate>
      <h2>{dealer ? 'Become a Verified Seller' : 'About you'}</h2>
      {d.status === 'more_info' && d.lastNote && <p className="note" role="note"><b>Note from our team:</b> {d.lastNote}</p>}
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="ps-displayName">Name buyers see <span className="req" aria-hidden="true">*</span></label><input id="ps-displayName" className="input" maxLength={80} value={f.displayName} onChange={set('displayName')} aria-invalid={field === 'displayName'} /><div className="hint">Use your real name: it should match the car's papers.</div></div>
      <div className="grid2">
        <div className="field"><label className="f" htmlFor="ps-state">State the car is in <span className="req" aria-hidden="true">*</span></label><select id="ps-state" className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, lga: '' })} aria-invalid={field === 'state'}><option value="">Choose state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label className="f" htmlFor="ps-lga">LGA <span className="req" aria-hidden="true">*</span></label><select id="ps-lga" className="input" disabled={!f.state} value={f.lga} onChange={set('lga')} aria-invalid={field === 'lga'}><option value="">{f.state ? `Choose LGA in ${f.state}` : 'Choose a state first'}</option>{lgasOf(f.state).map((l) => <option key={l}>{l}</option>)}</select></div>
      </div>
      <div className="field"><label className="f" htmlFor="ps-wa">WhatsApp for buyers (if different from your phone)</label><input id="ps-wa" className="input" type="tel" value={f.whatsapp} onChange={set('whatsapp')} /></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '6px 0 12px' }}><input type="checkbox" checked={withId} onChange={(e) => setWithId(e.target.checked)} style={{ marginTop: 4 }} /><span><b>Send my ID now</b> to become a Verified Seller (up to 5 cars, shown with a ✓ badge). Without it you can list 1 car as a Private Seller, and buyers are told you are not verified.</span></label>
      {withId && <>
        <div className="field"><label className="f" htmlFor="ps-idType">Which ID? <span className="req" aria-hidden="true">*</span></label><select id="ps-idType" className="input" value={f.idType} onChange={set('idType')} aria-invalid={field === 'idType'}><option value="">Choose</option>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label className="f" htmlFor="ps-idDoc">Photo of the ID <span className="req" aria-hidden="true">*</span></label><input id="ps-idDoc" type="file" className="input" style={{ paddingTop: 12 }} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setIdDoc(e.target.files[0] || null)} aria-invalid={field === 'idDoc'} /><div className="hint">All four corners, your photo and name readable.</div></div>
        <div className="field"><label className="f" htmlFor="ps-selfie">Selfie holding the same ID <span className="req" aria-hidden="true">*</span></label><input id="ps-selfie" type="file" className="input" style={{ paddingTop: 12 }} accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => setSelfie(e.target.files[0] || null)} aria-invalid={field === 'selfie'} /></div>
        <p className="small muted">Only our team sees your ID and selfie. They are kept for 12 months after our decision, then deleted.</p>
      </>}
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : withId ? 'Send for checking' : 'Start selling'}</button>
      {onBack && <p className="small" style={{ marginTop: 10 }}><button type="button" className="linkbtn" onClick={onBack}>Back: I'm a dealer</button></p>}
    </form>
  );
}
const Box = ({ title, children }) => <div className="wrap sec-sm" style={{ maxWidth: 620 }}><h1 style={{ fontSize: 40 }}>{title}</h1><div className="box">{children}</div></div>;

function EmailStep({ onSent }) {
  const [email, setEmail] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api('/dealer/signup/code', { method: 'POST', body: { email } }); onSent(d.email); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit}>
      <h2>Your email</h2>
      <p className="small muted">We send a 6-digit code to prove the inbox is yours. Buyers' messages and our team's emails go here, so use one you check every day.</p>
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="dj-email">Email</label><input id="dj-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}</button>
    </form>
  );
}

function CodeStep({ email, onOk, onBack }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [again, setAgain] = useState('');
  const ref = useRef(null); useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api('/dealer/signup/verify', { method: 'POST', body: { email, code } }); onOk(d.pass); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const resend = async () => { setAgain('sending'); try { await api('/dealer/signup/code', { method: 'POST', body: { email } }); setAgain('sent'); } catch (e2) { setAgain(''); setErr(e2.message); } };
  return (
    <form className="box" onSubmit={submit}>
      <h2>Check your email</h2>
      <p>We sent a 6-digit code to <b>{email}</b>. It works for 15 minutes. Can't see it? Check spam or promotions.</p>
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="dj-code">Code</label><input id="dj-code" ref={ref} className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-line btn-sm" onClick={resend} disabled={again === 'sending'}>{again === 'sent' ? 'New code sent' : again === 'sending' ? 'Sending…' : 'Send a new code'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>Use a different email</button>
      </div>
    </form>
  );
}

function AccountStep({ email, pass, onDone, onRestart }) {
  const [f, setF] = useState({ name: '', phone: '', password: '' }); const [err, setErr] = useState(''); const [field, setField] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setField(''); setBusy(true);
    try { const d = await api('/dealer/signup/account', { method: 'POST', body: { pass, ...f } }); onDone(d.user); } catch (e2) {
      if (e2.data && e2.data.restart) { onRestart(); return; }
      setErr(e2.message); setField((e2.data && e2.data.field) || '');
    } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit}>
      <h2>Your account</h2>
      <p className="small muted">Email confirmed: <b>{email}</b>. This is you, the person; your business comes next.</p>
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="dj-name">Your full name</label><input id="dj-name" className="input" required minLength={2} maxLength={80} autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={field === 'name'} /></div>
      <div className="field"><label className="f" htmlFor="dj-phone">Your mobile number</label><input id="dj-phone" className="input" type="tel" required autoComplete="tel" placeholder="0803 123 4567" value={f.phone} onChange={set('phone')} aria-invalid={field === 'phone'} /><div className="hint">Nigerian number. We text a code to it next.</div></div>
      <div className="field"><label className="f" htmlFor="dj-pw">Password</label><input id="dj-pw" className="input" type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={f.password} onChange={set('password')} aria-invalid={field === 'password'} /><div className="hint">At least 10 characters. Three or four unrelated words are easy to remember and hard to guess.</div></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create my account'}</button>
    </form>
  );
}

function PhoneStep({ phone, onDone }) {
  const [num, setNum] = useState(phone || ''); const [sent, setSent] = useState(null); const [code, setCode] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (e) => {
    if (e) e.preventDefault(); setErr(''); setBusy(true);
    try { setSent(await api('/dealer/phone/send', { method: 'POST', body: { phone: num } })); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/dealer/phone/verify', { method: 'POST', body: { code } }); onDone(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  if (!sent) return (
    <form className="box" onSubmit={send}>
      <h2>Your phone</h2>
      <p className="small muted">We text a 6-digit code to confirm the number. Up to 3 codes per number a day.</p>
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="dj-tel">Mobile number</label><input id="dj-tel" className="input" type="tel" required autoComplete="tel" value={num} onChange={(e) => setNum(e.target.value)} /></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : 'Text me a code'}</button>
    </form>
  );
  return (
    <form className="box" onSubmit={verify}>
      <h2>Enter the text code</h2>
      <p>We sent a code to <b>{sent.phone}</b>. It works for 10 minutes.</p>
      {sent.testCode && <p className="note" role="note">Test site: no text was sent. Your code is <b>{sent.testCode}</b>.</p>}
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="dj-otp">Code</label><input id="dj-otp" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Checking…' : 'Confirm my phone'}</button>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}><button type="button" className="btn btn-line btn-sm" onClick={() => send()} disabled={busy}>Send again</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSent(null)}>Change number</button></div>
    </form>
  );
}

function BusinessStep({ dealer, onDone, upgrading = false }) {
  const d = dealer || {};
  const okLga = d.state && lgasOf(d.state).includes(d.lga) ? d.lga : '';
  const [f, setF] = useState({ businessName: d.businessName || '', cacType: d.cacType || 'RC', cacNumber: d.cacNumber || '', state: STATES.includes(d.state) ? d.state : '', lga: okLga, address: d.address || '', whatsapp: d.whatsapp || '', about: d.about || '' });
  const [cac, setCac] = useState(null); const [err, setErr] = useState(''); const [field, setField] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Business name, CAC number, state, LGA and the CAC certificate (PDF or photo) are all required
  const CAC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const problem = () => {
    if (f.businessName.trim().length < 3) return ['businessName', 'Enter the business name as it is on your CAC certificate.'];
    if (!/^\d{4,9}$/.test(String(f.cacNumber).replace(/^(RC|BN|IT)\s*/i, '').replace(/[\s-]/g, ''))) return ['cacNumber', 'Enter the CAC number: 4 to 9 digits.'];
    if (!f.state) return ['state', 'Choose the state your business is in.'];
    if (!f.lga) return ['lga', `Choose the local government area (LGA) in ${f.state}.`];
    if (!dealer && !cac) return ['cac', 'Add your CAC certificate as a PDF or a photo.'];
    if (cac && !CAC_TYPES.includes(cac.type)) return ['cac', 'The CAC certificate must be a PDF or a photo (JPG, PNG or WEBP).'];
    if (cac && cac.size > 8 * 1024 * 1024) return ['cac', 'The CAC certificate must be under 8 MB. Take a photo of it instead of a scan, or save a smaller PDF.'];
    return null;
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setField('');
    const p = problem();
    if (p) { setField(p[0]); setErr(p[1]); const el = document.getElementById({ businessName: 'db-name', cacNumber: 'db-cac', state: 'db-state', lga: 'db-lga', cac: 'db-file' }[p[0]]); if (el) el.focus(); return; }
    setBusy(true);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v) fd.append(k, v); });
    try {
      if (cac) fd.append('cac', cac.type === 'application/pdf' ? cac : await shrinkPhoto(cac));
      await api('/dealer', { method: 'POST', form: fd }); onDone();
    } catch (e2) { setErr(e2.message); setField((e2.data && e2.data.field) || ''); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit} noValidate>
      <h2>Your business</h2>
      {upgrading && <p className="note" role="note">Once we check your CAC papers you become a <SellerBadge type="dealer" /> and the 5-car limit is lifted. Your cars stay live while we check.</p>}
      {d.status === 'more_info' && d.lastNote && <p className="note" role="note"><b>Note from our team:</b> {d.lastNote}</p>}
      <p className="small muted">As written on your CAC certificate. Fields marked <span aria-hidden="true">*</span><span className="sr">with a star</span> are required. Only our team sees the certificate; it is kept for 12 months after our decision.</p>
      <Err e={err} />
      <div className="field"><label className="f" htmlFor="db-name">Business name <span className="req" aria-hidden="true">*</span></label><input id="db-name" className="input" required minLength={3} maxLength={160} value={f.businessName} onChange={set('businessName')} aria-invalid={field === 'businessName'} /></div>
      <div className="grid2">
        <div className="field"><label className="f" htmlFor="db-type">Registered as</label><select id="db-type" className="input" value={f.cacType} onChange={set('cacType')}><option value="RC">Company (RC)</option><option value="BN">Business name (BN)</option><option value="IT">Trustees (IT)</option></select></div>
        <div className="field"><label className="f" htmlFor="db-cac">CAC number <span className="req" aria-hidden="true">*</span></label><input id="db-cac" className="input" required inputMode="numeric" placeholder="1234567" value={f.cacNumber} onChange={set('cacNumber')} aria-invalid={field === 'cacNumber'} /></div>
        <div className="field"><label className="f" htmlFor="db-state">State <span className="req" aria-hidden="true">*</span></label><select id="db-state" className="input" required value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, lga: '' })} aria-invalid={field === 'state'}><option value="">Choose state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label className="f" htmlFor="db-lga">Local government area (LGA) <span className="req" aria-hidden="true">*</span></label><select id="db-lga" className="input" required disabled={!f.state} value={f.lga} onChange={set('lga')} aria-invalid={field === 'lga'}><option value="">{f.state ? `Choose LGA in ${f.state}` : 'Choose a state first'}</option>{lgasOf(f.state).map((l) => <option key={l}>{l}</option>)}</select></div>
      </div>
      <div className="field"><label className="f" htmlFor="db-addr">Address buyers can visit</label><input id="db-addr" className="input" required minLength={8} maxLength={250} value={f.address} onChange={set('address')} aria-invalid={field === 'address'} /></div>
      <div className="field"><label className="f" htmlFor="db-wa">WhatsApp for buyers (if different)</label><input id="db-wa" className="input" type="tel" value={f.whatsapp} onChange={set('whatsapp')} /></div>
      <div className="field"><label className="f" htmlFor="db-about">About your business (optional)</label><textarea id="db-about" className="input" rows={3} maxLength={1500} value={f.about} onChange={set('about')} /></div>
      <div className="field"><label className="f" htmlFor="db-file">CAC certificate {!dealer && <span className="req" aria-hidden="true">*</span>}{d.status === 'more_info' ? ' (only if asked for a new one)' : ''}</label><input id="db-file" type="file" className="input" style={{ paddingTop: 12 }} accept="image/jpeg,image/png,image/webp,application/pdf" required={!dealer} onChange={(e) => setCac(e.target.files[0] || null)} aria-invalid={field === 'cac'} aria-describedby="db-file-hint" /><div id="db-file-hint" className="hint">PDF or photo (JPG, PNG or WEBP), up to 8 MB. All four corners and the RC/BN number must be readable.</div></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send for review'}</button>
    </form>
  );
}

// ---------- /dealer ----------
// Views of all the dealer's cars: today, this week, 30 days, all time, and a bar per day for the last 30 days.
// Counted once per visitor per car per day; bots, staff and the dealer's own team are not counted.
const dayName = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
function ViewsPanel({ s }) {
  const [hover, setHover] = useState(null);
  if (!s) return null;
  const max = Math.max(1, ...s.daily.map((d) => d.views));
  const shown = hover != null ? s.daily[hover] : s.daily[s.daily.length - 1];
  return (
    <div className="box">
      <h2 style={{ marginBottom: 4 }}>Views of your cars</h2>
      <p className="small muted" style={{ marginTop: 0 }}>How many times buyers opened your cars' pages. Each buyer counts once per car per day; search engines, our staff and your own team are not counted.</p>
      <div className="kpis" style={{ marginBottom: 12 }}>
        {[['Today', s.today], ['This week (7 days)', s.week], ['This month (30 days)', s.month], ['All time', s.total], ['Buyer requests', s.enquiries]].map(([l, v]) => (
          <div key={l} className="kpi"><div className="small muted">{l}</div><div className="v">{Number(v).toLocaleString('en-NG')}</div></div>))}
      </div>
      <div className="small" aria-live="polite" style={{ minHeight: 22 }}><b>{dayName(shown.day)}</b>: {shown.views} view{shown.views === 1 ? '' : 's'}</div>
      <div className="vbars" role="img" aria-label={`Views per day for the last 30 days. Highest: ${max}.`} onMouseLeave={() => setHover(null)}>
        {s.daily.map((d, i) => (
          <button type="button" key={d.day} className={'vbar' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} aria-label={`${dayName(d.day)}: ${d.views} views`}>
            <span style={{ height: d.views ? `${Math.max(4, (d.views / max) * 100)}%` : 0 }} />
          </button>))}
      </div>
      <div className="vbars-axis small muted"><span>{dayName(s.daily[0].day)}</span><span>Today</span></div>
      <details style={{ marginTop: 8 }}><summary className="small">Show as a table</summary>
        <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Day</th><th className="num">Views</th></tr></thead>
          <tbody>{s.daily.slice().reverse().map((d) => <tr key={d.day}><td>{dayName(d.day)}</td><td className="num">{d.views}</td></tr>)}</tbody></table></details>
    </div>
  );
}

export function DealerHome() {
  useTitle('My seller page | Korrect Cars');
  const { user, cfg } = useApp();
  const { go } = useRouter();
  const me = useApi(user ? '/dealer/me' : null, [user && user.id]);
  const cars = useApi(me.data && me.data.dealer ? '/dealer/cars' : null, [me.data && me.data.dealer && me.data.dealer.id]);
  const stats = useApi(me.data && me.data.dealer ? '/dealer/stats' : null, [me.data && me.data.dealer && me.data.dealer.id]);
  if (user === undefined || (user && !me.data)) return <Loading />;
  if (!user) { go('/login?next=/dealer', { replace: true }); return <Loading />; }
  const d = me.data.dealer;
  if (!d) { go('/dealers/join', { replace: true }); return <Loading />; }
  const personal = d.kind === 'personal';
  const st = (personal ? SELLER_STATUS : STATUS)[d.status] || STATUS.draft;
  const carStatus = personal && d.status !== 'approved' ? { ...CAR_STATUS, pending: ['Waiting for our check', 'tag-warn'] } : CAR_STATUS;
  const canList = !['rejected', 'suspended'].includes(d.status);
  const list = (cars.data && cars.data.cars) || [];
  const setStatus = async (c, status) => { try { await api(`/dealer/cars/${c.id}/status`, { method: 'POST', body: { status } }); cars.reload(); } catch (e) { window.alert(e.message); } };
  return (
    <div className="wrap sec-sm">
      <div className="sec-head"><div><h1 style={{ fontSize: 40, margin: 0 }}>{d.businessName}</h1><div className="small muted">{personal ? `Selling my own car · ${[d.lga, d.state].filter(Boolean).join(', ')}` : `${d.cacType} ${d.cacNumber} · ${d.state}`}</div></div>
        {canList && <Link to="/dealer/cars/new" className="btn btn-red">+ Add a car</Link>}</div>
      <div className="box" role="status"><span className={'tag ' + st[1]}>{st[0]}</span> <span>{st[2]}</span>
        {d.lastNote && ['more_info', 'rejected', 'suspended'].includes(d.status) && <p className="note" style={{ marginTop: 10 }}><b>Note from our team:</b> {d.lastNote}</p>}
        {d.status === 'more_info' && <p style={{ marginTop: 10 }}><Link to="/dealers/join" className="btn btn-dark btn-sm">{personal ? 'Send my ID again' : 'Update my details'}</Link></p>}
        {personal && d.status === 'unverified' && <p style={{ marginTop: 10 }}><Link to="/dealers/join?as=id" className="btn btn-dark btn-sm">Send my ID: become a Verified Seller (5 cars)</Link></p>}
        {personal && canList && <p className="small" style={{ marginTop: 10 }}>{d.status === 'approved' ? 'Selling more than 5 cars?' : 'A car business?'} <Link to="/dealers/join?as=dealer">Register as a dealer</Link> with your CAC papers.</p>}
        {!canList && <p style={{ marginTop: 10 }}><ContactUs className="btn btn-line btn-sm">Contact Korrect Cars</ContactUs></p>}
      </div>
      <div className="kpis">
        <div className="box kpi"><div className="small muted">Cars for sale</div><div className="v">{d.liveCars}{d.liveLimit ? <span className="small muted"> / {d.liveLimit}</span> : null}</div>{d.liveLimit ? <div className="small muted">{!personal ? 'limit for your first 3 months' : d.status === 'approved' ? 'limit for Verified Sellers' : 'limit until your ID is checked'}</div> : null}</div>
        <div className="box kpi"><div className="small muted">All your cars</div><div className="v">{list.length}</div></div>
      </div>
      <BuyerRequests />
      <ViewsPanel s={stats.data} />
      <div className="box">
        <h2>Your cars</h2>
        {cars.loading && !cars.data ? <Loading /> : !list.length ? <p className="muted">No cars yet. {canList && <Link to="/dealer/cars/new">Add your first car</Link>}</p> : (
          <div className="scroll-x"><table className="tbl"><thead><tr><th>Car</th><th>Price</th><th className="num">Views today</th><th className="num">This week</th><th className="num">This month</th><th className="num">All time</th><th className="num">Buyer requests</th><th>Status</th><th /></tr></thead><tbody>
            {list.map((c) => <tr key={c.id}>
              <td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={rs(firstPhoto(c), 400)} alt="" /><div><b>{c.title}</b><div className="small muted">VIN …{String(c.vin || '').slice(-6)} · added {date(c.created_at)}</div></div></div></td>
              <td>{priceText(c)}</td><td className="num">{c.views_today}</td><td className="num">{c.views_week}</td><td className="num">{c.views_month}</td><td className="num">{c.views}</td><td className="num">{c.enquiries}{c.enquiries_week ? <span className="small muted"> ({c.enquiries_week} this week)</span> : null}</td><td><Tag s={c.status} map={carStatus} /></td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {c.status === 'available' && <Link to={'/cars/' + c.slug} className="btn btn-line btn-sm" target="_blank">View</Link>}{' '}
                {canList && <Link to={'/dealer/cars/' + c.id} className="btn btn-dark btn-sm">Edit</Link>}{' '}
                {canList && ['available', 'pending'].includes(c.status) && <button className="btn btn-line btn-sm" onClick={() => setStatus(c, 'sold')}>Mark sold</button>}
                {canList && ['sold', 'hidden'].includes(c.status) && <button className="btn btn-line btn-sm" onClick={() => setStatus(c, 'available')}>Put back on sale</button>}
              </td>
            </tr>)}
          </tbody></table></div>)}
      </div>
      {!personal && ['owner', 'manager'].includes(d.role) && <TeamPanel />}
      {d.role && d.role !== 'owner' && <p className="small muted">You are a {d.role} in this team{d.role === 'lister' ? ': you see and edit the cars you added, and their buyer requests' : ''}.</p>}
    </div>
  );
}

// Buyer requests: viewings, offers and questions buyers sent about this seller's cars (Korrect Cars keeps a copy)
const LEAD_TYPE = { viewing: 'Wants to view', offer: 'Offer', contact: 'Question' };
const waBuyer = (l) => `https://wa.me/${String(l.phone).replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hello ${l.name.split(' ')[0]}, this is about the ${l.title} on Korrect Cars.`)}`;
function BuyerRequests() {
  const { data, reload } = useApi('/dealer/leads');
  const [show, setShow] = useState('open');
  if (!data) return null;
  const list = data.leads.filter((l) => (show === 'open' ? l.seller_status === 'new' : true));
  const mark = async (l, status) => { try { await api(`/dealer/leads/${l.id}`, { method: 'POST', body: { status } }); reload(); } catch (e) { window.alert(e.message); } };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Buyer requests {data.open ? <span className="tag tag-warn">{data.open} new</span> : null}</h2>
        <select className="input" style={{ maxWidth: 170 }} aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)}><option value="open">Not replied yet</option><option value="all">All requests</option></select></div>
      <p className="small muted" style={{ marginTop: 0 }}>Viewings, offers and questions buyers sent about your cars. We email you each one; reply quickly, buyers move on. Pay Small Small requests go to Korrect Cars, who work with the credit partners.</p>
      {!list.length ? <p className="muted">{data.leads.length ? 'All caught up.' : 'No requests yet.'}</p> : list.map((l) => (
        <div className="row" key={l.id} style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}><b>{LEAD_TYPE[l.type] || l.type}</b>{l.type === 'offer' && l.offer_amount ? `: ${priceText({ price: l.offer_amount })}` : ''}{l.type === 'viewing' && l.preferred_date ? ` · ${l.preferred_date}` : ''} · <Link to={'/cars/' + l.slug} target="_blank">{l.title}</Link>
            <div className="small">{l.name} · <a href={'tel:' + l.phone}>{l.phone}</a>{l.email ? <> · {l.email}</> : null} · {date(l.created_at)}</div>
            {l.message && <div className="small muted">“{l.message}”</div>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-wa btn-sm" href={waBuyer(l)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            {l.seller_status === 'new' ? <button className="btn btn-dark btn-sm" onClick={() => mark(l, 'replied')}>Mark replied</button> : <span className="tag tag-grey">{l.seller_status}</span>}
            {l.seller_status !== 'closed' && <button className="btn btn-line btn-sm" onClick={() => mark(l, 'closed')}>Close</button>}
          </div>
        </div>))}
    </div>
  );
}

// Team (dealers): the owner invites a manager or a lister by email; managers can see the team
const ROLE_TEXT = { owner: 'Owner', manager: 'Manager (everything except the team)', lister: 'Lister (adds cars, edits their own)' };
function TeamPanel() {
  const { data, reload } = useApi('/dealer/team');
  const [f, setF] = useState({ email: '', role: 'lister' }); const [code, setCode] = useState(''); const [needCode, setNeedCode] = useState(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return null;
  // Team changes from a device trusted for less than a day ask for an emailed code; the change is then sent again with it
  const run = async (fn) => {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(needCode ? code : undefined); setNeedCode(null); setCode(''); reload(); return true; } catch (e) {
      if (e.data && e.data.code === 'STEP_UP') { setNeedCode(() => fn); setErr(e.message); } else setErr(e.message);
      return false;
    } finally { setBusy(false); }
  };
  const invite = (e) => { e.preventDefault(); run(async (stepCode) => { await api('/dealer/team', { method: 'POST', body: { ...f, stepCode } }); setMsg(`Invitation sent to ${f.email}. The link works once, for 72 hours.`); setF({ email: '', role: 'lister' }); }); };
  const remove = (m) => { if (window.confirm(`Remove ${m.name} from your team? The cars they added stay with your business.`)) run(async (stepCode) => api(`/dealer/team/${m.id}`, { method: 'DELETE', body: { stepCode } })); };
  return (
    <div className="box">
      <h2>Your team</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Each person signs in with their own email. {ROLE_TEXT.manager}; {ROLE_TEXT.lister.toLowerCase()}.</p>
      {data.members.map((m) => <div className="row" key={m.id}><div><b>{m.name}</b> <span className="small muted">{m.email} · {ROLE_TEXT[m.role] || m.role}</span></div>
        {data.canInvite && m.role !== 'owner' && <button className="btn btn-line btn-sm" disabled={busy} onClick={() => remove(m)}>Remove</button>}</div>)}
      {data.invites.map((i) => <div className="row" key={i.id}><div className="small">Invited: {i.email} ({i.role}) · until {date(i.expires_at)}</div>
        {data.canInvite && <button className="btn btn-line btn-sm" onClick={() => run(() => api(`/dealer/team/invites/${i.id}`, { method: 'DELETE' }))}>Cancel</button>}</div>)}
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      {msg && <div className="okmsg" role="status" style={{ marginTop: 10 }}>{msg}</div>}
      {needCode && <div className="field" style={{ marginTop: 10 }}><label className="f" htmlFor="tm-code">Code from your email</label>
        <div style={{ display: 'flex', gap: 8 }}><input id="tm-code" className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 160 }} />
          <button className="btn btn-red" disabled={busy || code.length !== 6} onClick={() => run(needCode)}>Confirm</button></div></div>}
      {data.canInvite && !needCode && <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} noValidate>
        <input className="input" type="email" placeholder="Their email" aria-label="Their email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={{ flex: 2, minWidth: 200 }} />
        <select className="input" aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={{ flex: 1, minWidth: 140 }}><option value="lister">Lister</option><option value="manager">Manager</option></select>
        <button className="btn btn-dark" disabled={busy || !f.email}>Invite</button></form>}
      {!data.canInvite && data.members.length < 2 && <p className="small muted">You can add people once your business is approved.</p>}
    </div>
  );
}

// ---------- /dealers/invite?token=… : accept a team invitation ----------
export function DealerInvite() {
  useTitle('Join a team | Korrect Cars');
  const { user, setUser } = useApp();
  const { query, go } = useRouter();
  const token = query.get('token') || '';
  const inv = useApi('/dealer/invite/' + encodeURIComponent(token), [user && user.id]);
  const [f, setF] = useState({ name: '', phone: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (inv.loading && !inv.data) return <Loading />;
  if (inv.error) return <Box title="Invitation"><p>{inv.error.message}</p></Box>;
  const d = inv.data;
  const accept = async (e) => {
    if (e) e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api('/dealer/invite/' + encodeURIComponent(token), { method: 'POST', body: d.hasAccount ? {} : f });
      forgetBoot('/auth/me'); try { setUser((await api('/auth/me')).user); } catch (_e) { /* next page load */ }
      go('/dealer');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Box title={`Join ${d.business}`}>
      <p>You were invited as a <b>{d.role}</b>{d.role === 'lister' ? ' (you can add cars and edit the ones you add)' : ' (everything except the team)'}. Invitation for <b>{d.email}</b>.</p>
      {err && <div className="err" role="alert">{err}</div>}
      {d.hasAccount ? (user && user.email === d.email
        ? <button className="btn btn-red btn-block" disabled={busy} onClick={() => accept()}>{busy ? 'Joining…' : `Join ${d.business}`}</button>
        : <p><Link className="btn btn-red" to={'/login?next=' + encodeURIComponent('/dealers/invite?token=' + token)}>Sign in as {d.email}</Link></p>)
        : <form onSubmit={accept} noValidate>
          <div className="field"><label className="f" htmlFor="iv-name">Your full name</label><input id="iv-name" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label className="f" htmlFor="iv-phone">Mobile number</label><input id="iv-phone" className="input" type="tel" autoComplete="tel" placeholder="0803 123 4567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label className="f" htmlFor="iv-pw">Choose a password</label><input id="iv-pw" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><div className="hint">At least 10 characters. A few words you will remember works well.</div></div>
          <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Joining…' : 'Create my account and join'}</button>
        </form>}
    </Box>
  );
}

// ---------- /dealer/cars/new and /dealer/cars/:id ----------
const EMPTY = { title: '', make: '', model: '', body: '', trim: '', year: '', price: '', callForPrice: false, mileage: '', engine: '', transmission: 'Automatic', drivetrain: '', fuel: 'Petrol', color: '', interior: '', condition: 'Foreign Used', location: 'Lagos', vin: '', description: '', features: '', specsText: '', status: 'available' };
export function DealerCarForm({ id }) {
  const isNew = !id;
  useTitle((isNew ? 'Add a car' : 'Edit car') + ' | Korrect Cars');
  const { go } = useRouter();
  const existing = useApi(isNew ? null : '/dealer/cars/' + id);
  const catalog = useApi('/catalog');
  const [f, setF] = useState(EMPTY);
  const [keep, setKeep] = useState([]);
  const [vinState, setVinState] = useState(isNew ? null : { state: 'yours' });
  const [files, setFiles] = useState([]); const [plate, setPlate] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(''); const [checking, setChecking] = useState(false);
  const [filled, setFilled] = useState(0);
  const [pick, setPick] = useState({ choices: {}, withEngine: {} });
  useEffect(() => {
    const c = existing.data && existing.data.car; if (!c) return;
    setF({ ...EMPTY, title: c.title, make: c.make, model: c.model, body: c.body, trim: c.trim_level || '', year: c.year || '', price: Number(c.price) > 0 ? c.price : '', callForPrice: !(Number(c.price) > 0), mileage: c.mileage || '', engine: c.engine || '', transmission: c.transmission || '', drivetrain: c.drivetrain || '', fuel: c.fuel || '', color: c.color || '', interior: c.interior || '', condition: c.car_condition || '', location: c.location || '', vin: c.vin || '', description: c.description || '', features: (c.features || []).join('\n'), specsText: (c.specs || []).map((r) => `${r[0]}: ${r[1]}`).join('\n'), status: ['sold', 'hidden'].includes(c.status) ? c.status : 'available' });
    setKeep(c.photos || []);
  }, [existing.data]);
  if (!isNew && existing.error) return <Box title="Car not found"><p>This car is not on your list. <Link to="/dealer">Back to my cars</Link></p></Box>;
  if (!isNew && !existing.data) return <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const local = checkVin(f.vin);
  const vinOk = isNew ? vinState && vinState.state === 'free' && vinState.value === local.value : true;

  const lookUp = async (e) => {
    e.preventDefault(); setErr(''); setVinState(null);
    if (local.problems.length) { setErr(local.problems[0]); return; }
    setChecking(true);
    try {
      const d = await api('/dealer/vin-check?vin=' + encodeURIComponent(local.value));
      setVinState(d);
      if (d.state === 'free') { const r = applyPrefill(d.prefill); setFilled(r.n); setPick({ choices: r.choices, withEngine: r.withEngine }); setF((p) => ({ ...r.fill(p), vin: d.value })); } else setF((p) => ({ ...p, vin: d.value }));
    } catch (e2) { setErr(e2.message); } finally { setChecking(false); }
  };
  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (f.status === 'available' && !f.callForPrice && !(Number(String(f.price).replace(/[^0-9]/g, '')) > 0)) { setErr('Enter the price, or tick "Call for price".'); return; }
    if (f.status === 'available' && !/\d/.test(f.mileage)) { setErr('Enter the mileage (as shown on the dashboard).'); return; }
    if (isNew && !files.length && f.status !== 'hidden') { setErr('Add at least one photo of the car.'); return; }
    if (files.length + keep.length > 30) { setErr('A car can have up to 30 photos.'); return; }
    setBusy('Preparing photos…');
    const fd = new FormData();
    Object.entries({ ...f, price: f.callForPrice ? '' : String(f.price).replace(/[^0-9]/g, ''), color: String(f.color || '').trim(), interior: String(f.interior || '').trim() }).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, String(v)); });
    if (!isNew) { if (!keep.length) fd.append('keepPhotos', ''); keep.forEach((p) => fd.append('keepPhotos', p)); }
    try {
      for (const x of [...files].slice(0, 20)) fd.append('photos', await shrinkPhoto(x));
      if (plate) fd.append('vinPhoto', await shrinkPhoto(plate));
      setBusy('Saving…');
      await api('/dealer/cars' + (isNew ? '' : '/' + id), { method: isNew ? 'POST' : 'PUT', form: fd });
      go('/dealer');
    } catch (e2) {
      setErr(e2.message);
      if (e2.data && e2.data.code === 'VIN_TAKEN') setVinState({ state: 'taken', value: local.value, canClaim: true });
    } finally { setBusy(''); }
  };
  const tree = { ...(catalog.data || {}) };
  if (f.make && !tree[f.make]) tree[f.make] = {};
  const inp = (k, label, props = {}) => <div className="field"><label className="f" htmlFor={'dc-' + k}>{label}</label><input id={'dc-' + k} className="input" value={f[k]} onChange={set(k)} {...props} /></div>;

  return (
    <div className="wrap sec-sm" style={{ maxWidth: 820 }}>
      <p className="small"><Link to="/dealer">← My cars</Link></p>
      <h1 style={{ fontSize: 40 }}>{isNew ? 'Add a car' : 'Edit car'}</h1>
      <form className="box" onSubmit={lookUp} aria-labelledby="vin-h">
        <h2 id="vin-h">1. VIN or chassis number</h2>
        <p className="small muted">Each car can be listed once on Korrect Cars. Type the 17-character VIN from the dashboard or door frame, or the chassis number on Japanese cars.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 280px', marginBottom: 0 }}><label className="f" htmlFor="dc-vin">VIN</label>
            <input id="dc-vin" className="input mono" required autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24} value={f.vin} onChange={(e) => { setF({ ...f, vin: e.target.value }); if (isNew) setVinState(null); }} aria-describedby="dc-vin-hint" /></div>
          {isNew && <button className="btn btn-dark" disabled={checking || !f.vin}>{checking ? 'Checking…' : 'Check VIN'}</button>}
        </div>
        <div id="dc-vin-hint" className="hint" aria-live="polite">
          {f.vin && local.problems.length ? <span style={{ color: 'var(--bad)' }}>{local.problems[0]}</span> : f.vin && local.warnings.length ? local.warnings[0] : f.vin && local.type === 'vin17' ? 'Looks like a valid VIN.' : ''}
        </div>
        {vinState && vinState.state === 'free' && isNew && <p className="note" role="status">✓ This car is not listed yet. {filled > 0
          ? <>We filled in <b>{filled} detail{filled === 1 ? '' : 's'}</b> from the {vinState.prefill && vinState.prefill.source === 'factory' ? 'factory record' : 'VIN'}{vinState.prefill && vinState.prefill.title ? <> (<b>{vinState.prefill.title}</b>)</> : null}. Check them against the car, then add the price, mileage, colour and photos. The colour is never in the VIN: pick it below.</>
          : 'Fill in the details below.'}</p>}
        {vinState && vinState.state === 'yours' && isNew && <p className="note" role="status">You already list this car. <Link to={'/dealer/cars/' + vinState.carId}>Edit it instead</Link>.</p>}
        {vinState && vinState.state === 'taken' && <div className="err" role="alert">This car is already listed on Korrect Cars by another seller. If it is yours (you have the papers), you can ask our team to check: ownership claims open soon. Meanwhile, <a href={'mailto:info@korrectcars.com?subject=' + encodeURIComponent('VIN already listed: ' + (vinState.value || local.value))}>email us</a>.</div>}
        {vinState && vinState.state === 'locked' && <div className="err" role="alert">This VIN is on hold while our team checks it. Please contact us.</div>}
      </form>

      {vinOk && <form className="box" onSubmit={save} style={{ marginTop: 18 }}>
        <h2>2. The car</h2>
        <Err e={err} />
        <VinChoices choices={pick.choices} withEngine={pick.withEngine} f={f} setF={setF} />
        {inp('title', 'Title buyers see', { required: true, minLength: 3, maxLength: 140, placeholder: '2016 Toyota Camry SE' })}
        <div className="grid2">
          <div className="field"><label className="f" htmlFor="dc-make">Make</label><input id="dc-make" className="input" list="dc-makes" required value={f.make} onChange={set('make')} /><datalist id="dc-makes">{Object.keys(tree).map((m) => <option key={m} value={m} />)}</datalist></div>
          <div className="field"><label className="f" htmlFor="dc-model">Model</label><input id="dc-model" className="input" list="dc-models" required value={f.model} onChange={set('model')} /><datalist id="dc-models">{Object.keys(tree[f.make] || {}).map((m) => <option key={m} value={m} />)}</datalist></div>
          <div className="field"><label className="f" htmlFor="dc-body">Body type</label><select id="dc-body" className="input" required value={f.body} onChange={set('body')}><option value="">Choose</option>{['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan', 'Wagon', 'Bus'].map((b) => <option key={b}>{b}</option>)}</select></div>
          {inp('year', 'Year', { inputMode: 'numeric', maxLength: 4 })}
          <PriceField f={f} setF={setF} id="dc" />
          <MileageField f={f} setF={setF} id="dc" />
          {inp('trim', 'Trim', { list: 'dc-trims' })}<datalist id="dc-trims">{(pick.choices.trim || []).map((t) => <option key={t} value={t} />)}</datalist>{inp('engine', 'Engine')}{inp('transmission', 'Transmission')}{inp('drivetrain', 'Drivetrain')}{inp('fuel', 'Fuel')}
          <ColourFields f={f} setF={setF} id="dc" />
          <div className="field"><label className="f" htmlFor="dc-cond">Condition</label><select id="dc-cond" className="input" value={f.condition} onChange={set('condition')}>{['Foreign Used', 'Nigerian Used', 'Brand New'].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label className="f" htmlFor="dc-status">Show it</label><select id="dc-status" className="input" value={f.status} onChange={set('status')}><option value="available">For sale</option><option value="hidden">Hidden (draft)</option><option value="sold">Sold</option></select></div>
        </div>
        <FeatureTicks f={f} setF={setF} id="dc" />
        <div className="field"><label className="f" htmlFor="dc-specs">Specs (Label: value per line)</label><textarea id="dc-specs" className="input" rows={5} value={f.specsText} onChange={set('specsText')} /></div>
        <DescriptionField f={f} setF={setF} id="dc" />
        {!isNew && keep.length > 0 && <div className="field"><div className="f">Photos (first one is the cover)</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{keep.map((p, i) => (
          <div key={p}><img src={rs(p, 400)} alt={`Photo ${i + 1}`} className="thumb" style={{ width: 120, height: 90 }} />
            <div><button type="button" className="btn btn-line btn-sm" onClick={() => setKeep(keep.filter((x) => x !== p))}>Remove</button></div></div>))}</div></div>}
        <div className="field"><label className="f" htmlFor="dc-ph">{isNew ? 'Photos' : 'Add photos'} (up to 20 per save)</label><input id="dc-ph" type="file" className="input" style={{ paddingTop: 12 }} multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(e.target.files)} />
          <div className="hint">{files.length ? `${files.length} selected. They are made smaller before upload.` : 'Clear daylight photos: front, back, both sides, dashboard, seats, engine.'}</div></div>
        <div className="field"><label className="f" htmlFor="dc-plate">Photo of the VIN plate (only our team sees it)</label><input id="dc-plate" type="file" className="input" style={{ paddingTop: 12 }} accept="image/jpeg,image/png,image/webp" onChange={(e) => setPlate(e.target.files[0] || null)} /><div className="hint">Helps us confirm the car is really yours if someone else claims it.</div></div>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-red" disabled={!!busy}>{busy || 'Save car'}</button><Link to="/dealer" className="btn btn-line">Cancel</Link></div>
      </form>}
    </div>
  );
}
