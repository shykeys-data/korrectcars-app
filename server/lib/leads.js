// Buyer requests for a seller (Nov 2026): who gets the email when a buyer books a viewing, makes an offer or asks
// a question on a dealer's or private seller's car. The owner and managers get it; a lister only for their own car.
const { q, one } = require('../db');
const mail = require('./mail');
const { naira } = require('./price');

async function tellSeller(car, v) {
  const people = await q(`SELECT u.name, u.email, m.role, u.id FROM dealer_members m JOIN users u ON u.id = m.user_id
    WHERE m.dealer_id = ? AND u.disabled = 0`, [car.dealer_id]);
  const added = await one('SELECT created_by FROM cars WHERE id = ?', [car.id]);
  const to = people.filter((p) => p.role !== 'lister' || (added && Number(added.created_by) === Number(p.id)));
  const what = { viewing: 'wants to view', offer: 'made an offer on', contact: 'has a question about' }[v.type] || 'asked about';
  const details = [v.type === 'offer' && v.offerAmount ? `Offer: ${naira(v.offerAmount)}` : '', v.type === 'viewing' && v.preferredDate ? `Preferred day: ${v.preferredDate}` : '',
    v.message ? `Message: ${v.message}` : ''].filter(Boolean);
  for (const p of to) {
    await mail.send({ to: p.email, ...mail.templates.sellerLead(p.name.split(' ')[0], { buyer: v.name, phone: v.phone, email: v.email, what, title: car.title, slug: car.slug, details }) });
  }
}

module.exports = { tellSeller };
