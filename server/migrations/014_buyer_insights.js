// Buyer insights (27 Nov 2026), counted now so a future AI assistant starts from real demand:
// - search_daily: each filter combination buyers used on the car lists per Lagos day, and how often it found nothing;
// - wa_taps_daily: WhatsApp button taps per car per day and per place on the site (car page, bottom bar, card, quick view).
// Nothing personal is stored: no names, numbers, addresses or IPs. Repeats from one visitor in a day count once.
module.exports = {
  about: 'search_daily (filter combinations and no-result searches) and wa_taps_daily (WhatsApp taps per car)',
  async up({ q, t }) {
    await q(`CREATE TABLE IF NOT EXISTS search_daily (day ${t.S(10)} NOT NULL, query_key ${t.S(200)} NOT NULL,
      searches INT NOT NULL DEFAULT 0, zero INT NOT NULL DEFAULT 0, last_results INT NOT NULL DEFAULT 0,
      PRIMARY KEY (day, query_key))${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS wa_taps_daily (car_id ${t.FK} NOT NULL, day ${t.S(10)} NOT NULL, place ${t.S(10)} NOT NULL,
      taps INT NOT NULL DEFAULT 0, PRIMARY KEY (car_id, day, place))${t.TAIL}`);
  }
};
