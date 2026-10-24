import type { AppConfig } from '../../config/schema.ts';
import { cdnCache } from '../../config/schema.ts';

// A warm-cache hit must not restart a full CDN freshness window for an older provider snapshot.
export function incidentCacheControl(settings: AppConfig['lta']['cache'], fetchedAt: string, now = Date.now()): string {
  const ageMs = now - Date.parse(fetchedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'no-store';
  const remaining = Math.max(0, settings.incidentsSeconds - Math.ceil(ageMs / 1000));
  return cdnCache(remaining, settings.incidentsStaleSeconds);
}
