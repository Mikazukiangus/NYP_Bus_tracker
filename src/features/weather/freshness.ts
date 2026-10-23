import type { WeatherSnapshot, WeatherDatasetKey } from '../../types/weather';

// Provider stale flags survive; a failed refresh makes every retained dataset suspect.
export function retainedWeather(snapshot: WeatherSnapshot, receivedAtMs: number, now: number, maxAgeMs: number, refreshFailed = false): WeatherSnapshot {
  const stale = new Set(snapshot.stale);
  // The API owns per-dataset cache lifetimes. Browser age measures time since a successful
  // refresh, not the age of a legitimate cached 24-hour/four-day forecast.
  if (refreshFailed || !Number.isFinite(receivedAtMs) || now < receivedAtMs || now - receivedAtMs >= maxAgeMs) {
    for (const key of Object.keys(snapshot.fetchedAt) as WeatherDatasetKey[]) stale.add(key);
  }
  return { ...snapshot, stale: [...stale] };
}
