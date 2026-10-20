import type { BusArrivalInfo, BusLoad, BusType } from '../../types/bus';

const BUS_TYPES: unknown[] = ['SD', 'DD', 'BD'];

// Parse LTA ISO EstimatedArrival string to countdown minutes
function parseLTAEstimatedMinutes(isoString?: string): number {
  if (!isoString) return 99;
  const etaTime = new Date(isoString).getTime();
  if (isNaN(etaTime)) return 99;
  const diffMs = etaTime - Date.now();
  const mins = Math.round(diffMs / 60000);
  return mins <= 0 ? 0 : mins;
}

export function parseBus(raw?: any): BusArrivalInfo | null {
  if (!raw || !raw.EstimatedArrival || !Number.isFinite(Date.parse(raw.EstimatedArrival))) return null;
  const lat = raw.Latitude ? parseFloat(raw.Latitude) : undefined;
  const lng = raw.Longitude ? parseFloat(raw.Longitude) : undefined;
  return {
    estimatedMinutes: parseLTAEstimatedMinutes(raw.EstimatedArrival),
    load: (raw.Load as BusLoad) || 'SEA',
    type: BUS_TYPES.includes(raw.Type) ? (raw.Type as BusType) : undefined,
    feature: raw.Feature === 'WAB' ? 'WAB' : '',
    lat,
    lng,
    monitored: raw.Monitored === 1,
  };
}
