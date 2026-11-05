// What every car of a model generation shares, for the cars most sold in Nigeria (Nov 2026).
// Used by lib/vin-prefill.js to fill the gaps the US VIN record leaves (it often says only "4x2" for the drive,
// gives no gearbox, and lists factory codes instead of a trim), and to decode Toyota/Lexus factory codes
// (the "ASV50" in a VIN record, or the "ACV40-0123456" chassis number on Japanese cars).
//
// Rule: a fact is filled in only when every car of that generation has it. When a generation came with several
// engines, drives or gearboxes, the seller is offered the choices and picks one; nothing is guessed.
// Figures are for the versions sold new in the US, where most tokunbo cars come from.

// Toyota and Lexus factory (frame) codes. The letters before the digits name the engine family.
// code: [model, engine, fuel, drive]  (drive '' = this code is used for both 2WD and 4WD cars)
const FRAME = {
  Toyota: {
    MCV30: ['Camry', '3.0L V6', 'Petrol', 'FWD'], ACV30: ['Camry', '2.4L 4-cylinder', 'Petrol', 'FWD'],
    ACV40: ['Camry', '2.4L 4-cylinder', 'Petrol', 'FWD'], ASV40: ['Camry', '2.5L 4-cylinder', 'Petrol', 'FWD'], GSV40: ['Camry', '3.5L V6', 'Petrol', 'FWD'], AHV40: ['Camry', '2.4L 4-cylinder hybrid', 'Hybrid', 'FWD'],
    ASV50: ['Camry', '2.5L 4-cylinder', 'Petrol', 'FWD'], GSV50: ['Camry', '3.5L V6', 'Petrol', 'FWD'], AVV50: ['Camry', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'],
    ASV70: ['Camry', '2.5L 4-cylinder', 'Petrol', 'FWD'], AXVA70: ['Camry', '2.5L 4-cylinder', 'Petrol', 'FWD'], GSV70: ['Camry', '3.5L V6', 'Petrol', 'FWD'], AXVH70: ['Camry', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'], AXVH71: ['Camry', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'],
    ZRE142: ['Corolla', '1.8L 4-cylinder', 'Petrol', 'FWD'], ZRE152: ['Corolla', '1.8L 4-cylinder', 'Petrol', 'FWD'], ZRE172: ['Corolla', '1.8L 4-cylinder', 'Petrol', 'FWD'], ZRE212: ['Corolla', '1.8L 4-cylinder', 'Petrol', 'FWD'],
    MZEA12: ['Corolla', '2.0L 4-cylinder', 'Petrol', 'FWD'], ZWE211: ['Corolla', '1.8L 4-cylinder hybrid', 'Hybrid', 'FWD'], NZE141: ['Corolla', '1.5L 4-cylinder', 'Petrol', 'FWD'],
    ACA33: ['RAV4', '2.4L 4-cylinder', 'Petrol', 'FWD'], ACA38: ['RAV4', '2.4L 4-cylinder', 'Petrol', '4WD'], ASA33: ['RAV4', '2.5L 4-cylinder', 'Petrol', 'FWD'], ASA38: ['RAV4', '2.5L 4-cylinder', 'Petrol', '4WD'],
    GSA33: ['RAV4', '3.5L V6', 'Petrol', 'FWD'], GSA38: ['RAV4', '3.5L V6', 'Petrol', '4WD'], ASA42: ['RAV4', '2.5L 4-cylinder', 'Petrol', 'FWD'], ASA44: ['RAV4', '2.5L 4-cylinder', 'Petrol', 'AWD'], AVA44: ['RAV4', '2.5L 4-cylinder hybrid', 'Hybrid', 'AWD'],
    AXAA52: ['RAV4', '2.5L 4-cylinder', 'Petrol', 'FWD'], AXAA54: ['RAV4', '2.5L 4-cylinder', 'Petrol', 'AWD'], AXAH52: ['RAV4', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'], AXAH54: ['RAV4', '2.5L 4-cylinder hybrid', 'Hybrid', 'AWD'],
    MXAA52: ['RAV4', '2.0L 4-cylinder', 'Petrol', 'FWD'], MXAA54: ['RAV4', '2.0L 4-cylinder', 'Petrol', 'AWD'],
    GSU40: ['Highlander', '3.5L V6', 'Petrol', 'FWD'], GSU45: ['Highlander', '3.5L V6', 'Petrol', '4WD'], ASU40: ['Highlander', '2.7L 4-cylinder', 'Petrol', 'FWD'], MHU48: ['Highlander', '3.3L V6 hybrid', 'Hybrid', '4WD'],
    GSU50: ['Highlander', '3.5L V6', 'Petrol', 'FWD'], GSU55: ['Highlander', '3.5L V6', 'Petrol', 'AWD'], ASU50: ['Highlander', '2.7L 4-cylinder', 'Petrol', 'FWD'], GVU58: ['Highlander', '3.5L V6 hybrid', 'Hybrid', 'AWD'],
    GSU70: ['Highlander', '3.5L V6', 'Petrol', 'FWD'], GSU75: ['Highlander', '3.5L V6', 'Petrol', 'AWD'], AXUH78: ['Highlander', '2.5L 4-cylinder hybrid', 'Hybrid', 'AWD'],
    AGV10: ['Venza', '2.7L 4-cylinder', 'Petrol', 'FWD'], AGV15: ['Venza', '2.7L 4-cylinder', 'Petrol', 'AWD'], GGV10: ['Venza', '3.5L V6', 'Petrol', 'FWD'], GGV15: ['Venza', '3.5L V6', 'Petrol', 'AWD'],
    GSL20: ['Sienna', '3.5L V6', 'Petrol', 'FWD'], GSL25: ['Sienna', '3.5L V6', 'Petrol', 'AWD'], GSL30: ['Sienna', '3.5L V6', 'Petrol', 'FWD'], GSL35: ['Sienna', '3.5L V6', 'Petrol', 'AWD'], ASL30: ['Sienna', '2.7L 4-cylinder', 'Petrol', 'FWD'],
    GSX30: ['Avalon', '3.5L V6', 'Petrol', 'FWD'],
    GRN210: ['4Runner', '4.0L V6', 'Petrol', 'RWD'], GRN215: ['4Runner', '4.0L V6', 'Petrol', '4WD'], UZN210: ['4Runner', '4.7L V8', 'Petrol', 'RWD'], UZN215: ['4Runner', '4.7L V8', 'Petrol', '4WD'],
    GRN280: ['4Runner', '4.0L V6', 'Petrol', 'RWD'], GRN285: ['4Runner', '4.0L V6', 'Petrol', '4WD'],
    GSJ10: ['FJ Cruiser', '4.0L V6', 'Petrol', 'RWD'], GSJ15: ['FJ Cruiser', '4.0L V6', 'Petrol', '4WD'],
    UZJ100: ['Land Cruiser', '4.7L V8', 'Petrol', '4WD'], URJ200: ['Land Cruiser', '5.7L V8', 'Petrol', '4WD'], URJ202: ['Land Cruiser', '4.6L V8', 'Petrol', '4WD'], VDJ200: ['Land Cruiser', '4.5L V8 diesel', 'Diesel', '4WD'], GRJ200: ['Land Cruiser', '4.0L V6', 'Petrol', '4WD'],
    GRJ120: ['Land Cruiser Prado', '4.0L V6', 'Petrol', '4WD'], TRJ120: ['Land Cruiser Prado', '2.7L 4-cylinder', 'Petrol', '4WD'], KDJ120: ['Land Cruiser Prado', '3.0L 4-cylinder diesel', 'Diesel', '4WD'],
    GRJ150: ['Land Cruiser Prado', '4.0L V6', 'Petrol', '4WD'], TRJ150: ['Land Cruiser Prado', '2.7L 4-cylinder', 'Petrol', '4WD'], KDJ150: ['Land Cruiser Prado', '3.0L 4-cylinder diesel', 'Diesel', '4WD'], GDJ150: ['Land Cruiser Prado', '2.8L 4-cylinder diesel', 'Diesel', '4WD'],
    KUN25: ['Hilux', '3.0L 4-cylinder diesel', 'Diesel', ''], KUN26: ['Hilux', '3.0L 4-cylinder diesel', 'Diesel', '4WD'], GGN25: ['Hilux', '4.0L V6', 'Petrol', '4WD'], GUN125: ['Hilux', '2.4L 4-cylinder diesel', 'Diesel', '4WD'], GUN126: ['Hilux', '2.8L 4-cylinder diesel', 'Diesel', '4WD'],
    NHW20: ['Prius', '1.5L 4-cylinder hybrid', 'Hybrid', 'FWD'], ZVW30: ['Prius', '1.8L 4-cylinder hybrid', 'Hybrid', 'FWD'], ZVW50: ['Prius', '1.8L 4-cylinder hybrid', 'Hybrid', 'FWD']
  },
  Lexus: {
    MCU15: ['RX 300', '3.0L V6', 'Petrol', ''], MCU38: ['RX 330', '3.3L V6', 'Petrol', ''], MCU33: ['RX 330', '3.3L V6', 'Petrol', 'FWD'], GSU35: ['RX 350', '3.5L V6', 'Petrol', ''], MHU38: ['RX 400h', '3.3L V6 hybrid', 'Hybrid', ''],
    GGL10: ['RX 350', '3.5L V6', 'Petrol', 'FWD'], GGL15: ['RX 350', '3.5L V6', 'Petrol', 'AWD'], GYL15: ['RX 450h', '3.5L V6 hybrid', 'Hybrid', 'AWD'], GYL16: ['RX 450h', '3.5L V6 hybrid', 'Hybrid', 'FWD'],
    GGL20: ['RX 350', '3.5L V6', 'Petrol', 'FWD'], GGL25: ['RX 350', '3.5L V6', 'Petrol', 'AWD'], GYL25: ['RX 450h', '3.5L V6 hybrid', 'Hybrid', 'AWD'], AGL20: ['RX 300', '2.0L 4-cylinder turbo', 'Petrol', 'FWD'], AGL25: ['RX 300', '2.0L 4-cylinder turbo', 'Petrol', 'AWD'],
    MCV20: ['ES 300', '3.0L V6', 'Petrol', 'FWD'], MCV30: ['ES 300', '3.0L V6', 'Petrol', 'FWD'], MCV31: ['ES 330', '3.3L V6', 'Petrol', 'FWD'],
    GSV40: ['ES 350', '3.5L V6', 'Petrol', 'FWD'], GSV60: ['ES 350', '3.5L V6', 'Petrol', 'FWD'], AVV60: ['ES 300h', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'], GSZ10: ['ES 350', '3.5L V6', 'Petrol', 'FWD'], AXZH10: ['ES 300h', '2.5L 4-cylinder hybrid', 'Hybrid', 'FWD'],
    UZJ120: ['GX 470', '4.7L V8', 'Petrol', '4WD'], URJ150: ['GX 460', '4.6L V8', 'Petrol', '4WD'], UZJ100: ['LX 470', '4.7L V8', 'Petrol', '4WD'], URJ201: ['LX 570', '5.7L V8', 'Petrol', '4WD'],
    GSE20: ['IS 250', '2.5L V6', 'Petrol', 'RWD'], GSE25: ['IS 250', '2.5L V6', 'Petrol', 'AWD'], GSE21: ['IS 350', '3.5L V6', 'Petrol', 'RWD'],
    AGZ10: ['NX 200t', '2.0L 4-cylinder turbo', 'Petrol', 'FWD'], AGZ15: ['NX 200t', '2.0L 4-cylinder turbo', 'Petrol', 'AWD'], AYZ15: ['NX 300h', '2.5L 4-cylinder hybrid', 'Hybrid', 'AWD']
  }
};

// Model generations: [make, model (lower case, as the VIN record or the seller writes it), first year, last year, facts]
// facts: body, drives (every drive it was sold with), seats (only when all have the same), engines: [engine, fuel, gearbox, from?, to?]
const E = (engine, fuel, gearbox, from, to) => ({ engine, fuel, gearbox, from, to });
const P = 'Petrol'; const H = 'Hybrid'; const D = 'Diesel';
const GEN = [
  ['Toyota', 'camry', 2002, 2006, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, ''), E('3.0L V6', P, '', 2002, 2006), E('3.3L V6', P, '5-speed automatic', 2004, 2006)] }],
  ['Toyota', 'camry', 2007, 2011, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '5-speed automatic', 2007, 2009), E('2.5L 4-cylinder', P, '6-speed automatic', 2010, 2011), E('3.5L V6', P, '6-speed automatic'), E('2.4L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'camry', 2012, 2017, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, '6-speed automatic'), E('3.5L V6', P, '6-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'camry', 2018, 2019, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, '8-speed automatic'), E('3.5L V6', P, '8-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'camry', 2020, 2024, { body: 'Sedan', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, '8-speed automatic'), E('3.5L V6', P, '8-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'camry', 2025, 2027, { body: 'Sedan', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'corolla', 2003, 2008, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('1.8L 4-cylinder', P, '')] }],
  ['Toyota', 'corolla', 2009, 2013, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('1.8L 4-cylinder', P, ''), E('2.4L 4-cylinder', P, '5-speed automatic', 2009, 2010)] }],
  ['Toyota', 'corolla', 2014, 2019, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('1.8L 4-cylinder', P, '')] }],
  ['Toyota', 'corolla', 2020, 2026, { drives: ['FWD'], seats: 5, engines: [E('1.8L 4-cylinder', P, 'CVT automatic'), E('2.0L 4-cylinder', P, ''), E('1.8L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'rav4', 2006, 2012, { body: 'SUV', drives: ['FWD', '4WD'], engines: [E('2.4L 4-cylinder', P, '4-speed automatic', 2006, 2008), E('2.5L 4-cylinder', P, '4-speed automatic', 2009, 2012), E('3.5L V6', P, '5-speed automatic')] }],
  ['Toyota', 'rav4', 2013, 2018, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, '6-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic', 2016, 2018)] }],
  ['Toyota', 'rav4', 2019, 2026, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, '8-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'highlander', 2008, 2013, { body: 'SUV', drives: ['FWD', '4WD'], engines: [E('2.7L 4-cylinder', P, '6-speed automatic', 2009, 2013), E('3.5L V6', P, '5-speed automatic'), E('3.3L V6 hybrid', H, 'CVT automatic', 2008, 2010), E('3.5L V6 hybrid', H, 'CVT automatic', 2011, 2013)] }],
  ['Toyota', 'highlander', 2014, 2019, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('2.7L 4-cylinder', P, '6-speed automatic'), E('3.5L V6', P, '6-speed automatic', 2014, 2016), E('3.5L V6', P, '8-speed automatic', 2017, 2019), E('3.5L V6 hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'highlander', 2020, 2026, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('3.5L V6', P, '8-speed automatic', 2020, 2022), E('2.4L 4-cylinder turbo', P, '8-speed automatic', 2023, 2026), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'venza', 2009, 2015, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.7L 4-cylinder', P, '6-speed automatic'), E('3.5L V6', P, '6-speed automatic')] }],
  ['Toyota', 'sienna', 2004, 2010, { body: 'Minivan', drives: ['FWD', 'AWD'], engines: [E('3.3L V6', P, '5-speed automatic', 2004, 2006), E('3.5L V6', P, '5-speed automatic', 2007, 2010)] }],
  ['Toyota', 'sienna', 2011, 2020, { body: 'Minivan', drives: ['FWD', 'AWD'], engines: [E('2.7L 4-cylinder', P, '6-speed automatic', 2011, 2012), E('3.5L V6', P, '6-speed automatic', 2011, 2016), E('3.5L V6', P, '8-speed automatic', 2017, 2020)] }],
  ['Toyota', 'sienna', 2021, 2026, { body: 'Minivan', drives: ['FWD', 'AWD'], engines: [E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'avalon', 2005, 2012, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('3.5L V6', P, '5-speed automatic', 2005, 2007), E('3.5L V6', P, '6-speed automatic', 2008, 2012)] }],
  ['Toyota', 'avalon', 2013, 2018, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('3.5L V6', P, '6-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', '4runner', 2003, 2009, { body: 'SUV', drives: ['RWD', '4WD'], engines: [E('4.0L V6', P, ''), E('4.7L V8', P, '5-speed automatic')] }],
  ['Toyota', '4runner', 2010, 2024, { body: 'SUV', drives: ['RWD', '4WD'], engines: [E('4.0L V6', P, '5-speed automatic')] }],
  ['Toyota', 'fj cruiser', 2007, 2014, { body: 'SUV', drives: ['RWD', '4WD'], seats: 5, engines: [E('4.0L V6', P, '')] }],
  ['Toyota', 'land cruiser', 2008, 2021, { body: 'SUV', drives: ['4WD'], engines: [E('5.7L V8', P, ''), E('4.6L V8', P, '6-speed automatic'), E('4.0L V6', P, ''), E('4.5L V8 diesel', D, '')] }],
  ['Toyota', 'land cruiser prado', 2010, 2023, { body: 'SUV', drives: ['4WD'], engines: [E('4.0L V6', P, ''), E('2.7L 4-cylinder', P, ''), E('2.8L 4-cylinder diesel', D, ''), E('3.0L 4-cylinder diesel', D, '')] }],
  ['Toyota', 'hilux', 2005, 2026, { body: 'Pickup', drives: ['RWD', '4WD'], engines: [E('2.4L 4-cylinder diesel', D, ''), E('2.5L 4-cylinder diesel', D, ''), E('2.8L 4-cylinder diesel', D, ''), E('3.0L 4-cylinder diesel', D, ''), E('2.7L 4-cylinder', P, ''), E('4.0L V6', P, '')] }],
  ['Toyota', 'tacoma', 2005, 2015, { body: 'Pickup', drives: ['RWD', '4WD'], engines: [E('2.7L 4-cylinder', P, ''), E('4.0L V6', P, '')] }],
  ['Toyota', 'tacoma', 2016, 2023, { body: 'Pickup', drives: ['RWD', '4WD'], engines: [E('2.7L 4-cylinder', P, '6-speed automatic'), E('3.5L V6', P, '6-speed automatic')] }],
  ['Toyota', 'tundra', 2007, 2021, { body: 'Pickup', drives: ['RWD', '4WD'], engines: [E('4.0L V6', P, '5-speed automatic', 2007, 2014), E('4.6L V8', P, '6-speed automatic'), E('5.7L V8', P, '6-speed automatic')] }],
  ['Toyota', 'prius', 2004, 2009, { body: 'Hatchback', drives: ['FWD'], seats: 5, engines: [E('1.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'prius', 2010, 2022, { body: 'Hatchback', drives: ['FWD', 'AWD'], seats: 5, engines: [E('1.8L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Toyota', 'matrix', 2009, 2014, { body: 'Hatchback', drives: ['FWD', 'AWD'], seats: 5, engines: [E('1.8L 4-cylinder', P, ''), E('2.4L 4-cylinder', P, '')] }],
  ['Lexus', 'rx', 2004, 2009, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('3.3L V6', P, '5-speed automatic', 2004, 2006), E('3.5L V6', P, '5-speed automatic', 2007, 2009), E('3.3L V6 hybrid', H, 'CVT automatic', 2006, 2009)] }],
  ['Lexus', 'rx', 2010, 2015, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('3.5L V6', P, '6-speed automatic'), E('3.5L V6 hybrid', H, 'CVT automatic')] }],
  ['Lexus', 'rx', 2016, 2022, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('3.5L V6', P, '8-speed automatic'), E('3.5L V6 hybrid', H, 'CVT automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic')] }],
  ['Lexus', 'es', 2007, 2012, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('3.5L V6', P, '6-speed automatic')] }],
  ['Lexus', 'es', 2013, 2018, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('3.5L V6', P, '6-speed automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Lexus', 'es', 2019, 2025, { body: 'Sedan', drives: ['FWD', 'AWD'], seats: 5, engines: [E('3.5L V6', P, '8-speed automatic'), E('2.5L 4-cylinder', P, '8-speed automatic', 2021, 2025), E('2.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Lexus', 'gx', 2003, 2009, { body: 'SUV', drives: ['4WD'], engines: [E('4.7L V8', P, '5-speed automatic')] }],
  ['Lexus', 'gx', 2010, 2023, { body: 'SUV', drives: ['4WD'], engines: [E('4.6L V8', P, '6-speed automatic')] }],
  ['Lexus', 'lx', 2008, 2021, { body: 'SUV', drives: ['4WD'], engines: [E('5.7L V8', P, '')] }],
  ['Lexus', 'is', 2006, 2013, { body: 'Sedan', drives: ['RWD', 'AWD'], seats: 5, engines: [E('2.5L V6', P, '6-speed automatic'), E('3.5L V6', P, '')] }],
  ['Honda', 'accord', 2008, 2012, { drives: ['FWD'], engines: [E('2.4L 4-cylinder', P, ''), E('3.5L V6', P, '')] }],
  ['Honda', 'accord', 2013, 2017, { drives: ['FWD'], engines: [E('2.4L 4-cylinder', P, ''), E('3.5L V6', P, ''), E('2.0L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Honda', 'accord', 2018, 2022, { drives: ['FWD'], seats: 5, engines: [E('1.5L 4-cylinder turbo', P, ''), E('2.0L 4-cylinder turbo', P, ''), E('2.0L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Honda', 'civic', 2006, 2015, { drives: ['FWD'], engines: [E('1.8L 4-cylinder', P, ''), E('2.0L 4-cylinder', P, ''), E('2.4L 4-cylinder', P, ''), E('1.3L 4-cylinder hybrid', H, 'CVT automatic'), E('1.5L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Honda', 'civic', 2016, 2021, { drives: ['FWD'], engines: [E('2.0L 4-cylinder', P, ''), E('1.5L 4-cylinder turbo', P, '')] }],
  ['Honda', 'cr-v', 2007, 2011, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '5-speed automatic')] }],
  ['Honda', 'cr-v', 2012, 2016, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '5-speed automatic', 2012, 2014), E('2.4L 4-cylinder', P, 'CVT automatic', 2015, 2016)] }],
  ['Honda', 'cr-v', 2017, 2022, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, 'CVT automatic'), E('1.5L 4-cylinder turbo', P, 'CVT automatic'), E('2.0L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Honda', 'pilot', 2009, 2015, { body: 'SUV', drives: ['FWD', '4WD'], seats: 8, engines: [E('3.5L V6', P, '5-speed automatic')] }],
  ['Honda', 'pilot', 2016, 2022, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('3.5L V6', P, '')] }],
  ['Honda', 'odyssey', 2011, 2017, { body: 'Minivan', drives: ['FWD'], engines: [E('3.5L V6', P, '')] }],
  ['Honda', 'odyssey', 2018, 2026, { body: 'Minivan', drives: ['FWD'], engines: [E('3.5L V6', P, '')] }],
  ['Hyundai', 'elantra', 2011, 2016, { drives: ['FWD'], engines: [E('1.8L 4-cylinder', P, ''), E('2.0L 4-cylinder', P, '')] }],
  ['Hyundai', 'sonata', 2011, 2014, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic'), E('2.4L 4-cylinder hybrid', H, '6-speed automatic')] }],
  ['Hyundai', 'sonata', 2015, 2019, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, ''), E('1.6L 4-cylinder turbo', P, '7-speed dual-clutch automatic'), E('2.0L 4-cylinder hybrid', H, '6-speed automatic')] }],
  ['Hyundai', 'santa fe', 2013, 2018, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic'), E('3.3L V6', P, '6-speed automatic')] }],
  ['Hyundai', 'tucson', 2016, 2021, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.0L 4-cylinder', P, '6-speed automatic'), E('2.4L 4-cylinder', P, '6-speed automatic'), E('1.6L 4-cylinder turbo', P, '7-speed dual-clutch automatic')] }],
  ['Kia', 'sorento', 2011, 2015, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('3.5L V6', P, '6-speed automatic', 2011, 2013), E('3.3L V6', P, '6-speed automatic', 2014, 2015)] }],
  ['Kia', 'sorento', 2016, 2020, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, ''), E('3.3L V6', P, '')] }],
  ['Kia', 'optima', 2011, 2015, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic'), E('2.4L 4-cylinder hybrid', H, '6-speed automatic')] }],
  ['Kia', 'sportage', 2011, 2016, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.4L 4-cylinder', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic')] }],
  ['Nissan', 'altima', 2013, 2018, { body: 'Sedan', drives: ['FWD'], seats: 5, engines: [E('2.5L 4-cylinder', P, 'CVT automatic'), E('3.5L V6', P, 'CVT automatic')] }],
  ['Nissan', 'rogue', 2014, 2020, { body: 'SUV', drives: ['FWD', 'AWD'], engines: [E('2.5L 4-cylinder', P, 'CVT automatic'), E('2.0L 4-cylinder hybrid', H, 'CVT automatic')] }],
  ['Nissan', 'pathfinder', 2013, 2020, { body: 'SUV', drives: ['FWD', '4WD'], seats: 7, engines: [E('3.5L V6', P, 'CVT automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic', 2014, 2014)] }],
  ['Nissan', 'murano', 2015, 2024, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('3.5L V6', P, 'CVT automatic'), E('2.5L 4-cylinder hybrid', H, 'CVT automatic', 2016, 2017)] }],
  ['Ford', 'explorer', 2011, 2019, { body: 'SUV', drives: ['FWD', '4WD'], seats: 7, engines: [E('3.5L V6', P, '6-speed automatic'), E('2.0L 4-cylinder turbo', P, '6-speed automatic', 2012, 2015), E('2.3L 4-cylinder turbo', P, '6-speed automatic', 2016, 2019), E('3.5L V6 turbo', P, '6-speed automatic', 2013, 2019)] }],
  ['Ford', 'edge', 2015, 2024, { body: 'SUV', drives: ['FWD', 'AWD'], seats: 5, engines: [E('2.0L 4-cylinder turbo', P, ''), E('3.5L V6', P, '6-speed automatic', 2015, 2018), E('2.7L V6 turbo', P, '')] }],
  ['Mercedes-Benz', 'c-class', 2008, 2014, { body: 'Sedan', drives: ['RWD', 'AWD'], seats: 5, engines: [E('3.0L V6', P, '7-speed automatic', 2008, 2011), E('3.5L V6', P, '7-speed automatic'), E('1.8L 4-cylinder turbo', P, '7-speed automatic', 2012, 2014), E('6.2L V8', P, '7-speed automatic')] }],
  ['Mercedes-Benz', 'e-class', 2010, 2016, { drives: ['RWD', 'AWD'], engines: [E('3.5L V6', P, '7-speed automatic'), E('3.0L V6 diesel', D, '7-speed automatic'), E('2.0L 4-cylinder turbo', P, '7-speed automatic', 2014, 2016), E('4.7L V8 turbo', P, '7-speed automatic', 2012, 2016), E('5.5L V8', P, '7-speed automatic', 2010, 2011)] }],
  ['Mercedes-Benz', 'm-class', 2012, 2015, { body: 'SUV', drives: ['RWD', 'AWD'], seats: 5, engines: [E('3.5L V6', P, '7-speed automatic'), E('3.0L V6 diesel', D, '7-speed automatic'), E('4.7L V8 turbo', P, '7-speed automatic')] }],
  ['Mercedes-Benz', 'glk-class', 2010, 2015, { body: 'SUV', drives: ['RWD', 'AWD'], seats: 5, engines: [E('3.5L V6', P, '7-speed automatic'), E('2.1L 4-cylinder diesel', D, '7-speed automatic', 2013, 2015)] }],
  ['Jeep', 'grand cherokee', 2011, 2021, { body: 'SUV', drives: ['RWD', '4WD'], seats: 5, engines: [E('3.6L V6', P, ''), E('5.7L V8', P, ''), E('3.0L V6 diesel', D, '8-speed automatic', 2014, 2019), E('6.4L V8', P, ''), E('6.2L V8 supercharged', P, '8-speed automatic', 2018, 2021)] }]
];

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Land Cruiser Prado" is its own entry; Lexus "RX 350" belongs to "rx"; Mercedes "C 300" to "c-class"
function modelKey(make, model) {
  const m = norm(model);
  if (make === 'Lexus') return (m.match(/^[a-z]{2}/) || [''])[0];
  if (make === 'Mercedes-Benz') { const c = m.match(/^(glk|gle|glc|ml|c|e|m)\b/); if (c) return { glk: 'glk-class', ml: 'm-class', m: 'm-class', c: 'c-class', e: 'e-class' }[c[1]] || ''; return m.replace(/ class$/, '-class'); }
  if (/prado/.test(m)) return 'land cruiser prado';
  if (/^land cruiser/.test(m)) return 'land cruiser';
  if (m === 'cr v' || m === 'crv') return 'cr-v';
  return m;
}
function generation(make, model, year) {
  if (!make || !model || !year) return null;
  const mk = /^lexus$/i.test(make) ? 'Lexus' : /^mercedes/i.test(make) ? 'Mercedes-Benz' : make.replace(/\b\w/g, (c) => c.toUpperCase());
  const key = modelKey(mk, model);
  const g = GEN.find(([a, b, y1, y2]) => a.toLowerCase() === mk.toLowerCase() && b === key && year >= y1 && year <= y2);
  if (!g) return null;
  const f = g[4];
  return { ...f, engines: f.engines.filter((e) => (!e.from || year >= e.from) && (!e.to || year <= e.to)) };
}

