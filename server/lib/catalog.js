// Make -> model -> body types used for "List my car" and swap wishes.
// When a model has a single body type the UI selects it automatically.
const C = {
  'Acura': { 'MDX': ['SUV'], 'RDX': ['SUV'], 'TL': ['Sedan'], 'TLX': ['Sedan'], 'ZDX': ['SUV'] },
  'Audi': { 'A4': ['Sedan'], 'A6': ['Sedan'], 'Q5': ['SUV'], 'Q7': ['SUV'] },
  'BMW': { '3 Series': ['Sedan'], '5 Series': ['Sedan'], 'X3': ['SUV'], 'X5': ['SUV'], 'X6': ['SUV Coupe'] },
  'Ford': { 'Edge': ['SUV'], 'Escape': ['SUV'], 'Explorer': ['SUV'], 'F-150': ['Pickup'], 'Fusion': ['Sedan'], 'Ranger': ['Pickup'] },
  'Honda': { 'Accord': ['Sedan', 'Coupe'], 'Civic': ['Sedan', 'Hatchback', 'Coupe'], 'CR-V': ['SUV'], 'Crosstour': ['Hatchback'], 'Odyssey': ['Minivan'], 'Pilot': ['SUV'] },
  'Hyundai': { 'Elantra': ['Sedan'], 'Santa Fe': ['SUV'], 'Sonata': ['Sedan'], 'Tucson': ['SUV'] },
  'Infiniti': { 'FX35': ['SUV'], 'JX35': ['SUV'], 'QX60': ['SUV'] },
  'Kia': { 'Optima': ['Sedan'], 'Rio': ['Sedan', 'Hatchback'], 'Sorento': ['SUV'], 'Sportage': ['SUV'] },
  'Land Rover': { 'Range Rover': ['SUV'], 'Range Rover Evoque': ['SUV'], 'Range Rover Sport': ['SUV'] },
  'Lexus': { 'ES 350': ['Sedan'], 'GX 460': ['SUV'], 'IS 250': ['Sedan'], 'LX 570': ['SUV'], 'NX 200t': ['SUV'], 'RX 350': ['SUV'] },
  'Mercedes-Benz': { 'C 300': ['Sedan', 'Coupe'], 'E 350': ['Sedan', 'Coupe'], 'G 63': ['SUV'], 'GL 450': ['SUV'], 'GLE 350': ['SUV', 'SUV Coupe'], 'GLE 63 S': ['SUV', 'SUV Coupe'], 'GLK 350': ['SUV'], 'ML 350': ['SUV'] },
  'Mitsubishi': { 'Outlander': ['SUV'], 'Pajero': ['SUV'] },
  'Nissan': { 'Altima': ['Sedan', 'Coupe'], 'Murano': ['SUV'], 'Pathfinder': ['SUV'], 'Rogue': ['SUV'], 'Sentra': ['Sedan'] },
  'Peugeot': { '3008': ['SUV'], '406': ['Sedan'], '407': ['Sedan'] },
  'Toyota': { '4Runner': ['SUV'], 'Avalon': ['Sedan'], 'Camry': ['Sedan'], 'Corolla': ['Sedan'], 'Highlander': ['SUV'], 'Hilux': ['Pickup'], 'Land Cruiser': ['SUV'], 'Prado': ['SUV'], 'RAV4': ['SUV'], 'Sienna': ['Minivan'], 'Tacoma': ['Pickup'], 'Venza': ['SUV'] },
  'Volkswagen': { 'Golf': ['Hatchback'], 'Passat': ['Sedan'], 'Tiguan': ['SUV'], 'Touareg': ['SUV'] }
};
module.exports = C;
