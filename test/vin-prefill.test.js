// Filling the car form from the VIN: factory record mapped to our fields, and the maker/year/country fallback
// for VINs the US database does not know (European, Gulf, Chinese, Japanese-market cars).
const { test } = require('node:test');
const assert = require('node:assert');
const { prefill, maker, modelYear, region } = require('../server/lib/vin-prefill');

test('a US-market Camry record fills title, body, engine, gearbox, drive, fuel, specs and safety features', () => {
  const p = prefill('4T1B11HK2JU020841', { Make: 'TOYOTA', Model: 'Camry', ModelYear: '2018', Trim: 'SE', BodyClass: 'Sedan/Saloon', Doors: '4', DriveType: 'FWD/Front-Wheel Drive',
    TransmissionStyle: 'Automatic', TransmissionSpeeds: '8', EngineCylinders: '4', DisplacementL: '2.5', EngineConfiguration: 'In-Line', FuelTypePrimary: 'Gasoline',
    PlantCountry: 'UNITED STATES (USA)', BackupCamera: 'Standard', BlindSpotMon: 'Optional', CIB: 'Standard', AirBagLocSide: '1st Row' });
  assert.deepStrictEqual([p.title, p.body, p.engine, p.transmission, p.drivetrain, p.fuel], ['2018 Toyota Camry SE', 'Sedan', '2.5L 4-cylinder', '8-speed automatic', 'FWD', 'Petrol']);
  assert.ok(p.features.includes('Reverse camera') && p.features.includes('Automatic emergency braking') && !p.features.includes('Blind-spot monitoring'), 'only standard equipment');
  assert.match(p.description, /an 8-speed automatic gearbox and front-wheel drive\. Built in the United States\./);
});

