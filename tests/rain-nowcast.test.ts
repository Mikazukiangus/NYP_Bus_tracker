import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rainNowcast } from '../src/services/rainNowcast';
import { rainAdvice } from '../src/services/rainAdvice';
import { parseRainfall } from '../shared/weather/parsers';
import type { RainfallHistory, RainNowcast } from '../src/types/weather';

// A place, and rain gauges along a line east of it (plus a second row 1 km north, so a shower can cover two
// gauges side by side)
const LAT = 1.35;
const LNG = 103.85;
const at = (kmEast: number, kmNorth = 0) => ({ lat: LAT + kmNorth / 111.2, lng: LNG + kmEast / 111.28 });
const EAST_KM = [0.5, 2, 4, 6, 8, 10, 12, 14];
const gauges = [
  ...EAST_KM.map((km) => ({ id: `E${km}`, name: `${km} km east`, ...at(km) })),
  ...EAST_KM.map((km) => ({ id: `N${km}`, name: `${km} km east, 1 km north`, ...at(km, 1) })),
];
const kmOf = (id: string) => parseFloat(id.slice(1));

// 13 readings (an hour), the last at 6:00 pm; mm(k, gauge) gives each reading's rainfall
function history(mm: (k: number, g: (typeof gauges)[number]) => number): RainfallHistory {
  const end = Date.parse('2026-10-11T18:00:00+08:00');
  return {
    stations: gauges,
    readings: Array.from({ length: 13 }, (_, k) => ({
      timestamp: new Date(end - (12 - k) * 5 * 60000).toISOString(),
      values: gauges.map((g) => mm(k, g)),
    })),
  };
}

// A band of rain moving west at 2 km per reading (24 km/h); its front is frontAt(k) km east of the place
const movingShower = (frontAt: (k: number) => number) =>
  history((k, g) => {
    const km = kmOf(g.id);
    return km >= frontAt(k) && km <= frontAt(k) + 4 ? 1 : 0;
  });

test('rain at the gauges around you is rain here, with how heavy and how long', () => {
  const n = rainNowcast(history((k, g) => (g.id === 'E0.5' && k >= 9 ? 1.2 : 0)), LAT, LNG);
  assert.equal(n.status, 'raining');
  if (n.status !== 'raining') return;
  assert.equal(n.label, 'Heavy rain'); // 1.2 mm in 5 min = 14.4 mm/h
  assert.equal(n.sinceMin, 20);
  assert.equal(n.sinceAtLeast, false);
});

test('rain that stopped in the last 15 minutes is "stopped"', () => {
  const n = rainNowcast(history((k, g) => (g.id === 'E2' && k <= 10 ? 0.4 : 0)), LAT, LNG);
  assert.deepEqual(n, { status: 'stopped', minutesAgo: 10 });
});

test('a shower getting closer is "approaching", with when it should arrive', () => {
  // Front at 14, 12, 10, 8, 6 km over the last 5 readings
  const n = rainNowcast(movingShower((k) => 14 - 2 * (k - 8)), LAT, LNG);
  assert.equal(n.status, 'approaching');
  if (n.status !== 'approaching') return;
  assert.equal(n.distanceKm, 6);
  assert.equal(n.direction, 'east');
  assert.equal(n.speedKmh, 24);
  // (6 km - 1 km lead) / 0.4 km a minute = 12.5 min, given as a range around it
  const [lo, hi] = n.etaMin;
  assert.ok(lo <= 12.5 && hi >= 12.5 && hi - lo === 10, `${lo}-${hi} min`);
  assert.equal(n.likely, false, 'more than 5 km away');

  const closer = rainNowcast(movingShower((k) => 12 - 2 * (k - 8)), LAT, LNG);
  assert.equal(closer.status === 'approaching' && closer.likely, true, 'within 5 km and two gauges wide');
});

test('far-off rain, a lone drizzle and rain moving away are only "nearby"', () => {
  const far = rainNowcast(movingShower((k) => 20 - 2 * (k - 8)), LAT, LNG); // closing in, but still 12 km off
  assert.ok(far.status === 'nearby' && far.distanceKm === 12);

  // 0.2 mm at one gauge at a time, 14 km then 12, 10, 8 and 6 km east
  const drizzle = rainNowcast(history((k, g) => (k >= 8 && g.id === `E${14 - 2 * (k - 8)}` ? 0.2 : 0)), LAT, LNG);
  assert.equal(drizzle.status, 'nearby', 'one gauge at 0.2 mm');

  const leaving = rainNowcast(movingShower((k) => 4 + 2 * (k - 8)), LAT, LNG);
  assert.ok(leaving.status === 'nearby' && leaving.movingAway);

  assert.deepEqual(rainNowcast(history(() => 0), LAT, LNG), { status: 'clear' });
  assert.deepEqual(rainNowcast(undefined, LAT, LNG), { status: 'unknown' });
});

