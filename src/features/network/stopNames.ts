import { loadBusNetwork } from '../../services/busNetwork';

let stopNamesPromise: Promise<Record<string, string>> | null = null;

// Stop code -> name for every LTA stop, from the bus network built at deploy time (empty if it isn't there)
export function fetchStopNames(): Promise<Record<string, string>> {
  stopNamesPromise ??= loadBusNetwork().then((network) => {
    if (!network) stopNamesPromise = null; // try again next time
    return network ? Object.fromEntries(network.stops.map((s) => [s.code, s.name])) : {};
  });
  return stopNamesPromise;
}
