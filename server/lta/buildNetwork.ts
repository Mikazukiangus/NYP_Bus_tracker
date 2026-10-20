import { calculateDistanceMeters } from '../../shared/geo/distance.ts';
import type { NetworkFile, NetworkPatternRow, NetworkStopRow } from '../../shared/transit/network.ts';
import type { Datasets } from './types.ts';

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
// Road distance is longer than straight-line; used only where LTA's Distance is missing
const ROAD_FACTOR = 1.25;

export function buildNetwork(data: Datasets, generatedAt: string): NetworkFile {
  const codes = [...data.stops.keys()];
  const stopIndex = new Map(codes.map((code, i) => [code, i]));
  const stops: NetworkStopRow[] = codes.map((code) => {
    const s = data.stops.get(code)!;
    return [code, s.Description, s.RoadName, round5(s.Latitude), round5(s.Longitude)];
  });

  const patterns: NetworkPatternRow[] = [];
  for (const [serviceNo, rows] of data.routes) {
    if (!/^[0-9A-Z]{1,6}$/.test(serviceNo)) continue;
    for (const direction of [1, 2]) {
      const ordered = rows
        .filter((r) => r.Direction === direction && stopIndex.has(r.BusStopCode))
        .sort((a, b) => a.StopSequence - b.StopSequence);
      if (ordered.length < 2) continue;

      const indexes: number[] = [];
      const hopHm: number[] = [];
      let metres = 0;
      let lastHm = 0;
      ordered.forEach((row, k) => {
        const stop = data.stops.get(row.BusStopCode)!;
        if (k > 0) {
          const ltaMetres = typeof row.Distance === 'number' && Number.isFinite(row.Distance) ? row.Distance * 1000 : NaN;
          if (ltaMetres >= metres) {
            metres = ltaMetres;
          } else {
            const prev = data.stops.get(ordered[k - 1].BusStopCode)!;
            metres += calculateDistanceMeters(prev.Latitude, prev.Longitude, stop.Latitude, stop.Longitude) * ROAD_FACTOR;
          }
        }
        indexes.push(stopIndex.get(row.BusStopCode)!);
        const hm = Math.round(metres / 100);
        hopHm.push(hm - lastHm);
        lastHm = hm;
      });
      patterns.push([ordered[0].ServiceNo, direction, indexes, hopHm]);
    }
  }
  return { generatedAt, stops, patterns };
}
