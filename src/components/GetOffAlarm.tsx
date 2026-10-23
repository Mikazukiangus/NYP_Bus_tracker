import React from 'react';
import { AlarmClock, Bell, BellRing, BusFront, Flag } from 'lucide-react';
import type { StopRef } from '../types/bus';
import type { AlarmAlert, GetOffAlarm } from '../services/useGetOffAlarm';

const stopsToGo = (n: number) => `${n} stop${n === 1 ? '' : 's'}`;

// What the alarm is doing, in a few words. Short: for the next-bus bar, which has room for one line.
export function alarmStatus(alarm: GetOffAlarm, serviceNo: string, stopName: string, short = false): string {
  const p = alarm.progress;
  if (!alarm.on) {
    if (alarm.gps === 'denied') return 'Location is blocked for this site: allow it to use the alarm';
    if (alarm.gps === 'unavailable') return 'Location is unavailable. Try turning the alarm on again.';
    if (p?.phase === 'get-off') return `You're at ${stopName}`;
    return 'Alerts you near your stop. Sound and vibration depend on your browser. Keep this page open.';
  }
  const capabilities = [
    alarm.sound === 'unavailable' ? 'Sound unavailable' : alarm.sound === 'starting' ? 'Starting sound' : null,
    !short && alarm.vibration === 'unavailable' ? 'Vibration unavailable' : null,
    alarm.screen === 'unavailable' ? 'Screen may turn off' : !short && alarm.screen === 'active' ? 'Screen kept on'
      : !short && alarm.screen === 'requesting' ? 'Requesting screen lock' : null,
  ].filter(Boolean);
  const status = (text: string) => [text, ...capabilities].join(' · ');
  if (!p) return status(alarm.gps === 'weak' ? 'Alarm on · waiting for a GPS fix' : 'Alarm on · finding you');
  switch (p.phase) {
    case 'off-route':
      return status(short ? `Alarm set for ${stopName}` : `Alarm on · starts once you're on Bus ${serviceNo}`);
    case 'riding':
      return status(short ? `${stopsToGo(p.stopsToGo)} to ${stopName}` : `Alarm on · ${stopsToGo(p.stopsToGo)} to go`);
    default:
      return status(short ? `${stopName} is next: ring the bell` : 'Alarm on · your stop is next: ring the bell');
  }
}

// Transit's ride progress: a track that fills as the bus passes stops, the bus where you are and the flag at your stop
const RideProgressBar: React.FC<{ stopsToGo: number; stopCount: number }> = ({ stopsToGo, stopCount }) => {
  const share = Math.min(1, Math.max(0, (stopCount - stopsToGo) / stopCount));
  return (
    <div className="basis-full flex items-center gap-2 pt-1.5" aria-hidden="true">
      <div className="relative flex-1 h-1.5 rounded-full bg-helvetia-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-helvetia transition-[width] duration-700" style={{ width: `${share * 100}%` }} />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-helvetia-950 text-lemon flex items-center justify-center ring-2 ring-white transition-[left] duration-700"
          style={{ left: `${share * 100}%` }}
        >
          <BusFront className="w-3 h-3" />
        </span>
      </div>
      <Flag className="w-3.5 h-3.5 text-helvetia-950 shrink-0" />
    </div>
  );
};

// The option, as a switch, in the "Get off at" box
export const GetOffAlarmSwitch: React.FC<{ alarm: GetOffAlarm; serviceNo: string; stopName: string; stopCount: number }> = ({
  alarm,
  serviceNo,
  stopName,
  stopCount,
}) => (
  <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
    <button
      type="button"
      role="switch"
      aria-checked={alarm.on}
      onClick={alarm.toggle}
      className={`shrink-0 flex items-center gap-1.5 text-xs font-bold pl-2 pr-1.5 py-1.5 rounded-lg border transition-colors ${
        alarm.on
          ? 'bg-helvetia-950 border-helvetia-950 text-white'
          : 'bg-white border-helvetia-200 text-helvetia hover:bg-helvetia-50'
      }`}
    >
      {alarm.on ? <BellRing className="w-3.5 h-3.5 text-lemon" /> : <Bell className="w-3.5 h-3.5" />}
      Get-off alarm
      <span
        aria-hidden="true"
        className={`ml-0.5 w-7 h-4 rounded-full p-0.5 flex transition-colors ${alarm.on ? 'bg-lemon justify-end' : 'bg-warm-300 justify-start'}`}
      >
        <span className={`w-3 h-3 rounded-full ${alarm.on ? 'bg-helvetia-950' : 'bg-white'}`} />
      </span>
    </button>
    <span
      className={`min-w-[12rem] flex-1 text-[11px] leading-snug ${alarm.on ? 'font-bold text-helvetia-950' : 'text-warm-600'}`}
      aria-live="polite"
    >
      {alarmStatus(alarm, serviceNo, stopName)}
    </span>
    {alarm.on && alarm.progress && alarm.progress.phase !== 'off-route' && (
      <RideProgressBar stopsToGo={alarm.progress.stopsToGo} stopCount={stopCount} />
    )}
  </div>
);

// Citymapper's alert bubble with the alarm clock, over everything: "Your stop is next" (ring the bell) in Helvetia
// blue, then "Get off now" in lemon
export const GetOffBanner: React.FC<{ alert: AlarmAlert; stop: StopRef; then?: string; onDismiss: () => void }> = ({
  alert,
  stop,
  then,
  onDismiss,
}) => {
  const getOff = alert === 'get-off';
  return (
    <div
      role="alert"
      className="fixed inset-x-3 z-[2100] sm:left-auto sm:right-4 sm:w-[24rem]"
      style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <div
        className={`rounded-2xl shadow-2xl ring-1 px-3.5 py-3 flex items-center gap-3 ${
          getOff ? 'bg-lemon text-helvetia-950 ring-helvetia-950/15' : 'bg-helvetia-950 text-white ring-white/10'
        }`}
      >
        <span
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
            getOff ? 'bg-helvetia-950 text-lemon' : 'bg-lemon text-helvetia-950'
          }`}
          aria-hidden="true"
        >
          <AlarmClock className="w-6 h-6 alarm-ring" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black leading-tight">{getOff ? 'Get off now' : 'Your stop is next'}</p>
          <p className="text-sm font-semibold leading-snug">
            {getOff ? 'at ' : 'Ring the bell for '}
            {stop.name} <span className="font-mono text-[11px] opacity-70">{stop.code}</span>
          </p>
          {then && <p className={`text-xs leading-snug ${getOff ? 'text-helvetia-900' : 'text-helvetia-200'}`}>{then}</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`shrink-0 self-start text-sm font-bold px-3 py-1.5 rounded-lg ${
            getOff ? 'bg-helvetia-950 text-white' : 'bg-white/15 text-white hover:bg-white/25'
          }`}
        >
          OK
        </button>
      </div>
    </div>
  );
};
