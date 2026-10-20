import type { BusArrivalInfo, BusLoad, BusType } from '../../types/bus';

// Offline placeholder arrival times, used only when the LTA feed can't be reached (shown as "Simulated")
export function generateArrivalTimings(
  serviceNo: string,
  stopCode: string,
  baseOffsetSeconds: number = 0
): {
  nextBus: BusArrivalInfo;
  nextBus2: BusArrivalInfo;
  nextBus3: BusArrivalInfo;
} {
  const seed = (parseInt(serviceNo.replace(/\D/g, '') || '14', 10) * 31 + parseInt(stopCode.slice(-3) || '12', 10)) % 100;

  // Predictable but dynamic arrival times based on current clock minute
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  const cycle = (currentMinute * 60 + currentSecond + seed * 13 + baseOffsetSeconds) % 1800; // 30 min loop

  // Next bus (0 - 6 min)
  const min1 = Math.floor((cycle % 420) / 60);
  // Bus 2 (min1 + 5 - 11 min)
  const min2 = min1 + 5 + (seed % 4);
  // Bus 3 (min2 + 7 - 14 min)
  const min3 = min2 + 8 + ((seed * 2) % 5);

  const loads: BusLoad[] = ['SEA', 'SEA', 'SDA', 'SEA', 'LSD', 'SDA'];
  const types: BusType[] = ['DD', 'DD', 'SD', 'DD', 'SD', 'DD'];

  const nextBus: BusArrivalInfo = {
    estimatedMinutes: min1,
    load: loads[seed % loads.length],
    type: types[seed % types.length],
    feature: 'WAB',
  };

  const nextBus2: BusArrivalInfo = {
    estimatedMinutes: min2,
    load: loads[(seed + 1) % loads.length],
    type: types[(seed + 2) % types.length],
    feature: 'WAB',
  };

  const nextBus3: BusArrivalInfo = {
    estimatedMinutes: min3,
    load: loads[(seed + 3) % loads.length],
    type: types[(seed + 4) % types.length],
    feature: 'WAB',
  };

  return { nextBus, nextBus2, nextBus3 };
}
