// Staff two-step login: first-time set-up (QR code and backup codes) and the 6-digit check, which signs in on the 6th digit.
import React, { useState, useMemo, useRef } from 'react';
import qrcode from 'qrcode-generator';
import { useApp, api } from '../lib/core.jsx';


export function TwoFASetup({ user }) {
  const { setUser } = useApp();
  const [data, setData] = useState(null); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null); const [doneUser, setDoneUser] = useState(null);
  const start = async () => { setErr(''); try { setData(await api('/auth/2fa/setup', { method: 'POST' })); } catch (e) { setErr(e.message); } };
  const svg = useMemo(() => { if (!data) return ''; const qr = qrcode(0, 'M'); qr.addData(data.url); qr.make(); return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }, [data]);
  const enable = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { const d = await api('/auth/2fa/enable', { method: 'POST', body: { code } }); setCodes(d.recoveryCodes); setDoneUser(d.user); } catch (e2) { setErr(e2.message); } finally { setBusy(false); } };
  if (codes) return (
    <div className="wrap sec-sm" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 44 }}>Two-step login is on</h1>
      <div className="box">
        <h3>Save your backup codes</h3>
        <p>If you lose your phone, each of these codes lets you sign in once. Write them down or save them somewhere safe. <b>They will not be shown again.</b></p>
        <div className="codes">{codes.map((c) => <code key={c}>{c}</code>)}</div>
        <button className="btn btn-red" style={{ marginTop: 16 }} onClick={() => setUser(doneUser)}>I have saved them, open the admin</button>
      </div>
    </div>
  );
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 44 }}>Protect your staff account</h1>
      <p>Staff accounts need two-step login: your password plus a 6-digit code from an app on your phone. This keeps customer details safe even if a password leaks.</p>
      {err && <div className="err">{err}</div>}
      {!data ? <div className="box">
        <ol className="small" style={{ paddingLeft: 18 }}><li>Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone (free).</li><li>Press the button below and scan the code with the app.</li><li>Type the 6-digit code the app shows.</li></ol>
        <button className="btn btn-red" onClick={start}>Start setup</button>
      </div> : <form className="box" onSubmit={enable}>
        <div className="qr-wrap"><div className="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code for your authenticator app" role="img" />
          <div><p className="small" style={{ marginTop: 0 }}>Scan this with your authenticator app. Can't scan? Choose "enter a setup key" in the app and type:</p><code className="secret">{data.secret.replace(/(.{4})/g, '$1 ').trim()}</code></div></div>
        <div className="field" style={{ marginTop: 16 }}><label className="f" htmlFor="tf-code">6-digit code from the app</label><input id="tf-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        <button className="btn btn-red" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-step login'}</button>
      </form>}
      <p className="small muted" style={{ marginTop: 14 }}>Signed in as {user.email}.</p>
    </div>
  );
}

export function TwoFAVerify({ user }) {
  const { setUser } = useApp();
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [backup, setBackup] = useState(false);
  const inFlight = useRef(false);
  const input = useRef(null);
  // Sends the code once. App codes go automatically as soon as the 6th digit is typed or pasted; backup codes use Continue.
  const verify = async (value) => {
    if (inFlight.current) return;
    inFlight.current = true; setErr(''); setBusy(true);
    try { const d = await api('/auth/2fa/verify', { method: 'POST', body: { code: value } }); setUser(d.user); } catch (e2) {
      setErr(e2.message); setCode(''); setBusy(false); inFlight.current = false;
      requestAnimationFrame(() => input.current && input.current.focus());
    }
  };
  const submit = (e) => { e.preventDefault(); verify(code); };
  const onCode = (e) => {
    const v = backup ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (!backup && v.length === 6) verify(v);
  };
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 44 }}>Enter your code</h1>
      <form className="box" onSubmit={submit}>
        <p style={{ marginTop: 0 }}>Open your authenticator app and type the 6-digit code for <b>Korrect Cars</b> ({user.email}).</p>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="field"><label className="f" htmlFor="tv-code">{backup ? 'Backup code' : '6-digit code'}</label>
          <input ref={input} id="tv-code" className={'input' + (backup ? '' : ' code-input')} inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus maxLength={backup ? 11 : 12} readOnly={busy} aria-describedby="tv-hint" required value={code} onChange={onCode} />
          <div id="tv-hint" className="hint">{backup ? 'Type a backup code, then press Continue.' : 'You are signed in as soon as you type the 6th digit.'}</div></div>
        <button className="btn btn-red btn-block" disabled={busy || (!backup && code.length !== 6)}>{busy ? 'Signing you in…' : 'Continue'}</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }} className="small">
          <button type="button" className="linkish" onClick={() => { setBackup(!backup); setCode(''); }}>{backup ? 'Use the app code' : 'Lost your phone? Use a backup code'}</button>
          <button type="button" className="linkish" onClick={signOut}>Sign out</button>
        </div>
      </form>
    </div>
  );
}
