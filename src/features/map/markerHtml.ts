import type { IncomingBus } from '../../types/bus';
import { BUS_TYPE_NAME, busTypeSvg } from '../../components/BusTypeIcon';
import type { StopEtas } from './model';

export const ORDINAL_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;
export const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' } as const;
export const LOAD_COLOR = { SEA: 'var(--color-green-blue)', SDA: '#f59e0b', LSD: '#ef4444' } as const;

// Lucide "flag" icon, for the destination and get-off markers
export const flagSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
export const FLAG_SVG = flagSvg(14);
// Lucide "arrow-left-right", for changing buses
export const changeSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>`;

// The live sign (see LiveSignal), for the bubble over the tracked stop
const LIVE_SIGNAL_SVG =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--color-green-blue)" stroke-width="3.5" stroke-linecap="round" style="display:inline;vertical-align:4px;margin-right:1px" aria-label="Live GPS"><circle cx="5" cy="19" r="2.75" fill="var(--color-green-blue)" stroke="none"/><path class="live-signal-arc1" d="M5 11.5a7.5 7.5 0 0 1 7.5 7.5"/><path class="live-signal-arc2" d="M5 4a15 15 0 0 1 15 15"/></svg>';

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Citymapper's bubble over the stop: "72 · in 1, 9, 17 min" (the next one bigger), with the live sign for a
// GPS-tracked bus; without the number where a trip's boarding pill already shows it
export const etaCalloutHtml = (etas: StopEtas, withBadge: boolean) => {
  const times = etas.minutes.map((m, i) => (m <= 0 ? 'Arr' : i === 0 ? `<b style="font-size:14px;font-weight:900">${m}</b>` : String(m)));
  const badge = withBadge
    ? `<span style="background:var(--color-helvetia);color:white;font-weight:900;border-radius:9999px;padding:2px 8px;margin-left:-6px">${escapeHtml(etas.serviceNo)}</span>`
    : '';
  return `<span style="display:inline-flex;align-items:center;gap:6px">${badge}<span>${etas.live ? LIVE_SIGNAL_SVG : ''}in ${times.join(', ')} min</span></span>`;
};

export function busMarkerHtml(bus: IncomingBus): string {
  const eta = bus.etaMinutes <= 0 ? 'Arr' : `${bus.etaMinutes} min`;
  return `
          <div class="flex flex-col items-center">
            <div class="w-9 h-9 rounded-xl bg-helvetia text-white flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-helvetia-400/40 relative">
              <span class="text-[10px] font-black leading-none">${escapeHtml(bus.serviceNo)}</span>
              <div class="w-4 h-1 rounded-full mt-0.5" style="background-color: ${LOAD_COLOR[bus.load]}"></div>
              <span class="absolute -top-2 -right-2 bg-white text-helvetia border border-helvetia-200 text-[8px] font-black px-1 rounded-full">${bus.ordinal}</span>
            </div>
            <span class="mt-0.5 bg-warm-900/85 text-white text-[10px] font-bold px-1.5 rounded whitespace-nowrap flex items-center gap-1">${eta}${
              bus.type ? `<span title="${BUS_TYPE_NAME[bus.type]}" class="flex">${busTypeSvg(bus.type, 13)}</span>` : ''
            }</span>
          </div>
        `;
}

export function busPopupHtml(bus: IncomingBus, stopName: string): string {
  const eta = bus.etaMinutes <= 0 ? 'Arr' : `${bus.etaMinutes} min`;
  return `<div class="font-sans text-xs min-w-[190px]">
          <div class="flex items-center justify-between border-b pb-1 mb-1.5 gap-2">
            <strong class="text-sm font-black text-helvetia-900">Bus ${escapeHtml(bus.serviceNo)}</strong>
            <span class="text-[10px] font-bold bg-helvetia-50 text-helvetia-900 px-1.5 py-0.5 rounded">${ORDINAL_LABEL[bus.ordinal]} bus</span>
          </div>
          <div class="text-warm-700">Arriving at <strong>${escapeHtml(stopName)}</strong>: <strong>${eta}</strong></div>
          ${
            bus.type
              ? `<div class="mt-1 flex items-center gap-1 font-bold text-warm-800">${busTypeSvg(bus.type, 16)}${BUS_TYPE_NAME[bus.type]}</div>`
              : ''
          }
          <div class="text-[11px] text-warm-600 mt-0.5">${LOAD_LABEL[bus.load]}${bus.feature === 'WAB' ? ' • Wheelchair accessible' : ''}</div>
          <div class="text-[10px] text-warm-500 mt-1.5">GPS position from LTA DataMall</div>
        </div>`;
}
