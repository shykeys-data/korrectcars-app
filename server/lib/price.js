// "Call for price" (Nov 2026): a seller may leave the price out. Such a car is saved with price 0, and every page
// shows "Call for price" instead of a figure. Price filters, budget pages, price ranges and Pay Small Small figures
// only use cars that have a price. Shared by the server and the web app (client/src/lib/core.jsx re-exports it).
const hasPrice = (c) => Number(c && c.price) > 0;
const naira = (n) => '\u20a6' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const priceText = (c) => (hasPrice(c) ? naira(c.price) : 'Call for price');
const priced = (cars) => (cars || []).filter(hasPrice);
module.exports = { hasPrice, priceText, priced, CALL_FOR_PRICE: 'Call for price' };