const approaching = (likely: boolean): RainNowcast => ({
  status: 'approaching',
  distanceKm: 6,
  direction: 'east',
  etaMin: [15, 25],
  speedKmh: 20,
  likely,
});

test('rain on the way: leave now if the walk to the stop beats it, otherwise take an umbrella', () => {
  const now = rainAdvice({
    here: approaching(true), forecast: 'Thundery Showers', walkMin: 5, stopName: 'Nanyang Poly', busServiceNo: '72', busMin: [3, 9, 15],
  })!;
  assert.equal(now.action, 'leave-now');
  assert.match(now.detail, /Nanyang Poly is a ~5\u00a0min walk, so you'd reach it first; the next Bus 72 you can catch comes in 9\u00a0min/);

  const late = rainAdvice({ here: approaching(true), forecast: 'Showers', walkMin: 14, busMin: [3] })!;
  assert.equal(late.action, 'umbrella');

  const atStop = rainAdvice({ here: approaching(true), forecast: 'Showers', walkMin: 0, stopName: 'Bef Cairnhill Rd' })!;
  assert.match(atStop.detail, /You're at the Bef Cairnhill Rd stop/);

  // With a dry forecast, showers drifting closer seldom arrive
  assert.equal(rainAdvice({ here: approaching(true), forecast: 'Cloudy', walkMin: 5 })!.action, 'go');
});

test('raining: wait out heavy rain, take an umbrella in moderate rain, and lightning means shelter', () => {
  const raining = (label: string, tone: 'warn' | 'bad'): RainNowcast => ({
    status: 'raining', mmPerHour: 20, label, tone, station: 'Ang Mo Kio', distanceKm: 1.2, sinceMin: 15, sinceAtLeast: false,
  });
  assert.equal(rainAdvice({ here: raining('Heavy rain', 'bad'), forecast: 'Thundery Showers' })!.action, 'wait');
  assert.equal(rainAdvice({ here: raining('Moderate rain', 'warn'), forecast: 'Showers' })!.action, 'umbrella');

  const lightning = rainAdvice({
    here: { status: 'clear' }, forecast: 'Cloudy', lightning: { count: 3, nearestKm: 4.2, windowMinutes: 15 },
  })!;
  assert.equal(lightning.action, 'wait');
  assert.equal(lightning.cause, 'lightning');
});

test('dry here but raining where you are going: the umbrella is for the other end', () => {
  const advice = rainAdvice({
    here: { status: 'clear' },
    forecast: 'Partly Cloudy (Day)',
    walkMin: 3,
    destination: {
      name: 'Tampines Int',
      nowcast: { status: 'raining', mmPerHour: 6, label: 'Moderate rain', tone: 'warn', station: 'Tampines', distanceKm: 1, sinceMin: 20, sinceAtLeast: false },
      forecast: 'Showers',
      arriveInMin: 35,
      walkMin: 4,
    },
  })!;
  assert.equal(advice.action, 'umbrella');
  assert.match(advice.title, /Tampines Int/);
  assert.match(advice.destination!.text, /~4\u00a0min walk at the end/);
});

test('the server reads rainfall from the newest reading most gauges have reported, and keeps the last hour', () => {
  const stations = ['S1', 'S2', 'S3', 'S4'].map((id, i) => ({ id, name: id, location: { latitude: 1.3 + i / 100, longitude: 103.8 } }));
  const reading = (minute: number, ids: string[]) => ({
    timestamp: `2026-10-11T18:${String(minute).padStart(2, '0')}:00+08:00`,
    data: ids.map((stationId) => ({ stationId, value: stationId === 'S2' ? 0.4 : 0 })),
  });
  // Newest first, as data.gov.sg returns them; the 18:25 reading has only one gauge in so far
  const readings = [reading(25, ['S1']), ...[20, 15, 10, 5, 0].map((m) => reading(m, ['S1', 'S2', 'S3', 'S4']))];
  const rain = parseRainfall({ code: 0, data: { stations, readings, readingUnit: 'mm' } });
  assert.equal(rain.timestamp, '2026-10-11T18:20:00+08:00');
  assert.equal(rain.stations.length, 4);
  assert.equal(rain.history!.readings.length, 5);
  assert.equal(rain.history!.readings[0].timestamp, '2026-10-11T18:00:00+08:00', 'oldest first');
  assert.deepEqual(rain.history!.readings.at(-1)!.values, [0, 0.4, 0, 0]);
});
