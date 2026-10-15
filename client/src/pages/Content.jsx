import React from 'react';
import { Link, useApi, useApp, useTitle, date, waLink, rs, srcset } from '../lib/core.jsx';
import { Loading, ErrorBox, EnquiryForm } from '../components/Bits.jsx';

// Post HTML comes from our own admin/WordPress import; strip anything executable before showing it.
export function clean(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'style' || n === 'class' || n === 'id' || ((n === 'href' || n === 'src') && /^\s*(javascript|data|vbscript):/i.test(a.value))) el.removeAttribute(a.name);
    }
    if (el.tagName === 'A' && /^https?:/i.test(el.getAttribute('href') || '') && !/korrectcars\.com/i.test(el.getAttribute('href'))) { el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); }
    if (el.tagName === 'A') el.setAttribute('href', (el.getAttribute('href') || '').replace(/^https?:\/\/(www\.)?korrectcars\.com/i, '') || '/');
  });
  return doc.body.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

export function Blog() {
  useTitle('Car Buying Guides for Nigeria | Korrect Cars Blog');
  const { data, loading, error } = useApi('/posts');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="wrap sec-sm">
      <div className="eyebrow">Guides</div><h1>Buy smarter</h1>
      <div className="post-cards" style={{ marginTop: 20 }}>
        {data.posts.map((p) => (
          <Link key={p.slug} to={'/blog/' + p.slug} className="card">
            <div className="ph" style={{ aspectRatio: '16/9' }}>{p.image && <img src={rs(p.image, 800)} srcSet={srcset(p.image)} sizes="(max-width: 640px) 92vw, 400px" alt="" loading="lazy" />}</div>
            <div className="bd"><div className="small muted">{date(p.published_at)}</div><div className="ttl">{p.title}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Post({ slug }) {
  const { cfg } = useApp();
  const { data, loading, error } = useApi('/posts/' + slug);
  useTitle(data && data.post ? `${data.post.seo_title || data.post.title}` : null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const p = data.post;
  return (
    <article className="wrap sec-sm">
      <nav className="small muted" style={{ marginBottom: 12 }}><Link to="/blog">Guides</Link></nav>
      <h1 style={{ maxWidth: 900 }}>{p.title}</h1>
      <div className="muted" style={{ marginBottom: 20 }}>{date(p.published_at)} · Korrect Cars</div>
      {p.image && <img src={rs(p.image, 1200)} srcSet={srcset(p.image, [800, 1200, 1600])} sizes="(max-width: 900px) 100vw, 860px" alt="" style={{ borderRadius: 18, marginBottom: 28, maxHeight: 460, width: '100%', objectFit: 'cover' }} />}
      <div className="prose" dangerouslySetInnerHTML={{ __html: clean(p.content) }} />
      <div className="box" style={{ marginTop: 32, maxWidth: 760, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><b>Looking for a car?</b><div className="muted small">See inspected cars in Lagos or ask us on WhatsApp.</div></div>
        <div style={{ display: 'flex', gap: 10 }}><Link to="/cars" className="btn btn-red btn-sm">Browse cars</Link><a className="btn btn-wa btn-sm" href={waLink(cfg, `Hello Korrect Cars, I just read "${p.title}".`)} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
      </div>
      {data.more.length > 0 && <section className="sec-sm"><h2>More guides</h2><div className="post-cards">{data.more.map((m) => (
        <Link key={m.slug} to={'/blog/' + m.slug} className="card"><div className="ph" style={{ aspectRatio: '16/9' }}>{m.image && <img src={rs(m.image, 800)} alt="" loading="lazy" />}</div><div className="bd"><div className="ttl">{m.title}</div></div></Link>
      ))}</div></section>}
    </article>
  );
}

export function Page({ slug }) {
  const { data, loading, error } = useApi('/pages/' + slug);
  useTitle(data && data.page ? `${data.page.title} | Korrect Cars` : null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const html = clean(data.page.content).replace(/^\s*<h1>[\s\S]*?<\/h1>/i, '');
  return <div className="wrap sec-sm"><h1>{data.page.title}</h1><div className="prose" dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

export function Faqs() {
  useTitle('Frequently Asked Questions | Korrect Cars');
  const { cfg } = useApp();
  const { data, loading } = useApi('/pages/faqs');
  let items = [];
  try { items = data ? JSON.parse(data.page.content) : []; } catch (_e) { items = []; }
  const extra = [
    { q: 'How does Pay Small Small work?', a: 'Pick a car and get an estimate of your deposit and monthly payment on our Pay Small Small page. Apply in minutes, and with your consent we pass your details to our credit bank partner. The bank checks if you qualify and sets the final terms. Once the bank approves you, we sell you the car.' },
    { q: 'How does Korrect Swap work?', a: 'List your car with photos and papers. Our team verifies the owner and papers before it goes live. Owners make offers, agree any cash top-up, and both cars are inspected at a partner car lot in Lagos before anything changes hands. A success fee is due only when a swap completes.' }
  ];
  if (loading) return <Loading />;
  const all = extra.concat(items).filter((f) => (cfg && cfg.swap) || !/swap/i.test(f.q || ''));
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 860 }}>
      <h1>Frequently asked questions</h1>
      {all.map((f, k) => <details key={k} className="box" style={{ marginBottom: 12 }}><summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: 18 }}>{f.q}</summary><div className="prose" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: clean(f.a) }} /></details>)}
    </div>
  );
}

export function Contact() {
  useTitle('Contact Korrect Cars — Lagos');
  const { cfg } = useApp();
  return (
    <div className="wrap sec-sm">
      <div className="eyebrow">Contact</div><h1>Talk to Korrect Cars</h1>
      <div className="detail" style={{ marginTop: 20 }}>
        <div className="box"><EnquiryForm type="contact" title="Send us a message" cta="Send message" /></div>
        <aside className="side">
          <div className="box">
            <h3>Fastest: WhatsApp</h3>
            <a className="btn btn-wa btn-block" href={waLink(cfg, 'Hello Korrect Cars, ')} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
            <h3 style={{ marginTop: 20 }}>Call</h3>
            {((cfg && cfg.phones) || []).map((p) => <div key={p}><a href={'tel:' + p.replace(/\s/g, '')}>{p}</a></div>)}
            <h3 style={{ marginTop: 20 }}>Email</h3>
            <a href={'mailto:' + ((cfg && cfg.email) || 'info@korrectcars.com')}>{(cfg && cfg.email) || 'info@korrectcars.com'}</a>
            <p className="small muted" style={{ marginTop: 16 }}>Lagos, Nigeria · Viewings by appointment, Monday to Saturday.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function NotFound() {
  useTitle('Page not found | Korrect Cars');
  return <div className="wrap sec"><h1>Page not found</h1><p className="muted">The page you wanted has moved or no longer exists.</p><div style={{ display: 'flex', gap: 12 }}><Link to="/" className="btn btn-red">Home</Link><Link to="/cars" className="btn btn-line">Browse cars</Link></div></div>;
}
