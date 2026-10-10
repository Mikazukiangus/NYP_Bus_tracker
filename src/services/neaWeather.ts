import { calculateDistanceMeters } from '../data/singaporeBuses';
import type {
  LatLng,
  Tone,
  WeatherRegion,
  WeatherSnapshot,
  WeatherSummary,
} from '../types/weather';

const DIRECT_TWO_HR = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';

// Fetch the Singapore-wide NEA snapshot from /api/weather. If our API is unreachable, fall back to the
// keyless 2-hour forecast straight from data.gov.sg so the widget still shows something real.
export async function fetchWeatherSnapshot(): Promise<WeatherSnapshot> {
  try {
    const res = await fetch('/api/weather', { signal: AbortSignal.timeout(10000) });
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const data = (await res.json()) as WeatherSnapshot;
      if (data?.source === 'NEA_DATA_GOV_SG') return data;
    }
  } catch {
    // Fall through to the direct forecast
  }

  const res = await fetch(DIRECT_TWO_HR, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`NEA responded ${res.status}`);
  const raw = await res.json();
  const item = raw.data.items[0];
  const forecasts = new Map<string, string>(item.forecasts.map((f: any) => [f.area, f.forecast]));
  return {
    forecast2h: {
      validText: item.valid_period?.text,
      updated: item.update_timestamp,
      areas: raw.data.area_metadata
        .filter((a: any) => forecasts.has(a.name))
        .map((a: any) => ({
          name: a.name,
          lat: a.label_location.latitude,
          lng: a.label_location.longitude,
          forecast: forecasts.get(a.name)!,
        })),
    },
    fetchedAt: { forecast2h: new Date().toISOString() },
    missing: ['temperature', 'rainfall', 'psi', 'pm25', 'humidity', 'forecast24h', 'uv', 'lightning', 'wbgt', 'windSpeed', 'outlook4d'],
    stale: [],
    source: 'NEA_DATA_GOV_SG',
  };
}

// NEA's PSI reporting regions, used when the PSI dataset (which carries them) is unavailable
const REGION_CENTRES: (LatLng & { name: WeatherRegion })[] = [
  { name: 'north', lat: 1.41803, lng: 103.82 },
  { name: 'south', lat: 1.29587, lng: 103.82 },
  { name: 'east', lat: 1.35735, lng: 103.94 },
  { name: 'west', lat: 1.35735, lng: 103.7 },
  { name: 'central', lat: 1.35735, lng: 103.82 },
];

const RAIN_NEARBY_KM = 3;
const LIGHTNING_RADIUS_KM = 10;
const LIGHTNING_WINDOW_MIN = 15;

function nearest<T extends LatLng>(items: T[] | undefined, lat: number, lng: number) {
  let best: (T & { distanceKm: number }) | undefined;
  for (const item of items ?? []) {
    const distanceKm = calculateDistanceMeters(lat, lng, item.lat, item.lng) / 1000;
    if (!best || distanceKm < best.distanceKm) best = { ...item, distanceKm };
  }
  return best;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// NEA PSI health bands
export function psiBand(psi: number): { label: string; tone: Tone } {
  if (psi <= 50) return { label: 'Good', tone: 'good' };
  if (psi <= 100) return { label: 'Moderate', tone: 'moderate' };
  if (psi <= 200) return { label: 'Unhealthy', tone: 'bad' };
  if (psi <= 300) return { label: 'Very Unhealthy', tone: 'severe' };
  return { label: 'Hazardous', tone: 'severe' };
}

// NEA 1-hour PM2.5 concentration bands (µg/m³)
export function pm25Band(value: number): { label: string; tone: Tone } {
  if (value <= 55) return { label: 'Normal', tone: 'good' };
  if (value <= 150) return { label: 'Elevated', tone: 'warn' };
  if (value <= 250) return { label: 'High', tone: 'bad' };
  return { label: 'Very High', tone: 'severe' };
}

export function uvBand(value: number): { label: string; tone: Tone } {
  if (value <= 2) return { label: 'Low', tone: 'good' };
  if (value <= 5) return { label: 'Moderate', tone: 'moderate' };
  if (value <= 7) return { label: 'High', tone: 'warn' };
  if (value <= 10) return { label: 'Very High', tone: 'bad' };
  return { label: 'Extreme', tone: 'severe' };
}

function heatBand(heatStress: string): Tone {
  const s = heatStress.toLowerCase();
  if (s.includes('high')) return 'bad';
  if (s.includes('moderate')) return 'warn';
  return 'good';
}

// Rain intensity from a 5-minute total, using the standard mm/hour thresholds
function rainBand(mmPer5Min: number): { label: string; tone: Tone } {
  const mmPerHour = mmPer5Min * 12;
  if (mmPerHour <= 0) return { label: 'No rain', tone: 'good' };
  if (mmPerHour < 2.5) return { label: 'Light rain', tone: 'moderate' };
  if (mmPerHour < 10) return { label: 'Moderate rain', tone: 'warn' };
  if (mmPerHour < 50) return { label: 'Heavy rain', tone: 'bad' };
  return { label: 'Very heavy rain', tone: 'severe' };
}

export function forecastIconType(forecast: string): WeatherSummary['iconType'] {
  const f = forecast.toLowerCase();
  if (f.includes('thunder')) return 'thunder';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return 'rain';
  if (f.includes('haz') || f.includes('mist') || f.includes('fog')) return 'haze';
  if (f.includes('fair') || f.includes('sunny')) return f.includes('night') ? 'fair-night' : 'fair';
  return 'cloudy';
}

const isWetForecast = (forecast?: string) => Boolean(forecast && /rain|shower|thunder|drizzle/i.test(forecast));

export function formatSgTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
}

