// Fills in the car form from the VIN, so dealers and staff type as little as possible (Nov 2026).
//
// 1. The US government's free decoder (NHTSA vPIC, lib/vin.js) knows every car built for the US and Canadian
//    market, whatever the brand: Toyota, Lexus, Honda, Hyundai, Kia, Nissan, Ford, Chevrolet, Jeep, BMW, Mercedes,
//    Audi, VW, Land Rover... which is most tokunbo cars in Nigeria. It gives the body, trim, engine, gearbox,
//    drive, fuel, doors, seats, factory country and (mostly 2017 on) the standard safety equipment.
// 2. For VINs it does not know (European or Gulf-market cars, Chinese brands), the first three characters (the
//    maker code, WMI) still tell us the make and the country, and on North American and Asian VINs the 10th
//    character gives the model year.
// Only what the record says is filled in. Nothing is guessed, and the form marks these fields "from the VIN".

// Maker codes (WMI). Longest match wins (3 characters, then 2).
const WMI = {
  JT: ['Toyota', 'Japan'], JTH: ['Lexus', 'Japan'], JTJ: ['Lexus', 'Japan'], '2T': ['Toyota', 'Canada'], '2T2': ['Lexus', 'Canada'],
  '4T': ['Toyota', 'United States'], '5T': ['Toyota', 'United States'], '58A': ['Lexus', 'United States'], MR0: ['Toyota', 'Thailand'], MHF: ['Toyota', 'Indonesia'], AHT: ['Toyota', 'South Africa'], SB1: ['Toyota', 'United Kingdom'], NMT: ['Toyota', 'Turkey'],
  JHM: ['Honda', 'Japan'], JHL: ['Honda', 'Japan'], '1HG': ['Honda', 'United States'], '2HG': ['Honda', 'Canada'], '2HK': ['Honda', 'Canada'], '5J6': ['Honda', 'United States'], '5FN': ['Honda', 'United States'], '19X': ['Honda', 'United States'], '19U': ['Acura', 'United States'], JH4: ['Acura', 'Japan'], '5J8': ['Acura', 'United States'],
  JN1: ['Nissan', 'Japan'], JN8: ['Nissan', 'Japan'], '1N4': ['Nissan', 'United States'], '1N6': ['Nissan', 'United States'], '3N1': ['Nissan', 'Mexico'], '5N1': ['Nissan', 'United States'], JNK: ['Infiniti', 'Japan'], JNR: ['Infiniti', 'Japan'], '5N3': ['Infiniti', 'United States'],
  JM1: ['Mazda', 'Japan'], JM3: ['Mazda', 'Japan'], JF1: ['Subaru', 'Japan'], JF2: ['Subaru', 'Japan'], '4S3': ['Subaru', 'United States'], '4S4': ['Subaru', 'United States'],
  JA3: ['Mitsubishi', 'Japan'], JA4: ['Mitsubishi', 'Japan'], ML3: ['Mitsubishi', 'Thailand'], JS2: ['Suzuki', 'Japan'], JS3: ['Suzuki', 'Japan'], MA3: ['Suzuki', 'India'],
  KMH: ['Hyundai', 'South Korea'], KM8: ['Hyundai', 'South Korea'], '5NP': ['Hyundai', 'United States'], '5NM': ['Hyundai', 'United States'], KMU: ['Genesis', 'South Korea'],
  KNA: ['Kia', 'South Korea'], KND: ['Kia', 'South Korea'], '5XY': ['Kia', 'United States'], '5XX': ['Kia', 'United States'],
  '1FA': ['Ford', 'United States'], '1FM': ['Ford', 'United States'], '1FT': ['Ford', 'United States'], '1FD': ['Ford', 'United States'], '2FM': ['Ford', 'Canada'], '3FA': ['Ford', 'Mexico'], '1LN': ['Lincoln', 'United States'], '5LM': ['Lincoln', 'United States'],
  '1G1': ['Chevrolet', 'United States'], '1GC': ['Chevrolet', 'United States'], '1GN': ['Chevrolet', 'United States'], '2G1': ['Chevrolet', 'Canada'], '3GN': ['Chevrolet', 'Mexico'], '3GC': ['Chevrolet', 'Mexico'], KL1: ['Chevrolet', 'South Korea'],
  '1GT': ['GMC', 'United States'], '1GK': ['GMC', 'United States'], '1GY': ['Cadillac', 'United States'],
  '1C4': ['Jeep / Chrysler', 'United States'], '1C3': ['Chrysler', 'United States'], '1C6': ['Ram', 'United States'], '2C3': ['Chrysler', 'Canada'], '3C4': ['Chrysler', 'Mexico'], '1J4': ['Jeep', 'United States'], '1J8': ['Jeep', 'United States'], '2B3': ['Dodge', 'Canada'], '1B3': ['Dodge', 'United States'], '5YJ': ['Tesla', 'United States'], '7SA': ['Tesla', 'United States'],
  WBA: ['BMW', 'Germany'], WBS: ['BMW M', 'Germany'], WBX: ['BMW', 'Germany'], '5UX': ['BMW', 'United States'], '5YM': ['BMW M', 'United States'], WMW: ['MINI', 'Germany / UK'],
  WDD: ['Mercedes-Benz', 'Germany'], WDB: ['Mercedes-Benz', 'Germany'], WDC: ['Mercedes-Benz', 'Germany'], W1K: ['Mercedes-Benz', 'Germany'], W1N: ['Mercedes-Benz', 'Germany'], '4JG': ['Mercedes-Benz', 'United States'], '55S': ['Mercedes-Benz', 'United States'],
  WAU: ['Audi', 'Germany'], WA1: ['Audi', 'Germany'], WUA: ['Audi', 'Germany'], WVW: ['Volkswagen', 'Germany'], WVG: ['Volkswagen', 'Germany'], '3VW': ['Volkswagen', 'Mexico'], '1VW': ['Volkswagen', 'United States'], WP0: ['Porsche', 'Germany'], WP1: ['Porsche', 'Germany'],
  SAL: ['Land Rover', 'United Kingdom'], SAJ: ['Jaguar', 'United Kingdom'], SCC: ['Lotus', 'United Kingdom'], YV1: ['Volvo', 'Sweden'], YV4: ['Volvo', 'Sweden'], VF1: ['Renault', 'France'], VF3: ['Peugeot', 'France'], VF7: ['Citroën', 'France'], ZFA: ['Fiat', 'Italy'], ZAR: ['Alfa Romeo', 'Italy'], VSS: ['SEAT', 'Spain'], TMB: ['Škoda', 'Czech Republic'],
  LGX: ['BYD', 'China'], LS5: ['Changan', 'China'], LVV: ['Chery', 'China'], LVS: ['Ford', 'China'], LSV: ['Volkswagen', 'China'], LFV: ['Volkswagen', 'China']
};
// Where a VIN was assigned, from its first character (ISO 3780 regions), when the maker code is not in the list
const REGION = [[/^[1-5]/, 'North America'], [/^J/, 'Japan'], [/^K/, 'South Korea'], [/^L/, 'China'], [/^M/, 'India, Thailand or Indonesia'], [/^S/, 'United Kingdom'],
  [/^V/, 'France or Spain'], [/^W/, 'Germany'], [/^X/, 'Russia or the Netherlands'], [/^Y/, 'Sweden or Finland'], [/^Z/, 'Italy'], [/^T/, 'Switzerland, Czech Republic, Hungary or Turkey'],
  [/^6/, 'Australia'], [/^7/, 'New Zealand'], [/^8/, 'South America'], [/^9/, 'Brazil'], [/^A/, 'South Africa'], [/^N/, 'Turkey or Iran'], [/^P/, 'Philippines or Malaysia'], [/^R/, 'Taiwan or UAE']];
