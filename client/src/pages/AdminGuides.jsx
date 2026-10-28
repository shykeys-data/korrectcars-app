// Staff area: guides (drafts, import, editor, branded covers) and "Nigeria car market today" figures.
// Nothing here publishes by itself. The server checks every rule again and cleans the article HTML.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApi, api, date, rs } from '../lib/core.jsx';
import { Loading } from '../components/Bits.jsx';

const CATEGORIES = ['Buying guide', 'Car review', 'Market update', 'News', 'EV', 'Pay Small Small'];
const IMAGE_SOURCES = [['template', 'Branded cover, no photo'], ['own', 'Our own photo or video frame'], ['press', 'Manufacturer press site'], ['stock', 'Licensed stock'], ['free', 'Unsplash or Pexels'], ['ai', 'AI-generated (abstract topics only)']];
const WEEKLY_TARGET = 3;
const words = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim().split(/\s+/).filter(Boolean).length; };
const inLastWeek = (t) => t && Date.now() - new Date(String(t).replace(' ', 'T') + (String(t).includes('Z') ? '' : 'Z')).getTime() < 7 * 864e5;

export function Guides() {
  const { data, reload } = useApi('/admin/posts');
  const [tab, setTab] = useState('draft');
  const [editing, setEditing] = useState(null); // post id, or 'new'
  if (editing) return <GuideEditor id={editing} onClose={() => { setEditing(null); reload(); }} />;
  const posts = (data && data.posts) || [];
  const weekCount = posts.filter((p) => p.status === 'published' && inLastWeek(p.published_at)).length;
  const shown = tab === 'all' ? posts : posts.filter((p) => p.status === (tab === 'draft' ? 'draft' : 'published'));
  return (
    <>
      <div className="box">
        <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Guides</h2><button className="btn btn-red" onClick={() => setEditing('new')}>+ New guide</button></div>
        <div className="week-bar" role="status">
          <div><b>This week: {weekCount} of {WEEKLY_TARGET} guides published.</b> <span className="muted">Until AdSense approves, publish 2–3 reviewed guides a week, each with something only Korrect Cars can add.</span></div>
          <div className="bar" aria-hidden="true"><span style={{ width: Math.min(100, (weekCount / WEEKLY_TARGET) * 100) + '%' }} /></div>
        </div>
        <div className="pills" role="tablist" style={{ margin: '14px 0' }}>
          {[['draft', 'Drafts'], ['published', 'Published'], ['all', 'All']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'pill' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l} · {k === 'all' ? posts.length : posts.filter((p) => p.status === k).length}</button>)}
        </div>
        {!data ? <Loading /> : !shown.length ? <p className="muted">{tab === 'draft' ? 'No drafts. Import today\'s draft or start a new guide.' : 'Nothing here yet.'}</p> : shown.map((p) => (
          <div className="row guide-row" key={p.id}>
            <div className="guide-thumb">{p.image ? <img src={rs(p.image, 400)} alt="" loading="lazy" /> : null}</div>
            <div style={{ minWidth: 0 }}><b>{p.title}</b><div className="small muted">{p.category || 'Buying guide'} · {p.status === 'draft' ? `created ${date(p.created_at)}` : `published ${date(p.published_at)}`} · {(p.sources || []).length} source{(p.sources || []).length === 1 ? '' : 's'}{p.status === 'draft' && !(p.own_input || '').trim() ? ' · needs our own input' : ''}</div></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className={'tag ' + (p.status === 'draft' ? 'tag-warn' : 'tag-grey')}>{p.status === 'draft' ? 'Draft' : 'Live'}</span><button className="btn btn-line btn-sm" onClick={() => setEditing(p.id)}>{p.status === 'draft' ? 'Review' : 'Edit'}</button></div>
          </div>
        ))}
      </div>
      <ImportDraft onDone={(id) => { reload(); setEditing(id); }} />
    </>
  );
}

