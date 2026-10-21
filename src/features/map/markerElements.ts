import type { IncomingBus } from '../../types/bus';
import { BUS_TYPE_NAME } from '../../graphics/busArtwork';
import type { StopEtas } from './model';
import { element } from './dom';
import { busTypeIcon, liveSignalIcon } from './svg';

const ORDINAL_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;
const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' } as const;
const LOAD_COLOR = { SEA: 'var(--color-green-blue)', SDA: '#f59e0b', LSD: '#ef4444' } as const;
const own = <T extends object>(values: T, key: PropertyKey): T[keyof T] | undefined => Object.hasOwn(values, key) ? values[key as keyof T] : undefined;
const etaLabel = (minutes: number) => Number.isFinite(minutes) ? minutes <= 0 ? 'Arr' : `${minutes} min` : '—';

export function etaCallout(etas: StopEtas, withBadge: boolean) {
  const row = element('span');
  Object.assign(row.style, { display: 'inline-flex', alignItems: 'center', gap: '6px' });
  if (withBadge) {
    const badge = element('span', '', etas.serviceNo);
    Object.assign(badge.style, { background: 'var(--color-helvetia)', color: 'white', fontWeight: '900', borderRadius: '9999px', padding: '2px 8px', marginLeft: '-6px' });
    row.append(badge);
  }
  const times = element('span');
  if (etas.live) times.append(liveSignalIcon());
  times.append('in ');
  etas.minutes.forEach((minutes, index) => {
    if (index) times.append(', ');
    const text = Number.isFinite(minutes) ? minutes <= 0 ? 'Arr' : String(minutes) : '—';
    if (index === 0 && Number.isFinite(minutes) && minutes > 0) {
      const bold = element('b', '', text);
      Object.assign(bold.style, { fontSize: '14px', fontWeight: '900' });
      times.append(bold);
    } else times.append(text);
  });
  times.append(' min'); row.append(times);
  return row;
}

export function busMarker(bus: IncomingBus) {
  const node = element('div', 'flex flex-col items-center');
  const badge = element('div', 'w-9 h-9 rounded-xl bg-helvetia text-white flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-helvetia-400/40 relative');
  const load = element('div', 'w-4 h-1 rounded-full mt-0.5');
  load.style.backgroundColor = own(LOAD_COLOR, bus.load) ?? '';
  badge.append(element('span', 'text-[10px] font-black leading-none', bus.serviceNo), load,
    element('span', 'absolute -top-2 -right-2 bg-white text-helvetia border border-helvetia-200 text-[8px] font-black px-1 rounded-full', bus.ordinal));
  const eta = element('span', 'mt-0.5 bg-warm-900/85 text-white text-[10px] font-bold px-1.5 rounded whitespace-nowrap flex items-center gap-1', etaLabel(bus.etaMinutes));
  if (bus.type && own(BUS_TYPE_NAME, bus.type)) {
    const icon = element('span', 'flex'); icon.title = BUS_TYPE_NAME[bus.type]; icon.append(busTypeIcon(bus.type, 13)); eta.append(icon);
  }
  node.append(badge, eta); return node;
}

export function busPopup(bus: IncomingBus, stopName: string) {
  const node = element('div', 'font-sans text-xs min-w-[190px]');
  const heading = element('div', 'flex items-center justify-between border-b pb-1 mb-1.5 gap-2');
  heading.append(element('strong', 'text-sm font-black text-helvetia-900', `Bus ${bus.serviceNo}`),
    element('span', 'text-[10px] font-bold bg-helvetia-50 text-helvetia-900 px-1.5 py-0.5 rounded', `${own(ORDINAL_LABEL, bus.ordinal) ?? '—'} bus`));
  const arrival = element('div', 'text-warm-700');
  arrival.append('Arriving at ', element('strong', '', stopName), ': ', element('strong', '', etaLabel(bus.etaMinutes)));
  node.append(heading, arrival);
  if (bus.type && own(BUS_TYPE_NAME, bus.type)) {
    const type = element('div', 'mt-1 flex items-center gap-1 font-bold text-warm-800');
    type.append(busTypeIcon(bus.type, 16), BUS_TYPE_NAME[bus.type]); node.append(type);
  }
  node.append(element('div', 'text-[11px] text-warm-600 mt-0.5', `${own(LOAD_LABEL, bus.load) ?? 'Load unavailable'}${bus.feature === 'WAB' ? ' • Wheelchair accessible' : ''}`),
    element('div', 'text-[10px] text-warm-500 mt-1.5', 'GPS position from LTA DataMall'));
  return node;
}