const region = (vin) => (REGION.find(([re]) => re.test(String(vin || '').toUpperCase())) || [, ''])[1];
function maker(vin) {
  const v = String(vin || '').toUpperCase();
  const hit = WMI[v.slice(0, 3)] || WMI[v.slice(0, 2)];
  return hit ? { make: hit[0], country: hit[1] } : null;
}

// Model year from the 10th character. Reliable on North American VINs (1-5); on Japanese and Korean VINs
// built for export it is usually right too. European makers often leave it out, so they get no year here.
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
function modelYear(vin) {
  const v = String(vin || '').toUpperCase();
  if (v.length !== 17 || !/^[1-5JKL]/.test(v)) return null;
  const i = YEAR_CODES.indexOf(v[9]); if (i < 0) return null;
  const max = new Date().getFullYear() + 1;
  // Same letter every 30 years. North American VINs: a letter in position 7 means 2010-2039.
  let y = 1980 + i;
  if (/^[1-5]/.test(v) && /[A-Z]/.test(v[6])) y = 2010 + i; else while (y + 30 <= max) y += 30;
  return y <= max ? y : null;
}

const s = (x) => String(x == null ? '' : x).trim();
const has = (x) => { const t = s(x); return t && !/^(not applicable|n\/a|0|null)$/i.test(t); };

