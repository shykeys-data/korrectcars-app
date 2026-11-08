// Page copy shared by the server (the HTML Google, AI assistants and AdSense read) and the React pages,
// so both always show the same words. Plain CommonJS with no Node-only code, like categories.js.
// Each page: h1, lead, then sections. A section has h2 and any of: p (paragraphs), steps (numbered),
// list (bullets), faq ([question, answer] pairs). Keep facts true: change them here when the business changes.
//
// Rules for this file: no invented numbers or claims; Swap is owner to owner (Korrect Cars is the middleman);
// Pay Small Small goes through credit partners; we deliver anywhere in Nigeria; there is no walk-in showroom.

const GUIDES = {
  h1: 'Car buying guides for Nigeria',
  lead: 'Straight answers from the team that inspects and sells tokunbo and foreign-used cars in Lagos. Learn how to check a VIN, what customs duty adds to a price, which cars cope with Lagos traffic and how Pay Small Small works, before you spend a naira.',
  sections: [
    { h2: 'Written from the cars we handle', p: ['Every guide comes from questions our customers ask on WhatsApp and from what we see when we inspect cars. We update a guide when prices or rules change, and the date at the top shows when it was last checked.'] }
  ]
};

const CONTACT = {
  h1: 'Talk to Korrect Cars',
  lead: 'WhatsApp is the fastest way to reach us. Send the car you like, or tell us your budget, and the team replies during opening hours.',
  sections: [
    { h2: 'Where we are', p: ['Korrect Cars is an online car dealer based in Lagos. We do not run a showroom. Our cars wait at partner car lots in Lagos, and we send you the exact address when you book a viewing. No showroom rent keeps our prices down.'] },
    { h2: 'What happens when you get in touch', steps: [
      ['Tell us the car or your budget', 'Send a link to a car on the site, or the make, model and price range you want.'],
      ['Get the details', 'We send more photos, the car\'s details and answer your questions.'],
      ['View and test-drive', 'Book a viewing at a partner car lot. Inspect the car, test-drive it and bring your own mechanic if you like.'],
      ['Pay safely', 'Pay only into the Korrect Cars company account, never a personal account.'],
      ['Drive it home', 'Drive away, or we deliver it anywhere in Nigeria at a cost we confirm before you pay.']
    ] },
    { h2: 'Not in Lagos?', p: ['We deliver to every state in Nigeria. Tell us your city on WhatsApp and we will give you the delivery cost and timing before you commit.'] },
    { h2: 'Stay safe', p: ['Korrect Cars will never ask you to pay into a personal account. If anyone does, stop and call us on the numbers on this page.'] }
  ]
};

const SWAP = {
  h1: 'Swap your car with a verified owner',
  lead: 'Korrect Swap lets car owners swap with each other, with one side adding cash when the values differ. Korrect Cars is the trusted middleman: we check every owner and every set of papers, and both cars are inspected before anything changes hands.',
  sections: [
    { h2: 'How Korrect Swap works', steps: [
      ['List your car', 'Add photos, upload the papers and say what you want in return: a make and model, or a budget.'],
      ['We check you and your papers', 'Your phone and ID are verified, and your papers are checked against the car\'s VIN before the listing goes live.'],
      ['Find a match', 'Browse other owners\' cars or wait for offers. Agree any cash difference in the chat. Phone numbers stay hidden until you both accept.'],
      ['Inspect both cars', 'Both cars are inspected at a partner car lot in Lagos, with Korrect Cars present, before keys, papers or money change hands.'],
      ['Swap', 'Papers are exchanged and the swap fee is paid only when the swap completes.']
    ] },
    { h2: 'What we check on both cars', list: [
      'The VIN on the car matches the papers',
      'Engine and gearbox: starting, idle, noises and leaks, plus a test drive',
      'Body and paint: signs of accident repairs, flood damage or rust',
      'Electrics and air conditioning',
      'Tyres and brakes',
      'The mileage reading against the car\'s overall condition'
    ] },
    { h2: 'Papers to have ready', list: [
      'A valid photo ID',
      'Vehicle licence',
      'Proof of ownership or your purchase receipt',
      'Customs papers, if the car was imported',
      'Roadworthiness certificate and insurance'
    ] },
    { h2: 'Swap safely', list: [
      'Never send money before both cars are inspected',
      'Meet only at the partner car lot we arrange',
      'Keep the conversation in the Korrect Swap chat until you both accept an offer',
      'Report any message that asks you to pay early or meet somewhere else',
      'Korrect Cars never asks you to pay into a personal account'
    ] }
  ]
};

const VIN = {
  h1: 'Free VIN check',
  lead: 'Type any car\'s 17-character VIN to see its make, model year and where it was built. Cars made for the US and Canadian market, which is most tokunbo cars in Nigeria, also show the model, trim, engine, gearbox and safety equipment. Japanese chassis numbers are recognised too. Free, no sign-up.',
  sections: [
    { h2: 'Where to find the VIN', list: [
      'At the bottom of the windscreen on the driver\'s side, readable from outside',
      'On the sticker inside the driver\'s door frame',
      'On the car\'s papers: customs papers, vehicle licence and insurance certificate'
    ] },
    { h2: 'What this check shows', p: ['How the car left the factory: year, make, model, trim, body, engine, fuel, drive and the country it was built in. The details come from the US government\'s NHTSA database, which covers most cars built for the US market, and that includes most tokunbo cars in Nigeria.'] },
    { h2: 'What it does not show', p: ['Accidents, flood damage, auction records or past mileage. Those need a paid history report. Every car Korrect Cars sells is inspected and its VIN history checked before we list it.'] },
    { h2: 'Questions', faq: [
      ['Is the VIN check free?', 'Yes. It is free and you do not need an account.'],
      ['Why does my VIN show no details?', 'Cars built for Europe, Asia or the Middle East are often missing from the US database. Check the VIN for typos first: it never uses the letters I, O or Q.'],
      ['Does a VIN check prove a car is genuine?', 'No. It tells you what the car should be. Make sure the VIN on the car matches its papers, and buy from a seller who can show proof of ownership.'],
      ['Can Korrect Cars check a car\'s history for me?', 'Send us the VIN on WhatsApp. If the car is one of ours, its history was checked before we listed it.']
    ] }
  ]
};