function ImportDraft({ onDone }) {
  const [text, setText] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/admin/posts/import', { method: 'POST', body: { text } }); setText(''); onDone(r.post.id); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={go}>
      <h2>Import today's draft</h2>
      <p className="small muted">Open the draft document the morning task sent you, use its Copy button, and paste everything here. It becomes a draft with its sources and a branded cover. Nothing goes live until you publish.</p>
      {err && <div className="err" role="alert">{err}</div>}
      <label className="f" htmlFor="imp">Draft text</label>
      <textarea id="imp" className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Title: …\nCategory: Market update\nExcerpt: …\nSources:\n- Source name | https://…\n---\nThe article…'} />
      <div className="hint">Pictures are never imported. Keep the generated cover or add our own photo.</div>
      <button className="btn btn-dark" disabled={busy || text.trim().length < 40} style={{ marginTop: 10 }}>{busy ? 'Importing…' : 'Import as draft'}</button>
    </form>
  );
}

// Formatting buttons for the article box. The server keeps only safe tags.
const TOOLS = [['H2', 'Section heading', () => document.execCommand('formatBlock', false, 'h2')], ['H3', 'Subheading', () => document.execCommand('formatBlock', false, 'h3')],
  ['¶', 'Normal paragraph', () => document.execCommand('formatBlock', false, 'p')], ['B', 'Bold', () => document.execCommand('bold')],
  ['• List', 'Bulleted list', () => document.execCommand('insertUnorderedList')], ['1. List', 'Numbered list', () => document.execCommand('insertOrderedList')],
  ['Link', 'Add a link', () => { const u = window.prompt('Link address (https://… or /cars/…)'); if (u) document.execCommand('createLink', false, u.trim()); }],
  ['“ ”', 'Quote', () => document.execCommand('formatBlock', false, 'blockquote')]];

