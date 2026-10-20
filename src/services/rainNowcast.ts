import { calculateDistanceMeters } from '../../shared/geo/distance.ts';
import type { RainfallHistory, RainNowcast, Tone } from '../types/weather';

export type { RainNowcast };

// Where rain is around a place right now and where it's heading, from the last hour of NEA's 5-minute rain gauge
// readings. NEA has no rain radar in its open data, so this watches the gauges (about 3 km apart): rain at the
// gauges around you means it's raining where you are, and wet gauges getting closer reading after reading means
// rain is moving your way.

// Gauges this close count as your location (usually 2-4 of them; the closest one if none is this close)
export const RAIN_HERE_KM = 3;
// Rain further away than this is ignored
export const RAIN_WATCH_KM = 20;
// Rain is only said to be heading your way from this close; from further out it changes course or dies out too
// often (12% reached a gauge within 30 min from 10-20 km, against 51% from within 5 km)
const APPROACH_KM = 10;
// Wet gauges this close to the nearest wet one count as the same shower
const SHOWER_KM = 4;
// How far back the movement of rain is measured
const MOVEMENT_MIN = 30;
// The slowest closing speed counted as rain heading your way (0.1 km/min = 6 km/h; showers here usually move at
// 10-40 km/h)
const MIN_CLOSING_KM_PER_MIN = 0.1;
// Arrival estimates further out than this aren't given
const MAX_ETA_MIN = 90;
// Rain is ahead of the wet gauge nearest you by about this much, as the next gauge towards you is often already
// wet but hasn't tipped yet (see the backtest in COMMENTS.md, turn 29)
const FRONT_LEAD_KM = 1;
// The gauges' smallest step
const WET_MM = 0.2;
const READING_MIN = 5;

// Rain intensity from a 5-minute total, using the standard mm/hour thresholds
export function rainBand(mmPer5Min: number): { label: string; tone: Tone } {
  const mmPerHour = mmPer5Min * 12;
  if (mmPerHour <= 0) return { label: 'No rain', tone: 'good' };
  if (mmPerHour < 2.5) return { label: 'Light rain', tone: 'moderate' };
  if (mmPerHour < 10) return { label: 'Moderate rain', tone: 'warn' };
  if (mmPerHour < 50) return { label: 'Heavy rain', tone: 'bad' };
  return { label: 'Very heavy rain', tone: 'severe' };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function compass(lat: number, lng: number, toLat: number, toLng: number) {
  const dy = toLat - lat;
  const dx = (toLng - lng) * Math.cos((lat * Math.PI) / 180);
  const degrees = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(degrees / 45) % 8];
}

// Least-squares slope of y over x
function slope(points: [number, number][]) {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return sxx === 0 ? 0 : points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
}

const roundTo5 = (min: number) => Math.max(5, Math.round(min / 5) * 5);

export function rainNowcast(
  history: RainfallHistory | undefined,
  lat: number,
  lng: number,
  opts: { excludeStation?: string } = {} // the backtest predicts a gauge's rain from the other gauges
): RainNowcast {
  const readings = history?.readings ?? [];
  if (!history || readings.length === 0) return { status: 'unknown' };

  const gauges = history.stations
    .map((s, index) => ({ ...s, index, km: calculateDistanceMeters(lat, lng, s.lat, s.lng) / 1000 }))
    .filter((g) => g.id !== opts.excludeStation);
  if (gauges.length === 0) return { status: 'unknown' };
  const closest = gauges.reduce((best, g) => (g.km < best.km ? g : best));
  const here = gauges.filter((g) => g.km <= RAIN_HERE_KM);
  if (here.length === 0) here.push(closest);

  const last = readings.length - 1;
  const value = (k: number, index: number) => readings[k].values[index] ?? 0;
  // The heaviest reading at the gauges around you
  const hereMax = (k: number) => Math.max(...here.map((g) => value(k, g.index)));
  const wetHere = (k: number) => hereMax(k) >= WET_MM;

  if (wetHere(last)) {
    const heaviest = here.reduce((best, g) => (value(last, g.index) > value(last, best.index) ? g : best));
    let k = last;
    while (k > 0 && wetHere(k - 1)) k--;
    const band = rainBand(value(last, heaviest.index));
    return {
      status: 'raining',
      mmPerHour: Math.round(value(last, heaviest.index) * 12 * 10) / 10,
      ...band,
      station: heaviest.name,
      distanceKm: Math.round(heaviest.km * 10) / 10,
      sinceMin: (last - k + 1) * READING_MIN,
      sinceAtLeast: k === 0,
    };
  }

  for (let ago = 1; ago <= 3 && last - ago >= 0; ago++) {
    if (wetHere(last - ago)) return { status: 'stopped', minutesAgo: ago * READING_MIN };
  }

  // The nearest wet gauge in each reading of the last half hour
  const latestTime = new Date(readings[last].timestamp).getTime();
  const nearestWet = (k: number) =>
    gauges.reduce<(typeof gauges)[number] | null>(
      (best, g) => (value(k, g.index) >= WET_MM && g.km <= RAIN_WATCH_KM && (!best || g.km < best.km) ? g : best),
      null
    );
  const now = nearestWet(last);
  if (!now) return { status: 'clear' };

  const track: [number, number][] = [];
  for (let k = last; k >= 0; k--) {
    const minutes = (new Date(readings[k].timestamp).getTime() - latestTime) / 60000;
    if (minutes < -MOVEMENT_MIN) break;
    const g = nearestWet(k);
    if (g) track.push([minutes, g.km]);
  }
  const direction = compass(lat, lng, now.lat, now.lng);
  const distanceKm = Math.round(now.km * 10) / 10;
  const closing = track.length >= 3 ? -slope(track) : 0; // km per minute, positive when getting closer
  // The shower around the nearest wet gauge: a single gauge's 0.2 mm is often a passing drizzle that dies out
  const shower = gauges.filter(
    (g) => value(last, g.index) >= WET_MM && calculateDistanceMeters(now.lat, now.lng, g.lat, g.lng) / 1000 <= SHOWER_KM
  );
  const drizzle = shower.length === 1 && value(last, now.index) <= WET_MM;

  if (closing >= MIN_CLOSING_KM_PER_MIN && now.km <= APPROACH_KM && !drizzle) {
    const eta = Math.max(0, now.km - FRONT_LEAD_KM) / closing;
    if (eta <= MAX_ETA_MIN) {
      return {
        status: 'approaching',
        distanceKm,
        direction,
        // The speed comes from a few gauges' readings, so give a range rather than a time
        etaMin: [roundTo5(eta * 0.6), roundTo5(eta * 1.4)],
        speedKmh: Math.round(closing * 60),
        likely: now.km <= 5 && shower.length >= 2,
      };
    }
  }
  return { status: 'nearby', distanceKm, direction, movingAway: closing <= -MIN_CLOSING_KM_PER_MIN };
}
