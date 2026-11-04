// VIN and chassis-number rules, shared by the server and the dealer portal (plain CommonJS, no Node-only code,
// so the React build imports this same file and the browser and server can never disagree).
//
//   check('4t1b11hk7ju512345') -> { type: 'vin17', value: '4T1B11HK7JU512345', problems: [], warnings: [] }
//
// A 17-character VIN follows ISO 3779: never I, O or Q; the 10th character (model year) is never U, Z or 0.
// The 9th character is a check digit, required on North American (starting 1-5) and Chinese (starting L) VINs.
// European makers don't use it, so a wrong one there is only a warning. Japanese home-market cars carry a shorter
// chassis (frame) number such as JZX100-1234567: a model code and a serial, 8 to 14 characters.
// A valid check digit is not proof a VIN is real: the VIN plate photo and staff review matter more.

const clean = (raw) => String(raw == null ? '' : raw).toUpperCase().replace(/[\s.\-_/]/g, '');

const T = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function checkDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) { const ch = vin.charAt(i); sum += (/[0-9]/.test(ch) ? Number(ch) : T[ch]) * W[i]; }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

function check(raw) {
  const value = clean(raw);
  const problems = []; const warnings = [];
  if (!value) return { type: null, value, problems: ['Enter the VIN or chassis number.'], warnings };
  if (!/^[A-Z0-9]+$/.test(value)) return { type: null, value, problems: ['Use letters and numbers only.'], warnings };
  if (value.length === 17) {
    if (/[IOQ]/.test(value)) problems.push('A VIN never contains the letters I, O or Q. Check for 1 (one) and 0 (zero).');
    else if (/[UZ0]/.test(value.charAt(9))) problems.push('The 10th character (the model year) can\'t be U, Z or 0.');
    else if (checkDigit(value) !== value.charAt(8)) {
      if (/^[1-5L]/.test(value)) problems.push('The check digit (9th character) doesn\'t match. One character is probably wrong.');
      else warnings.push('The 9th character is not a standard check digit. That is normal for many European cars; please check the VIN once more.');
    }
    return { type: 'vin17', value, problems, warnings, wmi: value.slice(0, 3) };
  }
  if (value.length >= 8 && value.length <= 14 && /[A-Z]/.test(value) && /[0-9]{4,}$/.test(value)) {
    warnings.push('This looks like a chassis (frame) number, used on Japanese home-market cars. Check it against the plate.');
    return { type: 'chassis', value, problems, warnings, wmi: null };
  }
  problems.push(value.length < 17 ? `A VIN has 17 characters. This one has ${value.length}.` : `A VIN has 17 characters. This one has ${value.length}.`);
  return { type: null, value, problems, warnings };
}

// Statuses that hold a VIN: only one car per VIN may be in one of these at a time
const LIVE_STATUSES = ['pending', 'available', 'reserved'];

module.exports = { clean, check, checkDigit, LIVE_STATUSES };