function body(bodyClass, doors) {
  const b = s(bodyClass).toLowerCase();
  if (!b) return '';
  if (/pickup/.test(b)) return 'Pickup';
  if (/minivan/.test(b)) return 'Minivan';
  if (/bus|van/.test(b) && !/minivan/.test(b)) return /bus/.test(b) ? 'Bus' : 'Minivan';
  if (/sport utility|suv|crossover|cuv|multi-purpose/.test(b)) return 'SUV';
  if (/wagon/.test(b)) return 'Wagon';
  if (/hatchback|liftback/.test(b)) return 'Hatchback';
  if (/coupe|convertible|cabriolet|roadster/.test(b)) return 'Coupe';
  if (/sedan|saloon/.test(b)) return Number(doors) === 2 ? 'Coupe' : 'Sedan';
  return '';
}
function engine(r) {
  const fuel = s(r.FuelTypePrimary); const el = s(r.ElectrificationLevel);
  if (/electric/i.test(fuel) && !has(r.DisplacementL)) return 'Electric';
  const l = Number(r.DisplacementL); const cyl = Number(r.EngineCylinders); const cfg = s(r.EngineConfiguration);
  const parts = [];
  if (l > 0) parts.push(l.toFixed(1) + 'L');
  if (cyl > 0) parts.push(/^v/i.test(cfg) ? `V${cyl}` : /flat|horizontally/i.test(cfg) ? `flat-${cyl}` : `${cyl}-cylinder`);
  if (/turbo/i.test(s(r.Turbo)) || /yes/i.test(s(r.Turbo))) parts.push('turbo');
  if (/hev|hybrid/i.test(el)) parts.push(/plug/i.test(el) ? 'plug-in hybrid' : 'hybrid');
  const hp = Number(r.EngineHP);
  return parts.join(' ') + (hp > 0 && parts.length ? ` (${Math.round(hp)} hp)` : '');
}
function gearbox(r) {
  const t = s(r.TransmissionStyle); const sp = Number(r.TransmissionSpeeds);
  if (!t) return '';
  const kind = /cvt|continuously/i.test(t) ? 'CVT automatic' : /dual|dct/i.test(t) ? 'dual-clutch automatic' : /manual/i.test(t) ? 'manual' : /auto/i.test(t) ? 'automatic' : '';
  if (!kind) return '';
  const out = (sp > 0 && !/cvt/i.test(kind) ? `${sp}-speed ` : '') + kind;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function drive(d) {
  const t = s(d).toLowerCase();
  if (/4wd|4x4|4-wheel/.test(t)) return '4WD';
  if (/awd|all-wheel|all wheel/.test(t)) return 'AWD';
  if (/rwd|rear-wheel|rear wheel/.test(t)) return 'RWD';
  if (/fwd|front-wheel|front wheel/.test(t)) return 'FWD';
  return '';
}
function fuel(r) {
  const el = s(r.ElectrificationLevel); const f = s(r.FuelTypePrimary);
  if (/plug/i.test(el)) return 'Plug-in hybrid';
  if (/hev|hybrid/i.test(el)) return 'Hybrid';
  if (/electric/i.test(f)) return 'Electric';
  if (/diesel/i.test(f)) return 'Diesel';
  if (/gasoline|petrol|flexible/i.test(f)) return 'Petrol';
  return '';
}
// Standard equipment the record lists (fitted at the factory on every car of that model)
const FEATURES = [
  ['BackupCamera', 'Reverse camera'], ['ParkAssist', 'Parking sensors'], ['BlindSpotMon', 'Blind-spot monitoring'],
  ['RearCrossTrafficAlert', 'Rear cross-traffic alert'], ['LaneDepartureWarning', 'Lane departure warning'], ['LaneKeepSystem', 'Lane keeping assist'],
  ['LaneCenteringAssistance', 'Lane centring assist'], ['ForwardCollisionWarning', 'Forward collision warning'], ['CIB', 'Automatic emergency braking'],
  ['AdaptiveCruiseControl', 'Adaptive cruise control'], ['KeylessIgnition', 'Push-to-start'], ['AdaptiveDrivingBeam', 'Adaptive headlights'],
  ['SemiautomaticHeadlampBeamSwitching', 'Automatic high beams'], ['DaytimeRunningLight', 'Daytime running lights'], ['ABS', 'ABS brakes'],
  ['ESC', 'Stability control'], ['TractionControl', 'Traction control'], ['TPMS', 'Tyre pressure monitor']
];
function features(r) {
  const out = FEATURES.filter(([k]) => /standard|direct|indirect/i.test(s(r[k]))).map(([, l]) => l);
  if (has(r.AirBagLocSide)) out.push('Side airbags');
  if (has(r.AirBagLocCurtain)) out.push('Curtain airbags');
  if (has(r.AirBagLocKnee)) out.push('Knee airbags');
  return out;
}
const title = (x) => s(x).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUsa\b/g, 'USA').replace(/\bBmw\b/g, 'BMW').replace(/\bGmc\b/g, 'GMC');

