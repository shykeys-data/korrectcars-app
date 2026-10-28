// Shows one page's written copy from server/lib/pagecopy.js (the same words the server sends to Google).
// <CopySections page={GUIDES} /> renders its sections; pass `only` to show some of them by heading.
import React from 'react';

function Section({ s }) {
  return (
    <section className="copy-sec">
      <h2>{s.h2}</h2>
      {(s.p || []).map((t) => <p key={t}>{t}</p>)}
      {s.steps && <ol className="copy-steps">{s.steps.map(([h, t], i) => <li key={h}><span className="n" aria-hidden="true">{i + 1}</span><span><b>{h}</b>{t}</span></li>)}</ol>}
      {s.list && <ul className="copy-list">{s.list.map((t) => <li key={t}>{t}</li>)}</ul>}
      {s.faq && s.faq.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  );
}

export function CopySections({ page, only, skip }) {
  const list = (page.sections || []).filter((s) => (!only || only.includes(s.h2)) && (!skip || !skip.includes(s.h2)));
  return <>{list.map((s) => <Section key={s.h2} s={s} />)}</>;
}
