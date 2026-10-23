import type { AlarmRide } from '../features/alarm/model';
export type { AlarmRide } from '../features/alarm/model';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type RideProgress, rideProgress } from './getOffAlarm';
import { config } from '../config';
import { parseGpsCoordinates } from '../../shared/geo/gps';

export type AlarmAlert = 'next-stop' | 'get-off';
export interface GetOffAlarm {
  supported: boolean;
  on: boolean;
  gps: 'waiting' | 'ok' | 'weak' | 'denied' | 'unavailable';
  sound: 'idle' | 'starting' | 'ready' | 'unavailable';
  screen: 'idle' | 'requesting' | 'active' | 'unavailable';
  vibration: 'available' | 'unavailable';
  progress: RideProgress | null;
  alert: AlarmAlert | null;
  toggle: () => void;
  dismiss: () => void;
}
const VIBRATE: Record<AlarmAlert, number[]> = {
  'next-stop': [250, 150, 250],
  'get-off': [600, 200, 600, 200, 600],
};
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

// GPS owns the visual alarm; sound, vibration and screen lock are separate, fallible capabilities.
export function useGetOffAlarm(ride: AlarmRide | null): GetOffAlarm {
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const [on, setOn] = useState(false);
  const [gps, setGps] = useState<GetOffAlarm['gps']>('waiting');
  const [sound, setSound] = useState<GetOffAlarm['sound']>('idle');
  const [screen, setScreen] = useState<GetOffAlarm['screen']>('idle');
  const [vibration, setVibration] = useState<GetOffAlarm['vibration']>(
    () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? 'available' : 'unavailable');
  const [progress, setProgress] = useState<RideProgress | null>(null);
  const [alert, setAlert] = useState<AlarmAlert | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const generation = useRef(0);
  const stops = useRef(ride?.stops ?? []);
  stops.current = ride?.stops ?? [];
  const key = ride?.key ?? '';

  useEffect(() => {
    enabled.current = false;
    generation.current++;
    setOn(false);
    setSound('idle');
    setProgress(null);
    setAlert(null);
  }, [key]);

  const ring = useCallback((kind: AlarmAlert) => {
    try {
      if (!navigator.vibrate?.(VIBRATE[kind])) setVibration('unavailable');
    } catch { setVibration('unavailable'); }
    try {
      if (audio.current?.state === 'running') beep(audio.current, kind === 'get-off' ? 3 : 2);
      else setSound('unavailable');
    } catch { setSound('unavailable'); }
  }, []);

  useEffect(() => {
    if (!on || !key) return;
    let active = true;
    let fromSegment = 0;
    let rung = 0;
    let id: number;
    try {
      id = navigator.geolocation.watchPosition((pos) => {
        if (!active) return;
        const coords = parseGpsCoordinates(pos?.coords);
        if (!coords) { setGps('weak'); return; }
        const p = rideProgress(stops.current,
          { lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy }, fromSegment);
        setGps(p ? 'ok' : 'weak');
        if (!p) return;
        if (p.phase !== 'off-route') fromSegment = p.segment;
        setProgress(p);
        if (p.phase === 'get-off' && rung < 2) {
          rung = 2;
          ring('get-off');
          setAlert('get-off');
          enabled.current = false;
          generation.current++;
          setOn(false);
        } else if (p.phase === 'next-stop' && rung < 1) {
          rung = 1;
          ring('next-stop');
          setAlert('next-stop');
        }
      }, (err) => {
        if (!active) return;
        if (err.code === 1) {
          setGps('denied');
          enabled.current = false;
          generation.current++;
          setOn(false);
        } else setGps('weak');
      }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: config.timeouts.alarmGpsMs });
    } catch {
      setGps('unavailable');
      enabled.current = false;
      generation.current++;
      setOn(false);
    }
    return () => { active = false; if (id !== undefined) navigator.geolocation.clearWatch(id); };
  }, [on, key, ring]);

  useEffect(() => {
    if (!on) { setScreen('idle'); return; }
    if (!('wakeLock' in navigator)) { setScreen('unavailable'); return; }
    let lock: WakeLockSentinel | null = null;
    let active = true;
    let pending = false;
    const released = () => { if (active) setScreen('unavailable'); };
    const acquire = async () => {
      if (document.visibilityState !== 'visible') { setScreen('unavailable'); return; }
      if (pending || lock && !lock.released) return;
      pending = true;
      setScreen('requesting');
      try {
        const next = await navigator.wakeLock.request('screen');
        if (!active || document.visibilityState !== 'visible') {
          void next.release().catch(() => {});
          if (active) setScreen('unavailable');
          return;
        }
        lock?.removeEventListener('release', released);
        lock = next;
        lock.addEventListener('release', released);
        setScreen(lock.released ? 'unavailable' : 'active');
      } catch { if (active) setScreen('unavailable'); }
      finally { pending = false; }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      lock?.removeEventListener('release', released);
      void lock?.release().catch(() => {});
    };
  }, [on]);

  useEffect(() => () => {
    enabled.current = false;
    generation.current++;
    if (audio.current) {
      audio.current.onstatechange = null;
      void audio.current.close().catch(() => {});
      audio.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    setAlert(null);
    const attempt = ++generation.current;
    if (enabled.current) {
      enabled.current = false;
      setOn(false);
      setSound('idle');
      return;
    }
    if (!supported || !key) { setGps('unavailable'); return; }
    enabled.current = true;
    setGps('waiting');
    setProgress(null);
    setOn(true);
    // Initialize from the tap, while reporting constructor/resume failures without disabling visual alerts.
    setSound('starting');
    try {
      if (typeof AudioContext === 'undefined') throw new Error('Audio unavailable');
      if (!audio.current || audio.current.state === 'closed') audio.current = new AudioContext();
      const ctx = audio.current;
      ctx.onstatechange = () => {
        if (enabled.current) setSound(ctx.state === 'running' ? 'ready' : 'unavailable');
      };
      void ctx.resume().then(() => {
        if (generation.current === attempt && enabled.current) setSound(ctx.state === 'running' ? 'ready' : 'unavailable');
      }).catch(() => {
        if (generation.current === attempt && enabled.current) setSound('unavailable');
      });
    } catch { setSound('unavailable'); }
  }, [supported, key]);
  const dismiss = useCallback(() => setAlert(null), []);
  return { supported, on, gps, sound, screen, vibration, progress, alert, toggle, dismiss };
}
