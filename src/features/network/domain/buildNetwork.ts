import type { Direction } from '../../../../shared/transit/routes';
import type { NetworkFile } from '../../../../shared/transit/network';
import type { BusNetwork, NetStop, NetPattern } from '../model';
import { serviceDirectionKey } from '../model';
// ~550 m grid cells for nearby-stop lookups
export const CELL_DEG = 0.005;
export const cellKey = (x: number, y: number) => `${x}:${y}`;

export function buildBusNetwork(file: NetworkFile): BusNetwork {
  const stops = file.stops.map(([code, name, road, lat, lng], index): NetStop => ({ index, code, name, road, lat, lng }));
  const byCode = new Map(stops.map((s) => [s.code, s]));
  const patternsAtStop: number[][] = stops.map(() => []);
  const patterns = file.patterns.map(([serviceNo, direction, stopIdx, hopHm], index): NetPattern => {
    let total = 0;
    const distM = hopHm.map((hop) => (total += hop * 100));
    for (const s of new Set(stopIdx)) patternsAtStop[s]?.push(index);
    return { index, serviceNo, direction: direction as Direction, stops: stopIdx, distM };
  });

  const grid = new Map<string, number[]>();
  for (const s of stops) {
    const key = cellKey(Math.floor(s.lng / CELL_DEG), Math.floor(s.lat / CELL_DEG));
    const cell = grid.get(key);
    if (cell) cell.push(s.index);
    else grid.set(key, [s.index]);
  }
  const byServiceDirection = new Map(patterns.map(pattern => [serviceDirectionKey(pattern.serviceNo, pattern.direction), pattern]));
  return { generatedAt: file.generatedAt, datasetVersion: file.datasetVersion ?? file.generatedAt, stops, byCode,
    patterns, byServiceDirection, transferNeighboursByRadius: new Map(), patternsAtStop, grid };
}
