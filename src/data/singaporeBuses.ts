import { BusRoute, BusStop, UserLocation } from '../types/bus';

// Haversine distance calculator in meters
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Preset locations across Singapore for commuters & location switcher
export const SINGAPORE_LOCATIONS: UserLocation[] = [
  {
    name: 'Orchard Rd (Mandarin Gallery / 313@Somerset)',
    lat: 1.3018,
    lng: 103.8362,
    isSimulated: true,
  },
  {
    name: 'Raffles Place (CBD / Republic Plaza)',
    lat: 1.2842,
    lng: 103.8514,
    isSimulated: true,
  },
  {
    name: 'Bugis Junction (Victoria St)',
    lat: 1.3005,
    lng: 103.8560,
    isSimulated: true,
  },
  {
    name: 'Clementi Interchange & Mall',
    lat: 1.3152,
    lng: 103.7650,
    isSimulated: true,
  },
  {
    name: 'Tampines Central Interchange',
    lat: 1.3533,
    lng: 103.9450,
    isSimulated: true,
  },
  {
    name: 'Jurong East Interchange (Jem / Westgate)',
    lat: 1.3332,
    lng: 103.7422,
    isSimulated: true,
  },
  {
    name: 'Chinatown Point (New Bridge Rd)',
    lat: 1.2852,
    lng: 103.8445,
    isSimulated: true,
  },
  {
    name: 'Bedok Interchange & Mall',
    lat: 1.3242,
    lng: 103.9302,
    isSimulated: true,
  },
  {
    name: 'Dhoby Ghaut (Plaza Singapura)',
    lat: 1.2995,
    lng: 103.8452,
    isSimulated: true,
  },
  {
    name: 'HarbourFront / VivoCity',
    lat: 1.2650,
    lng: 103.8225,
    isSimulated: true,
  },
  {
    name: 'Hougang Central Bus Interchange',
    lat: 1.3712,
    lng: 103.8925,
    isSimulated: true,
  },
  {
    name: 'Woodlands Integrated Transport Hub',
    lat: 1.4365,
    lng: 103.7865,
    isSimulated: true,
  },
];

