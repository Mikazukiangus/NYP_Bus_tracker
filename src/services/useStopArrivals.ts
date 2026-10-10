import { useCallback, useEffect, useState } from 'react';
import type { ArrivalDataSource, StopServiceArrivals } from '../types/bus';
import { fetchStopArrivals } from './busTrackerService';

const REFRESH_SECONDS = 15;

interface StopSnapshot {
  stopCode: string;
  services: StopServiceArrivals[] | null;
  dataSource: ArrivalDataSource;
  lastUpdated: Date | null;
  isRefreshing: boolean;
}

// Keep polling independent of the visible tab, and never expose another stop's snapshot.
export function useStopArrivals(stopCode: string) {
  const [snapshot, setSnapshot] = useState<StopSnapshot | null>(null);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_SECONDS);
  const refresh = useCallback(() => setRefreshRequest((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    let nextRefreshAt = 0;

    const load = async () => {
      nextRefreshAt = 0;
      setSnapshot((previous) =>
        previous?.stopCode === stopCode
          ? { ...previous, isRefreshing: true }
          : { stopCode, services: null, dataSource: 'LOADING', lastUpdated: null, isRefreshing: true }
      );
      const services = await fetchStopArrivals(stopCode);
      if (cancelled) return;
      setSnapshot({
        stopCode,
        services,
        dataSource: services === null ? 'FALLBACK_SIMULATED' : 'LTA_DATAMALL_V3',
        lastUpdated: new Date(),
        isRefreshing: false,
      });
      nextRefreshAt = Date.now() + REFRESH_SECONDS * 1000;
      setSecondsUntilRefresh(REFRESH_SECONDS);
      // Schedule after completion so slow requests cannot overlap or overwrite newer results.
      refreshTimer = setTimeout(load, REFRESH_SECONDS * 1000);
    };

    load();
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
    services: current?.services ?? null,
    dataSource: current?.dataSource ?? ('LOADING' as const),
    lastUpdated: current?.lastUpdated ?? null,
    isRefreshing: current?.isRefreshing ?? true,
    secondsUntilRefresh,
    refresh,
  };
}
