import type { AppConfig } from '../../config/schema.ts';
import type { WeatherDatasetKey as DatasetKey, WeatherSnapshot } from '../../shared/weather/types.ts';
import { weatherCatalog } from './catalog.ts';
interface WeatherDependencies {
  request?: typeof fetch;
  now?: () => number;
  logger?: { warn: (event: string, metadata: Record<string, unknown>) => void };
}
export function createWeatherService(settings: AppConfig['weather'], baseUrl: string, dependencies: WeatherDependencies = {}) {
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? { warn: () => {} };
  const DATASETS = weatherCatalog(settings, now);
  const cache = new Map<DatasetKey, { at: number; value: unknown }>();
  const recentCalls: number[] = [];
  const RATE_WINDOW_MS = settings.rateWindowMs;
  async function fetchDataset(path: string, apiKey?: string) {
    const res = await request(`${baseUrl}/${path}`, {
      headers: { Accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    const body = await res.json();
    if (body.code !== 0) throw new Error('NEA returned an upstream error');
    return body;
  }

  async function snapshot(): Promise<WeatherSnapshot> {
    const apiKey = settings.apiKey || undefined;
    // Stay under the 10-second rate limit (6 keyless / 12 dev key), leaving headroom for other instances
    const budget = apiKey ? settings.keyedBudget : settings.keylessBudget;
    const startedAt = now();
    while (recentCalls.length && startedAt - recentCalls[0] > RATE_WINDOW_MS) recentCalls.shift();

    const due = DATASETS.filter((d) => {
      const hit = cache.get(d.key);
      return !hit || startedAt - hit.at > d.ttlMs;
    }).slice(0, Math.max(0, budget - recentCalls.length));
    recentCalls.push(...due.map(() => startedAt));

    await Promise.all(
      due.map(async (d) => {
        try {
          const path = typeof d.path === 'function' ? d.path() : d.path;
          cache.set(d.key, { at: now(), value: d.parse(await fetchDataset(path, apiKey)) });
        } catch (err) {
          logger.warn('nea.dataset_refresh_failed', { dataset: d.key, error: err });
        }
      })
    );

    const body: WeatherSnapshot = { fetchedAt: {}, missing: [], stale: [], source: 'NEA_DATA_GOV_SG' };
    for (const d of DATASETS) {
      const hit = cache.get(d.key);
      if (!hit) {
        body.missing.push(d.key);
        continue;
      }
      (body as any)[d.key] = hit.value;
      body.fetchedAt[d.key] = new Date(hit.at).toISOString();
      if (now() - hit.at > d.ttlMs) body.stale.push(d.key);
    }

    return body;
  }
  return { snapshot, datasetCount: DATASETS.length };
}