const MARKET = {
  h1: 'Nigeria car market today',
  lead: 'The figures that move car prices in Nigeria, kept up to date by the Korrect Cars team. Each figure shows its source and the date we checked it.'
};


// How sellers are checked (Nov 2026). Keep every line true to what the site does (server/routes/dealer.js, admin-*.js).
const SELLERS = {
  h1: 'How Korrect Cars checks car sellers',
  lead: 'Cars on Korrect Cars come from three kinds of seller, and every listing shows which one: a Verified Dealer (a car business whose CAC registration our team has checked), a Verified Seller (a person selling their own car whose ID our team has checked) or a Private Seller (a person selling their own car whom we have not checked). Each car can be listed only once, by its VIN.',
  sections: [
    { h2: 'The three badges', list: [
      '✓ Verified Dealer: a registered car business. Our team checks the CAC certificate and looks the RC or BN number up on the CAC public search before any of its cars go live.',
      '✓ Verified Seller: a person selling their own car. Our team has checked a government ID (NIN slip, driver\'s licence, international passport or voter\'s card) and a selfie holding it. They can list up to 5 cars.',
      'Private Seller · not verified: a person selling their own car whom Korrect Cars has not checked. They can list 1 car, and our team looks at that car before it goes live. The car page tells buyers plainly that the seller is not verified.'
    ] },
    { h2: 'What every seller goes through', steps: [
      ['Email code', 'Every seller proves their email with a 6-digit code before an account exists. Temporary email addresses are refused.'],
      ['Checks by our team', 'Dealers send their CAC certificate; sellers who want the Verified badge send an ID and a selfie. Our team decides; papers are kept private and deleted 12 months after the decision.'],
      ['One VIN, one listing', 'A car can be listed once. If a VIN is already live on the site, nobody else can list it, so the same car never appears twice.'],
      ['Report this listing', 'Every car page has a "Report this listing" link. Our team reads each report and can take a car off the site straight away.']
    ] },
    { h2: 'Buyer questions', faq: [
      ['How do I know a car dealer in Nigeria is real?', 'Ask for the business\'s RC or BN number and look it up on the CAC public search (search.cac.gov.ng): the name and status should match. On Korrect Cars, every dealer with the ✓ Verified Dealer badge has had this check done by our team.'],
      ['Is a Private Seller on Korrect Cars safe to buy from?', 'We have not checked who a Private Seller is. See the car in person, check its papers and make sure the name on them matches the seller before you pay anything, and never pay a deposit to hold a car you have not seen. You can choose to see only verified dealers and sellers on the cars page.'],
      ['Who do I pay when I buy a car on Korrect Cars?', 'You pay the seller shown on the car page. For a dealer, pay only into the business\'s own account; for a person, into an account in their own name, and only after you have seen the car and its papers. For cars Korrect Cars sells itself, pay only into the Korrect Cars company account.'],
      ['Can the same car be listed twice?', 'No. Each car is listed by its VIN, and a VIN can have only one live listing on Korrect Cars.']
    ] }
  ]
};

// Added to the privacy policy while the marketplace is on (Nov 2026). Keep it true to what the code does.
const PRIVACY_MARKETPLACE = {
  h1: 'Sellers, buyer requests and cookies',
  lead: 'This part of our privacy policy covers selling on Korrect Cars, requests buyers send to sellers, and the cookies we use.',
  sections: [
    { h2: 'If you sell on Korrect Cars', list: [
      'We keep your name, email, phone and WhatsApp numbers, and where your cars are (state and LGA). Your name, WhatsApp, phone and area are shown to buyers on your cars and your seller page.',
      'Dealers send a CAC certificate; sellers who want the Verified badge send a photo of an ID and a selfie. These papers are kept in a private folder that only Korrect Cars staff can open; every time staff open one it is logged. We delete them 12 months after our decision.',
      'When you sign in on a new device or from outside Nigeria, or after several wrong passwords, we email you a one-time code. We then remember that browser for 90 days with a cookie (kc_td) that holds a random token; we store only a scrambled version of it.',
      'If you invite people to your team, we email them a link that works once, for 72 hours.'
    ] },
    { h2: 'If you send a request about a car', list: [
      'When you book a viewing, make an offer or ask a question about a car sold by a dealer or another seller, your name, phone, email (if you give it) and message go to that seller, and Korrect Cars keeps a copy so we can help if they do not reply.',
      'Pay Small Small requests go only to Korrect Cars; with your consent we pass them to our credit partners.',
      'If you report a listing, only Korrect Cars staff see your report; the seller does not.'
    ] },
    { h2: 'Cookies', list: [
      'Sign-in cookies (kc_session, and kc_td for sellers) are needed for the site to work and are always on.',
      'Google Analytics (counting visits) and Google AdSense (ads) use cookies only if you accept them on the cookie bar. If you decline, analytics cookies stay off and ads are not personalised. You can change your choice any time with "Cookie choices" at the bottom of every page.'
    ] }
  ]
};

module.exports = { GUIDES, CONTACT, SWAP, VIN, MARKET, SELLERS, PRIVACY_MARKETPLACE };
