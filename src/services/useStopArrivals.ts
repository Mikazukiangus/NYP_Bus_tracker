import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArrivalDataSource, StopServiceArrivals } from '../types/bus';
import { arrivalRepository } from '../features/arrivals/data/arrivalRepository';
import { ageServices, type ArrivalSnapshot } from '../features/arrivals/domain/snapshot';
import { useArrivalClock } from '../features/arrivals/useArrivalClock';
import { config } from '../config';

export const REFRESH_SECONDS = config.polling.arrivalsSeconds;

interface StopSnapshot {
  stopCode: string;
  services: StopServiceArrivals[] | null;
  dataSource: ArrivalDataSource;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  result?: ArrivalSnapshot;
}

// Keep polling independent of the visible tab, and never expose another stop's snapshot.
export function useStopArrivals(stopCode: string) {
  const nowMs = useArrivalClock();
  const [snapshot, setSnapshot] = useState<StopSnapshot | null>(null);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const handledRefresh = useRef(0);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_SECONDS);
  const refresh = useCallback(() => setRefreshRequest((value) => value + 1), []);

  useEffect(() => {
    const forceRefresh = refreshRequest !== handledRefresh.current;
    handledRefresh.current = refreshRequest;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    let nextRefreshAt = 0;

    const load = async (forceRefresh = false) => {
      nextRefreshAt = 0;
      setSnapshot((previous) =>
        previous?.stopCode === stopCode
          ? { ...previous, isRefreshing: true }
          : { stopCode, services: null, dataSource: 'LOADING', lastUpdated: null, isRefreshing: true }
      );
      const result = await arrivalRepository.load(stopCode, { forceRefresh });
      const services = result.status === 'available' ? result.services : null;
      if (cancelled) return;
      setSnapshot({
        stopCode,
        services,
        dataSource: services === null ? 'FALLBACK_SIMULATED' : 'LTA_DATAMALL_V3',
        result,
        lastUpdated: new Date(result.receivedAtMs),
        isRefreshing: false,
      });
      nextRefreshAt = Date.now() + REFRESH_SECONDS * 1000;
      setSecondsUntilRefresh(REFRESH_SECONDS);
      // Schedule after completion so slow requests cannot overlap or overwrite newer results.
      refreshTimer = setTimeout(load, REFRESH_SECONDS * 1000);
    };

    load(forceRefresh);
    const countdownTimer = setInterval(() => {
      if (nextRefreshAt) setSecondsUntilRefresh(Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000)));
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      clearInterval(countdownTimer);
    };
  }, [stopCode, refreshRequest]);

  const current = snapshot?.stopCode === stopCode ? snapshot : null;
  return {
    services: useMemo(() => ageServices(current?.services ?? null, nowMs), [current, nowMs]),
    snapshotStatus: current?.result?.status ?? 'loading',
    receivedAtMs: current?.result?.receivedAtMs ?? null,
    dataSource: current?.dataSource ?? ('LOADING' as const),
    lastUpdated: current?.lastUpdated ?? null,
    isRefreshing: current?.isRefreshing ?? true,
    secondsUntilRefresh,
    refresh,
  };
}
