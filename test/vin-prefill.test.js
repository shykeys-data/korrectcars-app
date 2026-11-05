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
