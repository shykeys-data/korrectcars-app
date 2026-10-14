import React from 'react';

// Make -> Model -> Body type.
// Choosing a make loads only that make's models. Choosing a model fills in the
// body type automatically when the model comes in a single body type; otherwise
// the user picks from the body types that model actually comes in.
export function bodiesFor(tree, make, model) {
  if (!tree) return [];
  const all = new Set();
  const makes = make ? [make] : Object.keys(tree);
  for (const mk of makes) {
    const models = tree[mk] || {};
    for (const md of model ? [model] : Object.keys(models)) for (const b of models[md] || []) all.add(b);
  }
  return [...all].sort();
}

export function cascade(tree, next, prev) {
  const out = { ...prev, ...next };
  if ('make' in next && next.make !== prev.make) { out.model = ''; out.body = ''; }
  if ('model' in next && next.model !== prev.model) {
    const b = bodiesFor(tree, out.make, out.model);
    out.body = out.model && b.length === 1 ? b[0] : (b.includes(prev.body) ? prev.body : '');
  }
  return out;
}

export default function Cascade({ tree, value, onChange, required = false, labels = true, anyLabel = 'Any', idPrefix = 'cs' }) {
  const makes = tree ? Object.keys(tree).sort() : [];
  const models = value.make && tree && tree[value.make] ? Object.keys(tree[value.make]).sort() : [];
  const bodies = bodiesFor(tree, value.make, value.model);
  const autoBody = !!value.model && bodies.length === 1;
  const set = (k) => (e) => onChange(cascade(tree, { [k]: e.target.value }, value));
  return (
    <>
      <div className="field">
        {labels && <label className="f" htmlFor={idPrefix + '-make'}>Make</label>}
        <select id={idPrefix + '-make'} className="input" value={value.make} onChange={set('make')} required={required} aria-label="Make">
          <option value="">{required ? 'Choose make' : anyLabel + ' make'}</option>
          {makes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        {labels && <label className="f" htmlFor={idPrefix + '-model'}>Model</label>}
        <select id={idPrefix + '-model'} className="input" value={value.model} onChange={set('model')} disabled={!value.make} required={required} aria-label="Model">
          <option value="">{!value.make ? 'Choose a make first' : required ? 'Choose model' : anyLabel + ' model'}</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        {labels && <label className="f" htmlFor={idPrefix + '-body'}>Body type{autoBody && <span className="muted small"> · auto-selected</span>}</label>}
        <select id={idPrefix + '-body'} className="input" value={value.body} onChange={set('body')} disabled={autoBody} required={required} aria-label="Body type">
          <option value="">{required ? 'Choose body type' : anyLabel + ' body type'}</option>
          {bodies.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
    </>
  );
}
