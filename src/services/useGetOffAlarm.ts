import { useCallback, useEffect, useRef, useState } from 'react';
import type { StopRef } from '../types/bus';
import { RideProgress, rideProgress } from './getOffAlarm';

// The bus ride the alarm is for: the tracked bus from its boarding stop to the stop to get off at
export interface AlarmRide {
  key: string; // a different bus or stop is a new ride, and turns the alarm off
  serviceNo: string;
  stops: StopRef[]; // boarding stop first, the stop to get off at last
}

export type AlarmAlert = 'next-stop' | 'get-off';

export interface GetOffAlarm {
  supported: boolean;
  on: boolean;
  gps: 'waiting' | 'ok' | 'weak' | 'denied';
  progress: RideProgress | null;
  alert: AlarmAlert | null; // the last alarm, shown until dismissed
  toggle: () => void;
  dismiss: () => void;
}

const VIBRATE: Record<AlarmAlert, number[]> = {
  'next-stop': [250, 150, 250],
  'get-off': [600, 200, 600, 200, 600],
};

// Short, rising beeps (Web Audio, so there's no sound file to load)
function beep(ctx: AudioContext, times: number) {
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + i * 0.32;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880 + i * 220;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  }
}

// Citymapper's "Get off now" alarm, opt in. While it's on: follows the phone's GPS along the ride, buzzes and beeps
// as the bus leaves the stop before yours and again as it nears yours, and keeps the screen on. A web page can't
// run in the background, so it works while this page is open.
export function useGetOffAlarm(ride: AlarmRide | null): GetOffAlarm {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [on, setOn] = useState(false);
  const [gps, setGps] = useState<GetOffAlarm['gps']>('waiting');
  const [progress, setProgress] = useState<RideProgress | null>(null);
  const [alert, setAlert] = useState<AlarmAlert | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const stops = useRef(ride?.stops ?? []);
  stops.current = ride?.stops ?? [];

  // Another ride turns the alarm off
  const key = ride?.key ?? '';
  useEffect(() => {
    setOn(false);
    setProgress(null);
    setAlert(null);
  }, [key]);

  const ring = useCallback((kind: AlarmAlert) => {
    navigator.vibrate?.(VIBRATE[kind]);
    if (audio.current) beep(audio.current, kind === 'get-off' ? 3 : 2);
  }, []);

  // Follow the GPS along the ride; each alarm goes off once
  useEffect(() => {
    if (!on || !key) return;
    let fromSegment = 0;
    let rung = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = rideProgress(
          stops.current,
          { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy },
          fromSegment
        );
        setGps(p ? 'ok' : 'weak');
        if (!p) return;
        if (p.phase !== 'off-route') fromSegment = p.segment;
        setProgress(p);
        if (p.phase === 'get-off' && rung < 2) {
          rung = 2;
          ring('get-off');
          setAlert('get-off');
          setOn(false); // its job is done
        } else if (p.phase === 'next-stop' && rung < 1) {
          rung = 1;
          ring('next-stop');
          setAlert('next-stop');
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps('denied');
          setOn(false);
        } else setGps('weak');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on, key, ring]);

  // Keep the screen on while the alarm is set (the lock lapses when the page is hidden, so take it again on return)
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (active) lock = l;
          else l.release().catch(() => {});
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [on]);

  useEffect(() => () => void audio.current?.close().catch(() => {}), []);

  const toggle = useCallback(() => {
    setAlert(null);
    if (on) {
      setOn(false);
      return;
    }
    // Sound can only start from a tap, so get it ready now
    if (!audio.current && typeof AudioContext !== 'undefined') audio.current = new AudioContext();
    audio.current?.resume().catch(() => {});
    setGps('waiting');
    setProgress(null);
    setOn(true);
  }, [on]);

  const dismiss = useCallback(() => setAlert(null), []);

  return { supported, on, gps, progress, alert, toggle, dismiss };
}