// "ASV50L" or "ACV40-0123456" -> the frame code entry. Several codes in one record ("ASV50L/GSV50L/AVV50L")
// give several choices.
function frameCodes(text, make) {
  const tables = make === 'Lexus' ? [FRAME.Lexus] : make === 'Toyota' ? [FRAME.Toyota] : [FRAME.Toyota, FRAME.Lexus];
  const out = [];
  for (const part of String(text || '').toUpperCase().split(/[\s/,]+/)) {
    const m = part.match(/^([A-Z]{2,5})(\d{2,3})/); if (!m) continue;
    // "ZRE142L" -> ZRE142; a chassis number "ACV403012345" -> ACV40 (try 3 digits, then 2)
    const tries = [m[1] + m[2], m[1] + m[2].slice(0, 2)];
    let found = null;
    for (const code of tries) { for (const t of tables) { const hit = t[code]; if (hit) { found = { code, make: t === FRAME.Lexus ? 'Lexus' : 'Toyota', model: hit[0], engine: hit[1], fuel: hit[2], drive: hit[3] }; break; } } if (found) break; }
    if (found && !out.some((x) => x.code === found.code)) out.push(found);
  }
  return out;
}

// Does an engine description from the VIN record ("2.5L 4-cylinder (178 hp)") match a table engine?
const engineSig = (e) => { const t = String(e || '').toLowerCase(); const l = (t.match(/(\d\.\d)l/) || [])[1]; const c = (t.match(/v(\d+)|(\d+)-cylinder|flat-(\d+)/) || []).slice(1).find(Boolean); return l ? `${l}|${c || ''}|${/hybrid/.test(t) ? 'h' : /diesel/.test(t) ? 'd' : ''}` : ''; };
function matchEngine(engines, engine) {
  const sig = engineSig(engine); if (!sig) return [];
  const [l, c, k] = sig.split('|');
  return engines.filter((e) => { const [l2, c2, k2] = engineSig(e.engine).split('|'); return l2 === l && (!c || c2 === c) && k2 === k; });
}

module.exports = { generation, frameCodes, matchEngine, modelKey, FRAME, GEN };
