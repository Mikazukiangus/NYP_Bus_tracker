import { useEffect, useState } from 'react';
// One clock per polling owner; all estimates in its snapshot age together.
export function useArrivalClock(enabled = true): number {
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return nowMs;
}