// Resolve the Singapore-wide snapshot into readings for one location: nearest station for the
// measurements, nearest region for air quality, plus commuter alerts built only from real data
export function summarizeWeather(snapshot: WeatherSnapshot, lat: number, lng: number): WeatherSummary {
  const area = nearest(snapshot.forecast2h?.areas, lat, lng);
  const psiRegion = nearest(snapshot.psi?.regions, lat, lng);
  const region = psiRegion?.name ?? nearest(REGION_CENTRES, lat, lng)!.name;

  const stationReading = (data: WeatherSnapshot['temperature'], transform = (v: number) => v) => {
    const s = nearest(data?.stations, lat, lng);
    return s
      ? { value: transform(s.value), station: s.name, distanceKm: round1(s.distanceKm), time: data!.timestamp }
      : undefined;
  };

  const summary: WeatherSummary = {
    area: area?.name ?? 'Singapore',
    region,
    iconType: forecastIconType(area?.forecast ?? ''),
    alerts: [],
    missing: snapshot.missing,
    stale: snapshot.stale,
  };

  if (area && snapshot.forecast2h) {
    summary.forecast2h = { text: area.forecast, validText: snapshot.forecast2h.validText, updated: snapshot.forecast2h.updated };
  }
  summary.temperature = stationReading(snapshot.temperature, round1);
  summary.humidity = stationReading(snapshot.humidity, Math.round);
  // NEA reports wind speed in knots
  summary.windKmh = stationReading(snapshot.windSpeed, (knots) => Math.round(knots * 1.852));

  if (snapshot.rainfall) {
    const withDistance = snapshot.rainfall.stations.map((s) => ({
      ...s,
      distanceKm: calculateDistanceMeters(lat, lng, s.lat, s.lng) / 1000,
    }));
    const closest = withDistance.reduce<(typeof withDistance)[number] | undefined>(
      (best, s) => (!best || s.distanceKm < best.distanceKm ? s : best),
      undefined
    );
    // Gauges within 3 km, always including the closest one even if it is further away
    const nearby = withDistance.filter((s) => s.distanceKm <= RAIN_NEARBY_KM || s === closest);
    const wet = nearby.filter((s) => s.value > 0);
    if (closest) {
      // Rain gauges are a few km apart, so report the heaviest nearby reading rather than only the closest
      const heaviest = wet.reduce((max, s) => (s.value > max.value ? s : max), closest);
      summary.rain = {
        value: round1(heaviest.value),
        station: heaviest.name,
        distanceKm: round1(heaviest.distanceKm),
        time: snapshot.rainfall.timestamp,
        ...rainBand(heaviest.value),
        rainingNearby: wet.length > 0,
        nearbyStations: nearby.length,
        wetStations: wet.length,
      };
    }
  }

  if (psiRegion && Number.isFinite(psiRegion.psi24h)) {
    summary.psi = { value: psiRegion.psi24h, station: `${region} region`, time: snapshot.psi!.timestamp, ...psiBand(psiRegion.psi24h) };
  }
  const pmRegion = nearest(snapshot.pm25?.regions, lat, lng);
  if (pmRegion && Number.isFinite(pmRegion.value)) {
    summary.pm25 = { value: pmRegion.value, station: `${pmRegion.name} region`, time: snapshot.pm25!.timestamp, ...pm25Band(pmRegion.value) };
  }
  if (snapshot.uv && Number.isFinite(snapshot.uv.value)) {
    summary.uv = { value: snapshot.uv.value, time: snapshot.uv.timestamp, ...uvBand(snapshot.uv.value) };
  }
  const wbgt = nearest(snapshot.wbgt?.stations, lat, lng);
  if (wbgt && Number.isFinite(wbgt.value)) {
    summary.heatStress = {
      value: round1(wbgt.value),
      label: wbgt.heatStress || 'Unknown',
      tone: heatBand(wbgt.heatStress || ''),
      station: wbgt.name,
      distanceKm: round1(wbgt.distanceKm),
      time: snapshot.wbgt!.timestamp,
    };
  }

  if (snapshot.lightning) {
    const cutoff = Date.now() - LIGHTNING_WINDOW_MIN * 60 * 1000;
    const close = snapshot.lightning.strikes
      .filter((s) => new Date(s.time).getTime() >= cutoff)
      .map((s) => calculateDistanceMeters(lat, lng, s.lat, s.lng) / 1000)
      .filter((km) => km <= LIGHTNING_RADIUS_KM);
    summary.lightning = {
      count: close.length,
      nearestKm: close.length ? round1(Math.min(...close)) : 0,
      windowMinutes: LIGHTNING_WINDOW_MIN,
      time: snapshot.lightning.timestamp,
    };
  }

  if (snapshot.forecast24h) {
    summary.today = {
      ...snapshot.forecast24h,
      regionPeriods: snapshot.forecast24h.periods
        .map((p) => ({ text: p.text, forecast: p.regions[region] ?? '' }))
        .filter((p) => p.forecast),
    };
  }
  if (snapshot.outlook4d?.length) summary.outlook = snapshot.outlook4d;

  summary.alerts = buildAlerts(summary);
  return summary;
}

