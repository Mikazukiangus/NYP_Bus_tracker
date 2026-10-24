import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsSelectionResult } from './useUserLocation';

export function useGpsRequest(selectGps: (signal: AbortSignal) => Promise<GpsSelectionResult>, enabled = true) {
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    setIsLocating(false);
  }, []);
  useEffect(() => {
    setIsLocating(false);
    setError(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [enabled]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);
  const start = useCallback(async () => {
    if (!enabled) return false;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setIsLocating(true);
    setError(null);
    const result = await selectGps(controller.signal);
    if (controller.signal.aborted || pending.current !== controller) return false;
    pending.current = null;
    setIsLocating(false);
    if ('error' in result) setError(result.error);
    return 'location' in result;
  }, [selectGps, enabled]);
  return { isLocating, error, start, cancel };
}
