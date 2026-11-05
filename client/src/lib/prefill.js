// Shared by the dealer and staff car forms.
// Puts what the VIN says into the empty fields only (never over what the seller typed). Returns how many it filled.
const BODIES = ['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan', 'Wagon', 'Bus'];
export function applyPrefill(x) {
  x = x || {};
  const take = { title: x.title && x.model ? x.title : '', make: x.make, model: x.model, year: x.year ? String(x.year) : '', trim: x.trim, body: BODIES.includes(x.body) ? x.body : '',
    engine: x.engine, transmission: x.transmission, drivetrain: x.drivetrain, fuel: x.fuel,
    features: (x.features || []).join('\n'), specsText: (x.specs || []).map(([k, v]) => `${k}: ${v}`).join('\n'), description: x.description };
  const keys = Object.keys(take).filter((k) => take[k]);
  return {
    n: keys.length,
    fill: (p) => { const out = { ...p }; for (const k of keys) if (!String(p[k] || '').trim() || (k === 'transmission' && p[k] === 'Automatic') || (k === 'fuel' && p[k] === 'Petrol')) out[k] = take[k]; return out; }
  };
}