function buildAlerts(s: WeatherSummary): WeatherSummary['alerts'] {
  const alerts: WeatherSummary['alerts'] = [];
  const place = s.area;

  if (s.lightning?.count) {
    alerts.push({
      tone: 'severe',
      title: 'Lightning nearby',
      detail: `${s.lightning.count} strike${s.lightning.count > 1 ? 's' : ''} within ${LIGHTNING_RADIUS_KM} km in the last ${LIGHTNING_WINDOW_MIN} min (closest ${s.lightning.nearestKm} km). Wait under a bus shelter or indoors and avoid open fields.`,
    });
  }

  if (s.rain?.rainingNearby) {
    alerts.push({
      tone: s.rain.tone === 'bad' || s.rain.tone === 'severe' ? 'bad' : 'warn',
      title: `${s.rain.label} near you`,
      detail: `${s.rain.wetStations} of ${s.rain.nearbyStations} nearby rain gauge${s.rain.nearbyStations > 1 ? 's' : ''} recorded rain in the last 5 min (${s.rain.value} mm at ${s.rain.station}). Bring an umbrella and allow extra time; buses may run slower.`,
    });
  } else if (isWetForecast(s.forecast2h?.text)) {
    alerts.push({
      tone: 'moderate',
      title: `${s.forecast2h!.text} forecast`,
      detail: `NEA expects ${s.forecast2h!.text.toLowerCase()} around ${place} (${s.forecast2h!.validText}). Pack an umbrella.`,
    });
  }

  if (s.psi && s.psi.value > 100) {
    const advice =
      s.psi.value > 300
        ? 'Minimise outdoor activity. Elderly, children and people with heart or lung conditions should avoid outdoor activity.'
        : s.psi.value > 200
          ? 'Avoid prolonged or strenuous outdoor physical exertion. Elderly, children and people with heart or lung conditions should minimise outdoor activity.'
          : 'Reduce prolonged or strenuous outdoor physical exertion. Elderly, children and people with heart or lung conditions should minimise it.';
    alerts.push({ tone: s.psi.tone, title: `${s.psi.label} air quality (24-hr PSI ${s.psi.value})`, detail: advice });
  } else if (s.pm25 && s.pm25.value > 55) {
    alerts.push({
      tone: s.pm25.tone,
      title: `PM2.5 ${s.pm25.label.toLowerCase()} (${s.pm25.value} µg/m³)`,
      detail: 'Fine particle levels in the past hour are above normal. Consider cutting down on strenuous activity outdoors, especially if you are sensitive to haze.',
    });
  }

  if (s.heatStress && s.heatStress.tone !== 'good') {
    alerts.push({
      tone: s.heatStress.tone,
      title: `${s.heatStress.label} heat stress (WBGT ${s.heatStress.value}°C)`,
      detail: 'Drink water regularly, wait in the shade and take breaks if you are walking far to your stop.',
    });
  }

  if (s.uv && s.uv.value >= 8) {
    alerts.push({
      tone: s.uv.tone,
      title: `${s.uv.label} UV (index ${s.uv.value})`,
      detail: 'Use sunscreen, a hat or an umbrella while waiting at uncovered stops.',
    });
  }

  if (alerts.length === 0 && s.forecast2h) {
    alerts.push({
      tone: 'good',
      title: 'Good conditions for your commute',
      detail: `No rain, lightning or unhealthy air reported around ${place} right now.`,
    });
  }
  // Most serious first, so the compact widget always shows what matters most
  return alerts.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
}

const TONE_RANK: Record<Tone, number> = { good: 0, moderate: 1, warn: 2, bad: 3, severe: 4 };

export const toneClasses: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  good: { text: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  moderate: { text: 'text-sky-800', bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' },
  warn: { text: 'text-amber-900', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  bad: { text: 'text-orange-900', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  severe: { text: 'text-red-900', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-600' },
};
