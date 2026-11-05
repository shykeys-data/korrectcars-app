// The town buyers search for ("Toyota Camry for sale in Port Harcourt"), from the dealer's State.
// Used in car page titles and descriptions. Shared with the web app.
const CITY = {
  Lagos: 'Lagos', 'Abuja (FCT)': 'Abuja', Rivers: 'Port Harcourt', Oyo: 'Ibadan', Kano: 'Kano', Kaduna: 'Kaduna', Enugu: 'Enugu',
  Edo: 'Benin City', Ogun: 'Abeokuta', Delta: 'Asaba', Anambra: 'Awka', Imo: 'Owerri', Abia: 'Umuahia', Kwara: 'Ilorin', Plateau: 'Jos',
  'Akwa Ibom': 'Uyo', 'Cross River': 'Calabar', Ondo: 'Akure', Osun: 'Osogbo', Ekiti: 'Ado-Ekiti', Benue: 'Makurdi', Niger: 'Minna',
  Borno: 'Maiduguri', Bauchi: 'Bauchi', Sokoto: 'Sokoto', Katsina: 'Katsina', Bayelsa: 'Yenagoa', Nasarawa: 'Lafia', Kogi: 'Lokoja'
};
const placeOf = (car) => (car && car.state ? CITY[car.state] || `${car.state} State` : 'Lagos');
module.exports = { placeOf, CITY };
