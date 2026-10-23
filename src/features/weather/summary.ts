import { psiBand, pm25Band, uvBand, heatBand, forecastIconType, isWetForecast } from './bands';
import { calculateDistanceMeters } from '../../../shared/geo/distance';
import type {
  LatLng,
  Tone,
  WeatherAlert,
  WeatherRegion,
  WeatherSnapshot,
  WeatherSummary,
} from '../../types/weather';
import { rainBand, rainNowcast } from '../../services/rainNowcast';

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

// NEA's 2-hour forecast for the area nearest a place
export const forecastAt = (snapshot: WeatherSnapshot, lat: number, lng: number) =>
  nearest(snapshot.forecast2h?.areas, lat, lng)?.forecast;

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
    if (snapshot.rainfall.history) summary.nowcast = rainNowcast(snapshot.rainfall.history, lat, lng);
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

function buildAlerts(s: WeatherSummary): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const place = s.area;

  if (s.lightning?.count) {
    alerts.push({
      kind: 'lightning',
      tone: 'severe',
      title: 'Lightning nearby',
      detail: `${s.lightning.count} strike${s.lightning.count > 1 ? 's' : ''} within ${LIGHTNING_RADIUS_KM} km in the last ${LIGHTNING_WINDOW_MIN} min (closest ${s.lightning.nearestKm} km). Wait under a bus shelter or indoors and avoid open fields.`,
    });
  }

  if (s.rain?.rainingNearby) {
    alerts.push({
      kind: 'rain',
      tone: s.rain.tone === 'bad' || s.rain.tone === 'severe' ? 'bad' : 'warn',
      title: `${s.rain.label} near you`,
      detail: `${s.rain.wetStations} of ${s.rain.nearbyStations} nearby rain gauge${s.rain.nearbyStations > 1 ? 's' : ''} recorded rain in the last 5 min (${s.rain.value} mm at ${s.rain.station}). Bring an umbrella and allow extra time; buses may run slower.`,
    });
  } else if (s.nowcast?.status === 'approaching' && isWetForecast(s.forecast2h?.text)) {
    // Rain moving this way with a wet forecast arrived within the hour 71% of the time (COMMENTS.md, turn 29)
    const n = s.nowcast;
    const [lo, hi] = n.etaMin;
    alerts.push({
      kind: 'rain',
      tone: n.likely ? 'warn' : 'moderate',
      title: 'Rain heading your way',
      detail: `Rain ${n.distanceKm} km to the ${n.direction} is moving towards ${place} and ${n.likely ? 'should' : 'may'} arrive in ${lo === hi ? `~${lo}` : `${lo}–${hi}`} min. NEA forecasts ${s.forecast2h!.text.toLowerCase()} (${s.forecast2h!.validText}). Pack an umbrella.`,
    });
  } else if (isWetForecast(s.forecast2h?.text)) {
    alerts.push({
      kind: 'rain',
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
    alerts.push({ kind: 'air', tone: s.psi.tone, title: `${s.psi.label} air quality (24-hr PSI ${s.psi.value})`, detail: advice });
  } else if (s.pm25 && s.pm25.value > 55) {
    alerts.push({
      kind: 'air',
      tone: s.pm25.tone,
      title: `PM2.5 ${s.pm25.label.toLowerCase()} (${s.pm25.value} µg/m³)`,
      detail: 'Fine particle levels in the past hour are above normal. Consider cutting down on strenuous activity outdoors, especially if you are sensitive to haze.',
    });
  }

  if (s.heatStress && s.heatStress.tone !== 'good') {
    alerts.push({
      kind: 'heat',
      tone: s.heatStress.tone,
      title: `${s.heatStress.label} heat stress (WBGT ${s.heatStress.value}°C)`,
      detail: 'Drink water regularly, wait in the shade and take breaks if you are walking far to your stop.',
    });
  }

  if (s.uv && s.uv.value >= 8) {
    alerts.push({
      kind: 'uv',
      tone: s.uv.tone,
      title: `${s.uv.label} UV (index ${s.uv.value})`,
      detail: 'Use sunscreen, a hat or an umbrella while waiting at uncovered stops.',
    });
  }

  if (alerts.length === 0 && s.forecast2h && s.stale.length === 0 && s.missing.length === 0) {
    alerts.push({
      kind: 'ok',
      tone: 'good',
      title: 'Good conditions for your commute',
      detail: `No rain, lightning or unhealthy air reported around ${place} right now.`,
    });
  }
  // Most serious first, so the compact widget always shows what matters most
  return alerts.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
}

const TONE_RANK: Record<Tone, number> = { good: 0, moderate: 1, warn: 2, bad: 3, severe: 4 };