// Rich Curated Singapore Routes with authentic SBS Transit routes
export const POPULAR_ROUTES: Record<string, BusRoute> = {
  '14': {
    serviceNo: '14',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Bedok Bus Interchange',
      destination: 'Clementi Bus Interchange',
      stops: [
        { code: '84009', name: 'Bedok Interchange', road: 'Bedok Nth Ave 1', lat: 1.3242, lng: 103.9302, sheltered: true },
        { code: '84039', name: 'Blk 220 CP', road: 'Bedok Nth Ave 1', lat: 1.3255, lng: 103.9268, sheltered: true },
        { code: '83109', name: 'Opp Opera Est Pr Sch', road: 'New Upper Changi Rd', lat: 1.3195, lng: 103.9180, sheltered: true },
        { code: '83119', name: 'Kembangan Stn', road: 'Sims Ave East', lat: 1.3212, lng: 103.9125, sheltered: true },
        { code: '82049', name: 'Eunos Stn', road: 'Sims Ave', lat: 1.3198, lng: 103.9030, sheltered: true },
        { code: '82029', name: 'Aft Tanjong Katong Cplx', road: 'Sims Ave', lat: 1.3175, lng: 103.8930, sheltered: true },
        { code: '80059', name: 'Kallang Stn', road: 'Sims Ave', lat: 1.3115, lng: 103.8710, sheltered: true },
        { code: '80019', name: 'Bef Lor 1 Geylang', road: 'Sims Ave', lat: 1.3090, lng: 103.8640, sheltered: false },
        { code: '01112', name: 'Bugis Stn Exit D', road: 'Victoria St', lat: 1.3012, lng: 103.8565, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '08138', name: 'Concorde Hotel S\'pore', road: 'Orchard Rd', lat: 1.3010, lng: 103.8405, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '09047', name: 'Royal Thai Embassy', road: 'Orchard Rd', lat: 1.3045, lng: 103.8315, sheltered: true },
        { code: '09179', name: 'Delfi Orchard', road: 'Orchard Rd', lat: 1.3065, lng: 103.8278, sheltered: true },
        { code: '11199', name: 'Grange Residences', road: 'Grange Rd', lat: 1.3020, lng: 103.8210, sheltered: false },
        { code: '10141', name: 'Crescent Girls\' Sch', road: 'Tanglin Rd', lat: 1.2950, lng: 103.8150, sheltered: true },
        { code: '11019', name: 'Queenstown Stn Exit A', road: 'Commonwealth Ave', lat: 1.2945, lng: 103.8055, sheltered: true },
        { code: '11119', name: 'Commonwealth Stn', road: 'Commonwealth Ave', lat: 1.3025, lng: 103.7980, sheltered: true },
        { code: '19059', name: 'Buona Vista Stn Exit C', road: 'Commonwealth Ave', lat: 1.3068, lng: 103.7905, sheltered: true },
        { code: '19099', name: 'Dover Stn Exit A', road: 'Commonwealth Ave West', lat: 1.3112, lng: 103.7785, sheltered: true },
        { code: '17179', name: 'Clementi Interchange', road: 'Clementi Ave 3', lat: 1.3152, lng: 103.7650, sheltered: true },
      ],
      path: [
        [1.3242, 103.9302], [1.3255, 103.9268], [1.3195, 103.9180], [1.3212, 103.9125],
        [1.3198, 103.9030], [1.3175, 103.8930], [1.3115, 103.8710], [1.3090, 103.8640],
        [1.3012, 103.8565], [1.2995, 103.8452], [1.3010, 103.8405], [1.3022, 103.8360],
        [1.3045, 103.8315], [1.3065, 103.8278], [1.3020, 103.8210], [1.2950, 103.8150],
        [1.2945, 103.8055], [1.3025, 103.7980], [1.3068, 103.7905], [1.3112, 103.7785],
        [1.3152, 103.7650]
      ]
    },
    direction2: {
      origin: 'Clementi Bus Interchange',
      destination: 'Bedok Bus Interchange',
      stops: [
        { code: '17179', name: 'Clementi Interchange', road: 'Clementi Ave 3', lat: 1.3152, lng: 103.7650, sheltered: true },
        { code: '19091', name: 'Dover Stn Exit B', road: 'Commonwealth Ave West', lat: 1.3115, lng: 103.7782, sheltered: true },
        { code: '19051', name: 'Buona Vista Stn Exit D', road: 'Commonwealth Ave', lat: 1.3070, lng: 103.7902, sheltered: true },
        { code: '11111', name: 'Opp Commonwealth Stn', road: 'Commonwealth Ave', lat: 1.3022, lng: 103.7982, sheltered: true },
        { code: '11011', name: 'Opp Queenstown Stn', road: 'Commonwealth Ave', lat: 1.2942, lng: 103.8058, sheltered: true },
        { code: '09011', name: 'Lucky Plaza / Opp Ngee Ann City', road: 'Orchard Rd', lat: 1.3038, lng: 103.8340, sheltered: true },
        { code: '09022', name: 'Midpoint Orchard', road: 'Orchard Rd', lat: 1.3015, lng: 103.8385, sheltered: true },
        { code: '08031', name: 'Dhoby Ghaut Stn Exit B', road: 'Orchard Rd', lat: 1.2991, lng: 103.8455, sheltered: true },
        { code: '01012', name: 'Bugis Junction', road: 'Victoria St', lat: 1.3005, lng: 103.8560, sheltered: true },
        { code: '80011', name: 'Opp Kallang Stn', road: 'Sims Ave', lat: 1.3112, lng: 103.8715, sheltered: true },
        { code: '82041', name: 'Opp Eunos Stn', road: 'Sims Ave', lat: 1.3195, lng: 103.9035, sheltered: true },
        { code: '84009', name: 'Bedok Interchange', road: 'Bedok Nth Ave 1', lat: 1.3242, lng: 103.9302, sheltered: true },
      ],
      path: [
        [1.3152, 103.7650], [1.3115, 103.7782], [1.3070, 103.7902], [1.3022, 103.7982],
        [1.2942, 103.8058], [1.3038, 103.8340], [1.3015, 103.8385], [1.2991, 103.8455],
        [1.3005, 103.8560], [1.3112, 103.8715], [1.3195, 103.9035], [1.3242, 103.9302]
      ]
    }
  },

  '65': {
    serviceNo: '65',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Tampines Bus Interchange',
      destination: 'HarbourFront Bus Interchange',
      stops: [
        { code: '75009', name: 'Tampines Interchange', road: 'Tampines Ctrl 1', lat: 1.3533, lng: 103.9450, sheltered: true },
        { code: '75141', name: 'Tampines Stadium', road: 'Tampines Ave 4', lat: 1.3512, lng: 103.9390, sheltered: true },
        { code: '75209', name: 'Temasek Poly', road: 'Tampines Ave 1', lat: 1.3458, lng: 103.9310, sheltered: true },
        { code: '71099', name: 'Bedok Reservoir Stn', road: 'Bedok Reservoir Rd', lat: 1.3365, lng: 103.9180, sheltered: true },
        { code: '70281', name: 'Blk 637', road: 'Bedok Reservoir Rd', lat: 1.3330, lng: 103.9050, sheltered: false },
        { code: '70251', name: 'MacPherson Stn Exit C', road: 'Circuit Rd', lat: 1.3262, lng: 103.8898, sheltered: true },
        { code: '60111', name: 'Potong Pasir Stn Exit B', road: 'Upper Serangoon Rd', lat: 1.3312, lng: 103.8685, sheltered: true },
        { code: '60011', name: 'Boon Keng Stn', road: 'Serangoon Rd', lat: 1.3198, lng: 103.8618, sheltered: true },
        { code: '07221', name: 'Tekka Ctr (Little India)', road: 'Serangoon Rd', lat: 1.3065, lng: 103.8510, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '09048', name: 'Orchard Stn / Lucky Plaza', road: 'Orchard Rd', lat: 1.3040, lng: 103.8328, sheltered: true },
        { code: '10169', name: 'Paterson Lodge', road: 'Paterson Hill', lat: 1.3005, lng: 103.8290, sheltered: false },
        { code: '10319', name: 'Opp Great World City', road: 'Kim Seng Rd', lat: 1.2932, lng: 103.8315, sheltered: true },
        { code: '10359', name: 'Opp Tiong Bahru Plaza', road: 'Tiong Bahru Rd', lat: 1.2865, lng: 103.8270, sheltered: true },
        { code: '14109', name: 'Opp Radin Mas Community Club', road: 'Lower Delta Rd', lat: 1.2785, lng: 103.8235, sheltered: false },
        { code: '14119', name: 'HarbourFront Stn / VivoCity', road: 'Telok Blangah Rd', lat: 1.2655, lng: 103.8220, sheltered: true },
        { code: '14009', name: 'HarbourFront Interchange', road: 'Seah Im Rd', lat: 1.2648, lng: 103.8212, sheltered: true },
      ],
      path: [
        [1.3533, 103.9450], [1.3512, 103.9390], [1.3458, 103.9310], [1.3365, 103.9180],
        [1.3330, 103.9050], [1.3262, 103.8898], [1.3312, 103.8685], [1.3198, 103.8618],
        [1.3065, 103.8510], [1.2995, 103.8452], [1.3022, 103.8360], [1.3040, 103.8328],
        [1.3005, 103.8290], [1.2932, 103.8315], [1.2865, 103.8270], [1.2785, 103.8235],
        [1.2655, 103.8220], [1.2648, 103.8212]
      ]
    },
    direction2: {
      origin: 'HarbourFront Bus Interchange',
      destination: 'Tampines Bus Interchange',
      stops: [
        { code: '14009', name: 'HarbourFront Interchange', road: 'Seah Im Rd', lat: 1.2648, lng: 103.8212, sheltered: true },
        { code: '14111', name: 'VivoCity', road: 'Telok Blangah Rd', lat: 1.2658, lng: 103.8225, sheltered: true },
        { code: '10351', name: 'Tiong Bahru Plaza', road: 'Tiong Bahru Rd', lat: 1.2868, lng: 103.8272, sheltered: true },
        { code: '10311', name: 'Great World City', road: 'Kim Seng Rd', lat: 1.2935, lng: 103.8318, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '07221', name: 'Tekka Ctr (Little India)', road: 'Serangoon Rd', lat: 1.3065, lng: 103.8510, sheltered: true },
        { code: '60111', name: 'Potong Pasir Stn Exit B', road: 'Upper Serangoon Rd', lat: 1.3312, lng: 103.8685, sheltered: true },
        { code: '75009', name: 'Tampines Interchange', road: 'Tampines Ctrl 1', lat: 1.3533, lng: 103.9450, sheltered: true },
      ],
      path: [
        [1.2648, 103.8212], [1.2658, 103.8225], [1.2868, 103.8272], [1.2935, 103.8318],
        [1.3022, 103.8360], [1.2995, 103.8452], [1.3065, 103.8510], [1.3312, 103.8685],
        [1.3533, 103.9450]
      ]
    }
  },

  '147': {
    serviceNo: '147',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Hougang Central Interchange',
      destination: 'Clementi Bus Interchange',
      stops: [
        { code: '64009', name: 'Hougang Central Int', road: 'Hougang Ctrl', lat: 1.3712, lng: 103.8925, sheltered: true },
        { code: '64109', name: 'Hougang Stn Exit B', road: 'Upper Serangoon Rd', lat: 1.3695, lng: 103.8890, sheltered: true },
        { code: '63029', name: 'Kovan Stn Exit C', road: 'Upper Serangoon Rd', lat: 1.3602, lng: 103.8850, sheltered: true },
        { code: '66189', name: 'Serangoon Stn Exit B', road: 'Upper Serangoon Rd', lat: 1.3498, lng: 103.8732, sheltered: true },
        { code: '60111', name: 'Potong Pasir Stn', road: 'Upper Serangoon Rd', lat: 1.3312, lng: 103.8685, sheltered: true },
        { code: '07221', name: 'Tekka Ctr (Little India)', road: 'Serangoon Rd', lat: 1.3065, lng: 103.8510, sheltered: true },
        { code: '04121', name: 'Opp The Treasury (City Hall)', road: 'North Bridge Rd', lat: 1.2915, lng: 103.8505, sheltered: true },
        { code: '05019', name: 'Opp Hong Lim Cplx (Chinatown)', road: 'New Bridge Rd', lat: 1.2858, lng: 103.8448, sheltered: true },
        { code: '05059', name: 'Chinatown Stn Exit E', road: 'New Bridge Rd', lat: 1.2835, lng: 103.8435, sheltered: true },
        { code: '10041', name: 'Outram Park Stn Exit 7', road: 'Outram Rd', lat: 1.2805, lng: 103.8385, sheltered: true },
        { code: '10359', name: 'Opp Tiong Bahru Plaza', road: 'Tiong Bahru Rd', lat: 1.2865, lng: 103.8270, sheltered: true },
        { code: '11019', name: 'Queenstown Stn Exit A', road: 'Commonwealth Ave', lat: 1.2945, lng: 103.8055, sheltered: true },
        { code: '11119', name: 'Commonwealth Stn', road: 'Commonwealth Ave', lat: 1.3025, lng: 103.7980, sheltered: true },
        { code: '19059', name: 'Buona Vista Stn Exit C', road: 'Commonwealth Ave', lat: 1.3068, lng: 103.7905, sheltered: true },
        { code: '19099', name: 'Dover Stn Exit A', road: 'Commonwealth Ave West', lat: 1.3112, lng: 103.7785, sheltered: true },
        { code: '17179', name: 'Clementi Interchange', road: 'Clementi Ave 3', lat: 1.3152, lng: 103.7650, sheltered: true },
      ],
      path: [
        [1.3712, 103.8925], [1.3695, 103.8890], [1.3602, 103.8850], [1.3498, 103.8732],
        [1.3312, 103.8685], [1.3065, 103.8510], [1.2915, 103.8505], [1.2858, 103.8448],
        [1.2835, 103.8435], [1.2805, 103.8385], [1.2865, 103.8270], [1.2945, 103.8055],
        [1.3025, 103.7980], [1.3068, 103.7905], [1.3112, 103.7785], [1.3152, 103.7650]
      ]
    }
  },

  '190': {
    serviceNo: '190',
    operator: 'SMRT',
    category: 'Trunk',
    direction1: {
      origin: 'Choa Chu Kang Bus Interchange',
      destination: 'Kampong Bahru Bus Terminal',
      stops: [
        { code: '44009', name: 'Choa Chu Kang Int', road: 'Choa Chu Kang Loop', lat: 1.3852, lng: 103.7445, sheltered: true },
        { code: '44539', name: 'Blk 210', road: 'Choa Chu Kang Ave 1', lat: 1.3780, lng: 103.7485, sheltered: false },
        { code: '43149', name: 'Bukit Panjang Stn Exit A', road: 'Woodlands Rd', lat: 1.3785, lng: 103.7615, sheltered: true },
        { code: '42019', name: 'Opp The Rail Mall', road: 'Upper Bukit Timah Rd', lat: 1.3585, lng: 103.7690, sheltered: true },
        { code: '42089', name: 'Beauty World Stn', road: 'Upper Bukit Timah Rd', lat: 1.3415, lng: 103.7760, sheltered: true },
        { code: '41019', name: 'King Albert Park Stn', road: 'Bukit Timah Rd', lat: 1.3360, lng: 103.7830, sheltered: true },
        { code: '40059', name: 'Sixth Avenue Stn', road: 'Bukit Timah Rd', lat: 1.3308, lng: 103.7965, sheltered: true },
        { code: '40119', name: 'Tan Kah Kee Stn', road: 'Bukit Timah Rd', lat: 1.3255, lng: 103.8075, sheltered: true },
        { code: '41149', name: 'Botanic Gardens Stn', road: 'Bukit Timah Rd', lat: 1.3225, lng: 103.8155, sheltered: true },
        { code: '09179', name: 'Delfi Orchard', road: 'Orchard Rd', lat: 1.3065, lng: 103.8278, sheltered: true },
        { code: '09047', name: 'Royal Thai Embassy', road: 'Orchard Rd', lat: 1.3045, lng: 103.8315, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '08138', name: 'Concorde Hotel', road: 'Orchard Rd', lat: 1.3010, lng: 103.8405, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '04121', name: 'Opp The Treasury', road: 'North Bridge Rd', lat: 1.2915, lng: 103.8505, sheltered: true },
        { code: '04229', name: 'Clarke Quay Stn Exit E', road: 'Eu Tong Sen St', lat: 1.2885, lng: 103.8470, sheltered: true },
        { code: '05013', name: 'Chinatown Point', road: 'New Bridge Rd', lat: 1.2852, lng: 103.8445, sheltered: true },
        { code: '10049', name: 'Kampong Bahru Terminal', road: 'Spooner Rd', lat: 1.2755, lng: 103.8335, sheltered: true },
      ],
      path: [
        [1.3852, 103.7445], [1.3780, 103.7485], [1.3785, 103.7615], [1.3585, 103.7690],
        [1.3415, 103.7760], [1.3360, 103.7830], [1.3308, 103.7965], [1.3255, 103.8075],
        [1.3225, 103.8155], [1.3065, 103.8278], [1.3045, 103.8315], [1.3022, 103.8360],
        [1.3010, 103.8405], [1.2995, 103.8452], [1.2915, 103.8505], [1.2885, 103.8470],
        [1.2852, 103.8445], [1.2755, 103.8335]
      ]
    }
  },

  '7': {
    serviceNo: '7',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Bedok Bus Interchange',
      destination: 'Clementi Bus Interchange',
      stops: [
        { code: '84009', name: 'Bedok Interchange', road: 'Bedok Nth Ave 1', lat: 1.3242, lng: 103.9302, sheltered: true },
        { code: '82049', name: 'Eunos Stn', road: 'Sims Ave', lat: 1.3198, lng: 103.9030, sheltered: true },
        { code: '81019', name: 'Paya Lebar Stn Exit C', road: 'Paya Lebar Rd', lat: 1.3175, lng: 103.8925, sheltered: true },
        { code: '80059', name: 'Kallang Stn', road: 'Sims Ave', lat: 1.3115, lng: 103.8710, sheltered: true },
        { code: '01112', name: 'Bugis Stn Exit D', road: 'Victoria St', lat: 1.3012, lng: 103.8565, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '08138', name: 'Concorde Hotel', road: 'Orchard Rd', lat: 1.3010, lng: 103.8405, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '09047', name: 'Royal Thai Embassy', road: 'Orchard Rd', lat: 1.3045, lng: 103.8315, sheltered: true },
        { code: '11199', name: 'Grange Residences', road: 'Grange Rd', lat: 1.3020, lng: 103.8210, sheltered: false },
        { code: '11019', name: 'Queenstown Stn Exit A', road: 'Commonwealth Ave', lat: 1.2945, lng: 103.8055, sheltered: true },
        { code: '19059', name: 'Buona Vista Stn Exit C', road: 'Commonwealth Ave', lat: 1.3068, lng: 103.7905, sheltered: true },
        { code: '19099', name: 'Dover Stn Exit A', road: 'Commonwealth Ave West', lat: 1.3112, lng: 103.7785, sheltered: true },
        { code: '17179', name: 'Clementi Interchange', road: 'Clementi Ave 3', lat: 1.3152, lng: 103.7650, sheltered: true },
      ],
      path: [
        [1.3242, 103.9302], [1.3198, 103.9030], [1.3175, 103.8925], [1.3115, 103.8710],
        [1.3012, 103.8565], [1.2995, 103.8452], [1.3010, 103.8405], [1.3022, 103.8360],
        [1.3045, 103.8315], [1.3020, 103.8210], [1.2945, 103.8055], [1.3068, 103.7905],
        [1.3112, 103.7785], [1.3152, 103.7650]
      ]
    }
  },

  '10': {
    serviceNo: '10',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Tampines Bus Interchange',
      destination: 'Kent Ridge Bus Terminal',
      stops: [
        { code: '75009', name: 'Tampines Interchange', road: 'Tampines Ctrl 1', lat: 1.3533, lng: 103.9450, sheltered: true },
        { code: '84009', name: 'Bedok Interchange', road: 'Bedok Nth Ave 1', lat: 1.3242, lng: 103.9302, sheltered: true },
        { code: '92049', name: 'Marine Parade Promenade', road: 'Marine Parade Rd', lat: 1.3032, lng: 103.9055, sheltered: true },
        { code: '91019', name: 'Opp Parkway Parade', road: 'Marine Parade Rd', lat: 1.3020, lng: 103.9030, sheltered: true },
        { code: '03019', name: 'Suntec City', road: 'Temasek Blvd', lat: 1.2940, lng: 103.8580, sheltered: true },
        { code: '03218', name: 'Fullerton Sq / Raffles Place Stn', road: 'Fullerton Rd', lat: 1.2855, lng: 103.8528, sheltered: true },
        { code: '03111', name: 'UIC Bldg', road: 'Shenton Way', lat: 1.2778, lng: 103.8492, sheltered: true },
        { code: '14119', name: 'HarbourFront Stn / VivoCity', road: 'Telok Blangah Rd', lat: 1.2655, lng: 103.8220, sheltered: true },
        { code: '15049', name: 'Pasir Panjang Stn', road: 'Pasir Panjang Rd', lat: 1.2762, lng: 103.7915, sheltered: true },
        { code: '15139', name: 'Haw Par Villa Stn', road: 'Pasir Panjang Rd', lat: 1.2825, lng: 103.7820, sheltered: true },
        { code: '16009', name: 'Kent Ridge Terminal (NUS)', road: 'Clementi Rd', lat: 1.2940, lng: 103.7700, sheltered: true },
      ],
      path: [
        [1.3533, 103.9450], [1.3242, 103.9302], [1.3032, 103.9055], [1.3020, 103.9030],
        [1.2940, 103.8580], [1.2855, 103.8528], [1.2778, 103.8492], [1.2655, 103.8220],
        [1.2762, 103.7915], [1.2825, 103.7820], [1.2940, 103.7700]
      ]
    }
  },

  '174': {
    serviceNo: '174',
    operator: 'SBST',
    category: 'Trunk',
    direction1: {
      origin: 'Boon Lay Bus Interchange',
      destination: 'Kampong Bahru Bus Terminal',
      stops: [
        { code: '22009', name: 'Boon Lay Interchange (Jurong Pt)', road: 'Jurong West Ctrl 3', lat: 1.3395, lng: 103.7060, sheltered: true },
        { code: '28009', name: 'Jurong East Interchange', road: 'Jurong Gateway Rd', lat: 1.3332, lng: 103.7422, sheltered: true },
        { code: '42089', name: 'Beauty World Stn', road: 'Upper Bukit Timah Rd', lat: 1.3415, lng: 103.7760, sheltered: true },
        { code: '41149', name: 'Botanic Gardens Stn', road: 'Bukit Timah Rd', lat: 1.3225, lng: 103.8155, sheltered: true },
        { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
        { code: '04229', name: 'Clarke Quay Stn Exit E', road: 'Eu Tong Sen St', lat: 1.2885, lng: 103.8470, sheltered: true },
        { code: '05013', name: 'Chinatown Point', road: 'New Bridge Rd', lat: 1.2852, lng: 103.8445, sheltered: true },
        { code: '10049', name: 'Kampong Bahru Terminal', road: 'Spooner Rd', lat: 1.2755, lng: 103.8335, sheltered: true },
      ],
      path: [
        [1.3395, 103.7060], [1.3332, 103.7422], [1.3415, 103.7760], [1.3225, 103.8155],
        [1.3022, 103.8360], [1.2995, 103.8452], [1.2885, 103.8470], [1.2852, 103.8445],
        [1.2755, 103.8335]
      ]
    }
  },

  '857': {
    serviceNo: '857',
    operator: 'TTS',
    category: 'Trunk',
    direction1: {
      origin: 'Yishun Bus Interchange',
      destination: 'Suntec City (Loop)',
      stops: [
        { code: '59009', name: 'Yishun Integrated Transport Hub', road: 'Yishun Ave 2', lat: 1.4295, lng: 103.8350, sheltered: true },
        { code: '58019', name: 'Khatib Stn Exit A', road: 'Yishun Ave 2', lat: 1.4172, lng: 103.8330, sheltered: true },
        { code: '60111', name: 'Potong Pasir Stn Exit B', road: 'Upper Serangoon Rd', lat: 1.3312, lng: 103.8685, sheltered: true },
        { code: '60011', name: 'Boon Keng Stn', road: 'Serangoon Rd', lat: 1.3198, lng: 103.8618, sheltered: true },
        { code: '07221', name: 'Tekka Ctr (Little India)', road: 'Serangoon Rd', lat: 1.3065, lng: 103.8510, sheltered: true },
        { code: '01112', name: 'Bugis Stn Exit D', road: 'Victoria St', lat: 1.3012, lng: 103.8565, sheltered: true },
        { code: '03019', name: 'Suntec City / Promenade', road: 'Temasek Blvd', lat: 1.2940, lng: 103.8580, sheltered: true },
        { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
      ],
      path: [
        [1.4295, 103.8350], [1.4172, 103.8330], [1.3312, 103.8685], [1.3198, 103.8618],
        [1.3065, 103.8510], [1.3012, 103.8565], [1.2940, 103.8580], [1.2995, 103.8452]
      ]
    }
  }
};

// Procedural realistic route generator for any other bus service entered (e.g. 2, 5, 12, 30, 51, 166, etc.)
export function getOrCreateBusRoute(serviceNo: string): BusRoute {
  const cleanNo = serviceNo.trim().toUpperCase();
  if (POPULAR_ROUTES[cleanNo]) {
    return POPULAR_ROUTES[cleanNo];
  }

  // Derive deterministic parameters from the string
  let hash = 0;
  for (let i = 0; i < cleanNo.length; i++) {
    hash = (hash << 5) - hash + cleanNo.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  // Pick endpoints from Singapore hubs
  const hubs = [
    { name: 'Ang Mo Kio Interchange', road: 'Ang Mo Kio Ave 8', lat: 1.3698, lng: 103.8496 },
    { name: 'Bishan Bus Interchange', road: 'Bishan St 13', lat: 1.3508, lng: 103.8488 },
    { name: 'Jurong East Interchange', road: 'Jurong Gateway Rd', lat: 1.3332, lng: 103.7422 },
    { name: 'Bedok Interchange', road: 'Bedok Nth Ave 1', lat: 1.3242, lng: 103.9302 },
    { name: 'Tampines Interchange', road: 'Tampines Ctrl 1', lat: 1.3533, lng: 103.9450 },
    { name: 'Serangoon Interchange', road: 'Serangoon Ave 2', lat: 1.3505, lng: 103.8735 },
    { name: 'Woodlands Transport Hub', road: 'Woodlands Sq', lat: 1.4365, lng: 103.7865 },
    { name: 'Shenton Way Terminal', road: 'Shenton Way', lat: 1.2745, lng: 103.8475 },
    { name: 'Marina Centre Terminal', road: 'Raffles Ave', lat: 1.2910, lng: 103.8585 },
    { name: 'Clementi Interchange', road: 'Clementi Ave 3', lat: 1.3152, lng: 103.7650 },
    { name: 'Orchard Blvd Stn', road: 'Orchard Blvd', lat: 1.3028, lng: 103.8245 },
    { name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452 },
    { name: 'Bugis Stn Exit D', road: 'Victoria St', lat: 1.3012, lng: 103.8565 },
  ];

  const origin = hubs[absHash % hubs.length];
  const destIndex = (absHash + 4) % hubs.length;
  const dest = hubs[destIndex === (absHash % hubs.length) ? (destIndex + 1) % hubs.length : destIndex];

  // Intermediates including Central/Orchard to ensure city coverage
  const midPoints: BusStop[] = [
    { code: '08057', name: 'Dhoby Ghaut Stn', road: 'Orchard Rd', lat: 1.2995, lng: 103.8452, sheltered: true },
    { code: '09037', name: 'Opp Mandarin Orchard', road: 'Orchard Rd', lat: 1.3022, lng: 103.8360, sheltered: true },
    { code: '04121', name: 'Opp The Treasury', road: 'North Bridge Rd', lat: 1.2915, lng: 103.8505, sheltered: true },
    { code: '03218', name: 'Raffles Place / Fullerton', road: 'Fullerton Rd', lat: 1.2855, lng: 103.8528, sheltered: true },
    { code: '01112', name: 'Bugis Junction', road: 'Victoria St', lat: 1.3005, lng: 103.8560, sheltered: true },
  ];

  const stops: BusStop[] = [
    { code: `${(absHash % 80000 + 10000)}`, name: origin.name, road: origin.road, lat: origin.lat, lng: origin.lng, sheltered: true },
    ...midPoints.slice(0, 4),
    { code: `${((absHash + 7) % 80000 + 10000)}`, name: dest.name, road: dest.road, lat: dest.lat, lng: dest.lng, sheltered: true }
  ];

  const path: [number, number][] = stops.map(s => [s.lat, s.lng]);

  const operator = (cleanNo.startsWith('9') || cleanNo.startsWith('18') || cleanNo.startsWith('19')) ? 'SMRT' : 'SBST';

  return {
    serviceNo: cleanNo,
    operator,
    category: 'Trunk',
    direction1: {
      origin: origin.name,
      destination: dest.name,
      stops,
      path
    },
    direction2: {
      origin: dest.name,
      destination: origin.name,
      stops: [...stops].reverse(),
      path: [...path].reverse()
    }
  };
}