test('SUVs, V6 engines, hybrids and Lexus-style trims come out right', () => {
  const p = prefill('2T2BZMCA1GC012345', { Make: 'LEXUS', Model: 'RX', ModelYear: '2016', Trim: 'RX 350', BodyClass: 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', DriveType: 'AWD/All-Wheel Drive', EngineCylinders: '6', DisplacementL: '3.456', EngineConfiguration: 'V-Shaped' });
  assert.deepStrictEqual([p.title, p.body, p.engine, p.drivetrain], ['2016 Lexus RX 350', 'SUV', '3.5L V6', 'AWD']);
  const h = prefill('JTDKN3DU5A0123456', { Make: 'TOYOTA', Model: 'Prius', ModelYear: '2010', DisplacementL: '1.8', EngineCylinders: '4', ElectrificationLevel: 'Strong HEV (Hybrid Electric Vehicle)', FuelTypePrimary: 'Gasoline' });
  assert.deepStrictEqual([h.fuel, h.engine], ['Hybrid', '1.8L 4-cylinder hybrid']);
});

test('VINs the US database does not know still give the maker, country and (where reliable) the year', () => {
  assert.deepStrictEqual(maker('WDDZF4JB1HA123456'), { make: 'Mercedes-Benz', country: 'Germany' });
  assert.deepStrictEqual(maker('LS5A3ADE8LB123456'), { make: 'Changan', country: 'China' });
  assert.strictEqual(prefill('SALGS2RE5JA123456', {}).make, 'Land Rover');
  assert.strictEqual(modelYear('1HGCM82633A004352'), 2003);
  assert.strictEqual(modelYear('5YJ3E1EA7KF317000'), 2019);
  assert.strictEqual(modelYear('WDDZF4JB1HA123456'), null, 'European VINs: no year guessed');
  assert.strictEqual(region('XTA21099012345678'), 'Russia or the Netherlands');
  const none = prefill('WDDZF4JB1HA123456', {});
  assert.ok(!none.model && !none.engine && !none.description, 'nothing invented');
});

test('a VIN that fits several trims leaves the choice to the seller', () => {
  const p = prefill('4T1B11HK2JU020841', { Make: 'TOYOTA', Model: 'Camry', ModelYear: '2018', Trim: 'L/LE/SE/XLE' });
  assert.strictEqual(p.title, '2018 Toyota Camry');
  assert.deepStrictEqual(p.trimChoices, ['L', 'LE', 'SE', 'XLE']);
  assert.strictEqual(p.trim, undefined);
});

test('factory codes in the record are not trims: the seller picks the engine, and the gearbox and fuel follow', () => {
  const p = prefill('4T1BF1FK5CU512345', { Make: 'TOYOTA', Model: 'Camry', ModelYear: '2012', Series: 'ASV50L/GSV50L/AVV50L', DriveType: '4x2' });
  assert.strictEqual(p.trim, undefined); assert.strictEqual(p.trimChoices, undefined);
  assert.deepStrictEqual([p.body, p.drivetrain, p.title], ['Sedan', 'FWD', '2012 Toyota Camry']);
  assert.deepStrictEqual(p.choices.engine, ['2.5L 4-cylinder', '3.5L V6', '2.5L 4-cylinder hybrid']);
  assert.deepStrictEqual(p.choices.withEngine['2.5L 4-cylinder hybrid'], { fuel: 'Hybrid', transmission: 'CVT automatic' });
});

test('"4x2" and a missing gearbox are filled from the model generation when every car of it shares them', () => {
  const p = prefill('4T1BF1FK5CU512345', { Make: 'TOYOTA', Model: 'Camry', ModelYear: '2012', Series: 'ASV50L/GSV50L/AVV50L', DriveType: '4x2', DisplacementL: '2.5', EngineCylinders: '4', EngineHP: '178', EngineModel: '2AR-FE', FuelTypePrimary: 'Gasoline', BodyClass: 'Sedan/Saloon' });
  assert.deepStrictEqual([p.engine, p.transmission, p.drivetrain, p.fuel], ['2.5L 4-cylinder (178 hp)', '6-speed automatic', 'FWD', 'Petrol']);
  assert.ok(p.specs.some(([k, v]) => k === 'Engine code' && v === '2AR-FE'));
  // RAV4 2010: FWD or 4WD; the record's 4x2 settles it
  const r = prefill('JTMBF4DV4AD012345', { Make: 'TOYOTA', Model: 'RAV4', ModelYear: '2010', Trim: 'Standard', Series: 'ASA33L/ASA38L/GSA33L/GSA38L', DriveType: '4x2', DisplacementL: '2.5', EngineCylinders: '4' });
  assert.deepStrictEqual([r.trim, r.transmission, r.drivetrain, r.body], [undefined, '4-speed automatic', 'FWD', 'SUV']);
});

test('a hybrid the US record calls "gasoline" is corrected from its factory code (2009 Prius, NHW20)', () => {
  const p = prefill('JTDKB20U093512345', { Make: 'TOYOTA', Model: 'Prius', ModelYear: '2009', Series: 'NHW20L', DriveType: '4x2', DisplacementL: '1.5', EngineCylinders: '4', FuelTypePrimary: 'Gasoline' });
  assert.deepStrictEqual([p.engine, p.fuel, p.transmission, p.body], ['1.5L 4-cylinder hybrid', 'Hybrid', 'CVT automatic', 'Hatchback']);
});

test('a Japanese chassis number gives the model and engine from its model code', () => {
  const p = prefill('ACV403012345', {}, { chassis: true });
  assert.deepStrictEqual([p.make, p.model, p.engine, p.drivetrain, p.region], ['Toyota', 'Camry', '2.4L 4-cylinder', 'FWD', 'Japan']);
  assert.strictEqual(prefill('ZRE1420012345', {}, { chassis: true }).model, 'Corolla');
  assert.deepStrictEqual(prefill('XYZ991234567', {}, { chassis: true }).make, undefined, 'unknown codes fill nothing');
});

test('Mercedes 4MATIC is AWD, and the gearbox comes from the generation', () => {
  const p = prefill('WDDGF8AB1DR123456', { Make: 'MERCEDES-BENZ', Model: 'C-Class', ModelYear: '2013', Trim: 'C300 4MATIC', DriveType: '4WD/4-Wheel Drive/4x4', DisplacementL: '3.5', EngineCylinders: '6', EngineConfiguration: 'V-Shaped' });
  assert.deepStrictEqual([p.drivetrain, p.transmission, p.body], ['AWD', '7-speed automatic', 'Sedan']);
});

test('"Write it for me" uses only what the form says; picking an engine sets its gearbox and fuel', async () => {
  const { writeDescription, pickChoice, parseMileage, joinMileage } = await import('../client/src/lib/prefill.js');
  const d = writeDescription({ title: '2012 Toyota Camry SE', condition: 'Foreign Used', color: 'Black', mileage: '68,000 miles', engine: '2.5L 4-cylinder (178 hp)', transmission: '6-speed automatic', drivetrain: 'FWD', fuel: 'Petrol', interior: 'Beige leather', features: 'Reverse camera\nBluetooth\nLED headlights' });
  assert.match(d, /^This 2012 Toyota Camry SE in black is a foreign-used \(tokunbo\) car with 68,000 miles on the clock\. It has a 2\.5L 4-cylinder engine, a 6-speed automatic gearbox and front-wheel drive\. Inside: beige leather\./);
  assert.match(d, /Features include reverse camera, Bluetooth and LED headlights\./);
  const w = { '2.5L 4-cylinder hybrid': { fuel: 'Hybrid', transmission: 'CVT automatic' } };
  const p = pickChoice({ engine: '', transmission: 'Automatic', fuel: 'Petrol', specsText: 'Doors: 4' }, 'engine', '2.5L 4-cylinder hybrid', w);
  assert.deepStrictEqual([p.engine, p.transmission, p.fuel], ['2.5L 4-cylinder hybrid', 'CVT automatic', 'Hybrid']);
  assert.match(p.specsText, /Engine: 2\.5L 4-cylinder hybrid/);
  assert.deepStrictEqual([parseMileage('45,000 km'), joinMileage('68000', 'miles')], [{ num: '45000', unit: 'km' }, '68,000 miles']);
});
