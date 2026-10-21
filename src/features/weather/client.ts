import type { WeatherSnapshot } from '../../types/weather';
import { config, apiUrl } from '../../config';
import { parseForecast2h } from '../../../shared/weather/parsers';
import { parseWeatherSnapshot } from '../../../shared/weather/validation';

const DIRECT_TWO_HR = `${config.urls.neaBase}/two-hr-forecast`;

// Fetch the Singapore-wide NEA snapshot from /api/weather. If our API is unreachable, fall back to the
// keyless 2-hour forecast straight from data.gov.sg so the widget still shows something real.
export async function fetchWeatherSnapshot(): Promise<WeatherSnapshot> {
  try {
    const res = await fetch(apiUrl('/api/weather'), { signal: AbortSignal.timeout(config.timeouts.requestMs) });
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      return parseWeatherSnapshot(await res.json());
    }
  } catch {
    // Fall through to the direct forecast
  }

  const res = await fetch(DIRECT_TWO_HR, { signal: AbortSignal.timeout(config.timeouts.externalMs) });
  if (!res.ok) throw new Error(`NEA responded ${res.status}`);
  if (!res.headers.get('content-type')?.includes('json')) throw new Error('Invalid external data.');
  const raw = await res.json();
  return {
    forecast2h: parseForecast2h(raw),
    fetchedAt: { forecast2h: new Date().toISOString() },
    missing: ['temperature', 'rainfall', 'psi', 'pm25', 'humidity', 'forecast24h', 'uv', 'lightning', 'wbgt', 'windSpeed', 'outlook4d'],
    stale: [],
    source: 'NEA_DATA_GOV_SG',
  };
}