function GuideEditor({ id, onClose }) {
  const isNew = id === 'new';
  const loaded = useApi(isNew ? null : '/admin/posts/' + id, [id]);
  const [f, setF] = useState(null); const [post, setPost] = useState(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const [size, setSize] = useState('site'); const [wordCount, setWordCount] = useState(0);
  const body = useRef(null); const photo = useRef(null); const filled = useRef(false);

  useEffect(() => {
    const p = isNew ? { title: '', slug: '', category: 'Buying guide', excerpt: '', content: '', author: '', own_input: '', sources: [], image_source: 'template', image_credit: '', status: 'draft' } : loaded.data && loaded.data.post;
    if (!p) return;
    setPost(p);
    setF({ title: p.title || '', slug: p.slug || '', category: p.category || 'Buying guide', excerpt: p.excerpt || '', author: p.author || '', ownInput: p.own_input || '', sources: (p.sources || []).map((s) => ({ ...s })), imageSource: p.image_source || 'template', imageCredit: p.image_credit || '' });
  }, [loaded.data, isNew]);
  // The article box is uncontrolled (contentEditable): fill it once, after it is on screen
  useEffect(() => {
    if (f && post && body.current && !filled.current) { body.current.innerHTML = post.content || ''; setWordCount(words(post.content)); filled.current = true; }
  }, [f, post]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const checks = useMemo(() => !f || !post ? [] : [
    [!!post.image, 'Cover added'], [f.excerpt.trim().length >= 40, 'Excerpt of at least 40 characters'], [f.sources.some((s) => /^https?:\/\//.test(s.url)), 'At least one source'],
    [f.ownInput.trim().length >= 10, 'Something only Korrect Cars can add'], [wordCount >= 300, `At least 300 words (now ${wordCount})`]
  ], [f, post, wordCount]);
  if (!f) return <div className="box"><Loading /></div>;
  const live = post.status === 'published'; const ready = checks.every(([ok]) => ok);

  const payload = () => ({ ...f, slug: f.slug || undefined, content: body.current ? body.current.innerHTML : '', sources: f.sources.filter((s) => s.url.trim()).map((s) => ({ title: s.title.trim(), url: s.url.trim() })) });
  const save = async () => {
    setErr(''); setMsg(''); setBusy('Saving…');
    try {
      const r = await api('/admin/posts' + (post.id ? '/' + post.id : ''), { method: post.id ? 'PUT' : 'POST', body: payload() });
      setPost(r.post); setF((x) => ({ ...x, slug: r.post.slug })); setMsg('Saved.'); return r.post;
    } catch (x) { setErr(x.message); return null; } finally { setBusy(''); }
  };
  const setStatus = async (status) => {
    const p = await save(); if (!p) return;
    setBusy(status === 'published' ? 'Publishing…' : 'Updating…');
    try { await api(`/admin/posts/${p.id}/status`, { method: 'POST', body: { status } }); onClose(); } catch (x) { setErr(x.message); } finally { setBusy(''); }
  };
  const makeCover = async () => {
    const p = await save(); if (!p) return;
    setBusy('Making cover…');
    try { const r = await api(`/admin/posts/${p.id}/cover`, { method: 'POST' }); setPost({ ...p, image: r.image, covers: r.covers, image_source: 'template' }); setF({ ...f, imageSource: 'template', imageCredit: '' }); } catch (x) { setErr(x.message); } finally { setBusy(''); }
  };
  const replacePhoto = async () => {
    const file = photo.current && photo.current.files[0];
    if (!file) { setErr('Choose a photo first.'); return; }
    if (f.imageSource === 'template') { setErr('Choose where the photo comes from.'); return; }
    if (f.imageCredit.trim().length < 3) { setErr('Add the photo credit and licence, e.g. "Photo: Korrect Cars, own work".'); return; }
    const p = await save(); if (!p) return;
    setBusy('Framing your photo…');
    const fd = new FormData(); fd.append('photo', file); fd.append('imageSource', f.imageSource); fd.append('imageCredit', f.imageCredit);
    try { const r = await api(`/admin/posts/${p.id}/cover-photo`, { method: 'POST', form: fd }); setPost({ ...p, image: r.image, covers: r.covers }); photo.current.value = ''; } catch (x) { setErr(x.message); } finally { setBusy(''); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    try { await api('/admin/posts/' + post.id, { method: 'DELETE' }); onClose(); } catch (x) { setErr(x.message); }
  };
  const covers = post.covers || {};
  const coverUrl = size === 'site' ? (covers.site || post.image) : covers[size];

  return (
    <div className="guide-edit">
      <div className="sec-head" style={{ marginBottom: 0 }}>
        <div><button type="button" className="btn btn-line btn-sm" onClick={onClose}>‹ All guides</button><h2 style={{ margin: '8px 0 0' }}>{isNew && !post.id ? 'New guide' : live ? 'Edit live guide' : 'Edit draft'} <span className={'tag ' + (live ? 'tag-grey' : 'tag-warn')}>{live ? 'Live' : 'Draft'}</span></h2></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-line" disabled={!!busy} onClick={save}>{live ? 'Save changes' : 'Save draft'}</button>
          {post.id && <a className="btn btn-line" href={live ? '/blog/' + post.slug : '#'} target="_blank" rel="noopener noreferrer" aria-disabled={!live} onClick={(e) => { if (!live) { e.preventDefault(); setMsg('Drafts are private. Publish to see it on the site.'); } }}>View</a>}
          {live ? <button type="button" className="btn btn-line" disabled={!!busy} onClick={() => setStatus('draft')}>Unpublish</button>
            : <button type="button" className="btn btn-red" disabled={!!busy || !ready} aria-describedby="pub-checks" onClick={() => setStatus('published')}>Publish today</button>}
        </div>
      </div>
      {(err || msg || busy) && <div className={err ? 'err' : 'ok-msg'} role={err ? 'alert' : 'status'} style={{ marginTop: 12 }}>{err || busy || msg}</div>}
      <div className="guide-grid">
        <section className="box">
          <div className="field"><label className="f" htmlFor="g-title">Title</label><input id="g-title" className="input" value={f.title} onChange={set('title')} maxLength={160} /></div>
          <div className="grid2">
            <div className="field"><label className="f" htmlFor="g-cat">Category</label><select id="g-cat" className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label className="f" htmlFor="g-author">Author</label><input id="g-author" className="input" value={f.author} onChange={set('author')} maxLength={120} placeholder="Name shown on the guide" /></div>
          </div>
          {!live && <div className="field"><label className="f" htmlFor="g-slug">Web address <span className="hint">korrectcars.com/blog/…  (fixed once published)</span></label><input id="g-slug" className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} maxLength={120} /></div>}
          <div className="field"><label className="f" htmlFor="g-ex">Excerpt <span className="hint">shown on the guides page and in Google, about 160 characters</span></label><textarea id="g-ex" className="input" rows={2} value={f.excerpt} onChange={set('excerpt')} maxLength={300} /></div>
          <div className="field"><label className="f" htmlFor="g-own">What only Korrect Cars can add <span className="hint">required: our photos, an inspection finding or a real price from stock. Put it in the article too.</span></label><textarea id="g-own" className="input" rows={2} value={f.ownInput} onChange={set('ownInput')} maxLength={2000} aria-invalid={f.ownInput.trim().length < 10} /></div>
          <div className="field">
            <div className="f" id="g-body-l">Article</div>
            <div className="rte-bar" role="toolbar" aria-label="Formatting">{TOOLS.map(([l, title, fn]) => <button key={l} type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => { body.current.focus(); fn(); setWordCount(words(body.current.innerHTML)); }}>{l}</button>)}</div>
            <div ref={body} className="rte prose" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="g-body-l"
              onInput={() => setWordCount(words(body.current.innerHTML))}
              onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
            <div className="hint">{wordCount} words. Pasting keeps the text only; add headings and links with the buttons. Pictures from other sites are removed when you save.</div>
          </div>
          <div className="field">
            <div className="f">Sources <span className="hint">listed under the article</span></div>
            {f.sources.map((s, k) => (
              <div key={k} className="source-row">
                <input className="input" aria-label={`Source ${k + 1} name`} placeholder="Source name" value={s.title || ''} onChange={(e) => setF({ ...f, sources: f.sources.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                <input className="input" aria-label={`Source ${k + 1} web address`} placeholder="https://…" value={s.url} onChange={(e) => setF({ ...f, sources: f.sources.map((x, j) => (j === k ? { ...x, url: e.target.value } : x)) })} />
                <button type="button" className="btn btn-line btn-sm" aria-label={`Remove source ${k + 1}`} onClick={() => setF({ ...f, sources: f.sources.filter((_x, j) => j !== k) })}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-line btn-sm" onClick={() => setF({ ...f, sources: [...f.sources, { title: '', url: '' }] })}>+ Add source</button>
          </div>
          {post.id && !live && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }} onClick={remove}>Delete this draft</button>}
        </section>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="box">
            <h3 style={{ marginTop: 0 }}>Cover</h3>
            <div className="pills" role="tablist">{[['site', '1200×630'], ['square', '1080×1080'], ['story', '1080×1920']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={size === k} className={'pill' + (size === k ? ' on' : '')} onClick={() => setSize(k)}>{l}</button>)}</div>
            <div className={'cover-prev ' + size}>{coverUrl ? <img src={coverUrl} alt="Cover preview" /> : <span className="muted small">{post.id ? 'No cover in this size yet. Make one from the title.' : 'Save the draft to make its cover.'}</span>}</div>
            {coverUrl && <a className="small" href={coverUrl} download>Download this size</a>}
            <div className="grid2" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-line btn-sm" disabled={!!busy || f.title.trim().length < 8} onClick={makeCover}>Make cover from title</button>
              <button type="button" className="btn btn-line btn-sm" disabled={!!busy || !post.id} onClick={() => photo.current && photo.current.click()}>Replace image</button>
            </div>
            <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" className="sr" aria-label="Photo for the cover" onChange={() => photo.current.files[0] && setMsg(`Photo chosen: ${photo.current.files[0].name}. Set its source and credit, then press "Use this photo".`)} />
            <div className="field" style={{ marginTop: 10 }}><label className="f" htmlFor="g-isrc">Image source</label><select id="g-isrc" className="input" value={f.imageSource} onChange={set('imageSource')}>{IMAGE_SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {f.imageSource !== 'template' && <div className="field"><label className="f" htmlFor="g-icr">Credit and licence</label><input id="g-icr" className="input" value={f.imageCredit} onChange={set('imageCredit')} maxLength={200} placeholder="e.g. Photo: Korrect Cars, own work" /></div>}
            {f.imageSource === 'ai' && <div className="hint">AI images only for general topics (fuel, traffic, charging), never to show a specific car model.</div>}
            {f.imageSource !== 'template' && <button type="button" className="btn btn-dark btn-sm" disabled={!!busy || !post.id} onClick={replacePhoto}>Use this photo</button>}
            <div className="hint" style={{ marginTop: 8 }}>Never use photos from news sites or Google Images without a licence.</div>
          </section>
          <section className="box" id="pub-checks">
            <h3 style={{ marginTop: 0 }}>{live ? 'Live since ' + date(post.published_at) : 'Before you publish'}</h3>
            {!live && checks.map(([ok, label]) => <div key={label} className={'chk ' + (ok ? 'ok' : 'no')}><span aria-hidden="true">{ok ? '✓' : '!'}</span>{label}<span className="sr">{ok ? ' (done)' : ' (still needed)'}</span></div>)}
            <div className="hint" style={{ marginTop: 8 }}>{live ? 'Changes show on the site as soon as you save.' : 'Publishing sets today\'s date on the guide. Check every fact, price and rule against the sources.'}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function MarketFigures() {
  const { data } = useApi('/admin/market');
  const [m, setM] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setM({ note: data.note || '', items: data.items.length ? data.items : [{ label: '', value: '', detail: '', source: '', url: '', date: '' }] }); }, [data]);
  if (!m) return <div className="box"><Loading /></div>;
  const setItem = (k, field) => (e) => setM({ ...m, items: m.items.map((x, j) => (j === k ? { ...x, [field]: e.target.value } : x)) });
  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { const r = await api('/admin/market', { method: 'PUT', body: { note: m.note, items: m.items.filter((x) => x.label.trim() || x.value.trim()) } }); setM({ note: r.note, items: r.items }); setMsg(r.items.length >= 3 ? 'Saved. The page is live at /car-market-today.' : `Saved. The page goes live once it has 3 figures (now ${r.items.length}).`); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form className="box" onSubmit={save}>
      <h2>Nigeria car market today</h2>
      <p className="small muted">Figures that move car prices: fuel prices, the naira rate, import duty. Every figure needs its source and the date you checked it. The page stays hidden until it has at least 3 figures.</p>
      {err && <div className="err" role="alert">{err}</div>}{msg && <div className="ok-msg" role="status">{msg}</div>}
      {m.items.map((x, k) => (
        <fieldset key={k} className="market-edit">
          <legend className="f">Figure {k + 1}</legend>
          <div className="grid2">
            <div className="field"><label className="f" htmlFor={'mk-l' + k}>What it is</label><input id={'mk-l' + k} className="input" value={x.label} onChange={setItem(k, 'label')} placeholder="Petrol pump price, Lagos" maxLength={80} /></div>
            <div className="field"><label className="f" htmlFor={'mk-v' + k}>Figure</label><input id={'mk-v' + k} className="input" value={x.value} onChange={setItem(k, 'value')} placeholder="₦… per litre" maxLength={60} /></div>
            <div className="field"><label className="f" htmlFor={'mk-s' + k}>Source</label><input id={'mk-s' + k} className="input" value={x.source} onChange={setItem(k, 'source')} placeholder="Who published it" maxLength={120} /></div>
            <div className="field"><label className="f" htmlFor={'mk-u' + k}>Source link</label><input id={'mk-u' + k} className="input" value={x.url || ''} onChange={setItem(k, 'url')} placeholder="https://…" maxLength={500} /></div>
            <div className="field"><label className="f" htmlFor={'mk-d' + k}>Date checked</label><input id={'mk-d' + k} type="date" className="input" value={x.date} max={today} onChange={setItem(k, 'date')} /></div>
            <div className="field"><label className="f" htmlFor={'mk-x' + k}>Short note (optional)</label><input id={'mk-x' + k} className="input" value={x.detail || ''} onChange={setItem(k, 'detail')} placeholder="Up ₦… since last week" maxLength={200} /></div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setM({ ...m, items: m.items.filter((_y, j) => j !== k) })}>Remove this figure</button>
        </fieldset>
      ))}
      {m.items.length < 12 && <button type="button" className="btn btn-line btn-sm" onClick={() => setM({ ...m, items: [...m.items, { label: '', value: '', detail: '', source: '', url: '', date: today }] })}>+ Add a figure</button>}
      <div className="field" style={{ marginTop: 14 }}><label className="f" htmlFor="mk-note">What this means for a car buyer (optional)</label><textarea id="mk-note" className="input" rows={3} value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} maxLength={1500} /></div>
      <button className="btn btn-red" disabled={busy}>{busy ? 'Saving…' : 'Save figures'}</button>
    </form>
  );
}