const facts = require('./model-facts');
const uniq = (a) => [...new Set(a.filter(Boolean))];
// Factory codes in the record's Series ("ASV50L/GSV50L/AVV50L") are not trims
const FRAME_LIKE = /^[A-Z]{2,5}\d{2,3}[A-Z]{0,2}(\s*\/\s*[A-Z]{2,5}\d{2,3}[A-Z]{0,2})*$/;
const capFuel = (e) => (/hybrid/i.test(e) ? 'Hybrid' : /diesel/i.test(e) ? 'Diesel' : /electric/i.test(e) ? 'Electric' : 'Petrol');

// row: the raw vPIC result (may be empty when the service is down or does not know the VIN).
// opts.chassis: the value is a Japanese chassis (frame) number, not a VIN.
function prefill(vin, row = {}, opts = {}) {
  const chassis = !!opts.chassis;
  const fromWmi = chassis ? null : maker(vin);
  const series = has(row.Series) ? s(row.Series) : '';
  let frames = chassis ? facts.frameCodes(vin) : FRAME_LIKE.test(series) ? facts.frameCodes(series, has(row.Make) ? title(row.Make) : fromWmi && fromWmi.make) : [];
  const make = has(row.Make) ? title(row.Make) : fromWmi ? fromWmi.make : frames.length ? frames[0].make : '';
  const model = has(row.Model) ? s(row.Model) : uniq(frames.map((f) => f.model)).length === 1 ? frames[0].model : '';
  const year = Number(row.ModelYear) || (chassis ? null : modelYear(vin)) || null;
  let trim = has(row.Trim) && !/^(standard|base)$/i.test(s(row.Trim)) ? s(row.Trim) : series && !FRAME_LIKE.test(series) && !/^\d+$/.test(series) ? series : '';
  // Several trims share one VIN pattern ("L/LE/SE/XLE"): the seller picks one, so nothing goes in the title
  let trimChoices = [];
  if (/\s*\/\s*/.test(trim)) { trimChoices = trim.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean); trim = ''; }
  // Lexus and others repeat the model in the trim ("RX" + "RX 350"): keep the fuller one once
  const showModel = model && trim.toLowerCase().startsWith(model.toLowerCase() + ' ') ? '' : model;
  const country = has(row.PlantCountry) ? title(s(row.PlantCountry).replace(/\s*\(.*\)$/, '')).replace(/^United States Of America$/, 'United States') : (fromWmi ? fromWmi.country : '');
  const where = country || (chassis ? 'Japan' : region(vin)); // shown on the VIN check page; not put on the car form unless it is a real country
  const out = {
    make, model, year, trim,
    body: body(row.BodyClass, row.Doors), engine: engine(row), transmission: gearbox(row), drivetrain: drive(row.DriveType), fuel: fuel(row)
  };
  let seats = Number(row.Seats) > 0 ? Number(row.Seats) : 0;

  // Fill the gaps from the factory codes and what every car of this model generation shares
  const gen = facts.generation(make, model, year);
  if (gen && frames.length) { const known = frames.filter((f) => gen.engines.some((e) => e.engine === f.engine)); if (known.length) frames = known; }
  const twoWd = /4x2|2wd/i.test(s(row.DriveType));
  const choices = {};
  if (!out.engine) {
    const opts2 = frames.length ? uniq(frames.map((f) => f.engine)) : gen ? uniq(gen.engines.map((e) => e.engine)) : [];
    if (opts2.length === 1) out.engine = opts2[0]; else if (opts2.length > 1) choices.engine = opts2;
  }
  // The US record sometimes misses that a car is a hybrid or diesel (2009 Prius: "1.5L, gasoline"); the factory code says
  if (out.engine && frames.length === 1 && frames[0].fuel !== 'Petrol' && !/hybrid|diesel/i.test(out.engine) && out.engine.startsWith(frames[0].engine.slice(0, 4))) {
    out.engine = frames[0].engine; out.fuel = frames[0].fuel;
  }
  const engines = gen ? (out.engine ? facts.matchEngine(gen.engines, out.engine) : gen.engines) : [];
  if (!has(row.FuelTypePrimary) || /gasoline/i.test(s(row.FuelTypePrimary)) && !/hev|hybrid/i.test(s(row.ElectrificationLevel)) && out.engine && /hybrid|diesel/i.test(out.engine)) {
    if (out.engine) out.fuel = capFuel(out.engine);
    else { const f = uniq((frames.length ? frames : engines).map((e) => e.fuel)); if (f.length === 1) out.fuel = f[0]; }
  }
  if (!out.transmission && engines.length) {
    const g = uniq(engines.map((e) => e.gearbox));
    if (g.length === 1 && engines.every((e) => e.gearbox)) out.transmission = g[0]; else if (out.engine && g.length > 1) choices.transmission = g;
  }
  if (!out.drivetrain) {
    const fd = uniq(frames.map((f) => f.drive));
    let opts3 = fd.length === 1 && frames.every((f) => f.drive) ? fd : gen ? gen.drives : [];
    if (twoWd) opts3 = opts3.filter((d) => d === 'FWD' || d === 'RWD');
    else if (/awd|4wd|4x4|all/i.test(s(row.DriveType))) opts3 = opts3.filter((d) => d === 'AWD' || d === '4WD');
    if (opts3.length === 1) out.drivetrain = opts3[0]; else if (opts3.length > 1) choices.drivetrain = opts3;
  }
  // For each engine the seller can pick: the gearbox and fuel that come with it
  if (choices.engine && gen) {
    choices.withEngine = {};
    for (const e of choices.engine) {
      const m = facts.matchEngine(gen.engines, e); const g = uniq(m.map((x) => x.gearbox));
      choices.withEngine[e] = { fuel: capFuel(e), ...(g.length === 1 && m.every((x) => x.gearbox) ? { transmission: g[0] } : {}) };
    }
  }
  // The record says "4WD" where the maker says AWD (Mercedes 4MATIC) or the other way round: use the maker's word
  if (gen && /^(AWD|4WD)$/.test(out.drivetrain || '') && !gen.drives.includes(out.drivetrain)) { const o = gen.drives.filter((d) => d === 'AWD' || d === '4WD'); if (o.length === 1) out.drivetrain = o[0]; }
  if (!out.body && gen && gen.body) out.body = gen.body;
  if (!seats && gen && gen.seats) seats = gen.seats;

  const specs = [];
  if (out.engine) specs.push(['Engine', out.engine]);
  if (out.transmission) specs.push(['Transmission', out.transmission]);
  if (out.drivetrain) specs.push(['Drive', out.drivetrain]);
  if (out.fuel) specs.push(['Fuel', out.fuel]);
  if (Number(row.Doors) > 0) specs.push(['Doors', String(Number(row.Doors))]);
  if (seats) specs.push(['Seats', String(seats)]);
  if (has(row.EngineModel)) specs.push(['Engine code', s(row.EngineModel)]);
  else if (frames.length === 1) specs.push(['Model code', frames[0].code]);
  if (country) specs.push(['Built in', country]);
  out.specs = specs;
  out.features = features(row);
  out.title = [year, make, showModel, trim].filter(Boolean).join(' ');
  // A short, factual starter description the seller edits (no claims the record cannot support)
  const an = (w) => (/^(8|11|18|[aeiou])/i.test(w) ? 'an' : 'a');
  const DRIVE = { FWD: 'front-wheel drive', AWD: 'all-wheel drive', '4WD': 'four-wheel drive (4x4)', RWD: 'rear-wheel drive' };
  const bits = [out.engine && `${an(out.engine)} ${out.engine} engine`, out.transmission && `${an(out.transmission)} ${out.transmission.toLowerCase()} gearbox`, out.drivetrain && DRIVE[out.drivetrain]].filter(Boolean);
  const place = /^(United States|United Kingdom|Czech Republic)$/.test(country) ? `the ${country}` : country;
  out.description = model && bits.length ? `This ${out.title} comes with ${bits.join(', ').replace(/, ([^,]*)$/, ' and $1')}.${country ? ` Built in ${place}.` : ''}` : '';
  out.source = has(row.Make) ? 'factory' : frames.length ? 'model-code' : fromWmi ? 'maker-code' : 'none';
  out.region = where;
  if (trimChoices.length > 1) out.trimChoices = trimChoices;
  if (Object.keys(choices).length) out.choices = choices;
  for (const k of Object.keys(out)) if (out[k] === '' || out[k] == null || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}

module.exports = { prefill, maker, modelYear, region, body, engine, gearbox, drive, fuel };
