// Staff (admin only): site settings, user accounts and roles, and the audit log.
import React, { useState } from 'react';
import { useApi, date, api } from '../lib/core.jsx';
import { Loading } from '../components/Bits.jsx';
import { ROLE_LABEL, STAFF, T } from './AdminShared.jsx';


export function Settings() {
  const { data, reload } = useApi('/admin/settings');
  const [f, setF] = useState(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const vals = f || { ...data.values, phones: data.values.phones.join(', '), bnplMinDeposit: data.values.bnpl.minDeposit, bnplMarkup: data.values.bnpl.markup, bnplMaxMonths: data.values.bnpl.maxMonths };
  const save = async (e) => { e.preventDefault(); setErr(''); setMsg(''); setBusy(true); try { await api('/admin/settings', { method: 'PUT', body: vals }); setMsg('Saved. The website uses the new details straight away.'); setF(null); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <form className="box" onSubmit={save}>
      <h2>Settings</h2>
      <p className="small muted">These show on the website (footer, contact buttons, Pay Small Small estimates). Changes are saved in the activity log.</p>
      {msg && <div className="okmsg" style={{ marginBottom: 12 }}>{msg}</div>}{err && <div className="err">{err}</div>}
      <div className="grid2">{Object.entries(data.fields).map(([k, fd]) => (
        <div className="field" key={k}><label className="f" htmlFor={'st-' + k}>{fd.label}</label>
          {fd.type === 'choice'
            ? <select id={'st-' + k} className="input" value={vals[k] || fd.options[0][0]} onChange={(e) => setF({ ...vals, [k]: e.target.value })}>{fd.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : <input id={'st-' + k} className="input" inputMode={fd.type === 'number' ? 'numeric' : undefined} value={vals[k] === undefined || vals[k] === null ? '' : vals[k]} onChange={(e) => setF({ ...vals, [k]: e.target.value })} />}
          {k === 'phones' && <div className="hint">Separate numbers with commas. The first is shown in the header.</div>}
          {k === 'bankPartner' && <div className="hint">Optional. Leave empty to say "our credit partners". Add names separated by commas to show them on the Pay Small Small page.</div>}
          {k === 'aiTraining' && <div className="hint">Either way, ChatGPT search, Perplexity, Copilot and Google can still find and quote your cars.</div>}</div>
      ))}</div>
      <button className="btn btn-red" disabled={busy || !f}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}

export function Users({ me }) {
  const { data, reload } = useApi('/admin/users');
  const upd = async (u, body) => { try { await api('/admin/users/' + u.id, { method: 'POST', body }); reload(); } catch (e) { window.alert(e.message); } };
  const isAdmin = me.role === 'admin';
  return (
    <div className="box"><h2>Staff &amp; users</h2>
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Contact</th><th>Joined</th><th>Verified</th><th>Role</th><th /></tr></thead><tbody>
        {data.users.map((u) => <tr key={u.id}>
          <td><b>{u.name}</b>{u.disabled ? <div><T c="tag-bad">disabled</T></div> : null}{!u.email_verified ? <div><T c="tag-warn">email not confirmed</T></div> : null}</td>
          <td className="small">{u.email}<br />{u.phone}</td><td className="small">{date(u.created_at)}</td>
          <td>{isAdmin ? <button className={'btn btn-sm ' + (u.verified ? 'btn-ok' : 'btn-line')} onClick={() => upd(u, { verified: !u.verified })}>{u.verified ? 'Verified' : 'Verify'}</button> : (u.verified ? 'Yes' : 'No')}</td>
          <td>{isAdmin && u.id !== me.id ? <select className="input" aria-label="Role" style={{ minHeight: 40, width: 'auto' }} value={u.role === 'moderator' ? 'sales' : u.role} onChange={(e) => { if (e.target.value === 'admin' && !window.confirm(`Make ${u.name} an Administrator? Administrators can change everything, including staff. You can have up to 3.`)) return; upd(u, { role: e.target.value }); }}><option value="user">Customer</option><option value="sales">Sales</option><option value="editor">Editor</option><option value="admin">Administrator</option></select> : ROLE_LABEL[u.role] || u.role}
            {STAFF.includes(u.role) && <div className="small">{u.totp_enabled ? <T c="tag-ok">2-step on</T> : <T c="tag-warn">2-step not set up</T>}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{isAdmin && u.id !== me.id && <><button className="btn btn-line btn-sm" onClick={() => upd(u, { disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>
            {STAFF.includes(u.role) && u.totp_enabled ? <> <button className="btn btn-line btn-sm" onClick={() => { if (window.confirm(`Reset two-step login for ${u.name}? Use this if they lost their phone. They will set it up again at next sign-in.`)) upd(u, { reset2fa: true }); }}>Reset 2-step</button></> : null}</>}</td>
        </tr>)}
      </tbody></table></div>}
      <p className="small muted" style={{ marginTop: 12 }}><b>Roles:</b> Administrators (up to 3) can do everything. Sales handles leads, Pay Small Small, swaps and can edit cars. Editor manages cars and blog posts. Every staff account must use two-step login. To add staff, ask them to register on the site, then change their role here. Mark a customer as verified only after checking their ID against their phone number.</p>
    </div>
  );
}

export function Audit() {
  const { data } = useApi('/admin/audit');
  return (
    <div className="box"><h2>Activity log</h2><p className="small muted">Every staff action, sign-in code problem and view of a private document is recorded here.</p>
      {!data ? <Loading /> : !data.audit.length ? <p className="muted">Nothing yet.</p> : data.audit.map((a) => <div className="row" key={a.id} style={{ justifyContent: 'flex-start', gap: 16 }}><span className="small muted" style={{ minWidth: 110 }}>{date(a.created_at)}</span><b style={{ minWidth: 90 }}>{a.user_name}</b><span>{a.action}{a.target ? ` — ${a.target}` : ''}</span><span className="small muted" style={{ marginLeft: 'auto' }}>{a.ip}</span></div>)}
    </div>
  );
}
