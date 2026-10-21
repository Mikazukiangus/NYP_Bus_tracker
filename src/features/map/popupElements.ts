import type { BusStop, TrafficIncident, JourneyOverlay } from '../../types/bus';
import { element } from './dom';

export function textPopup(heading: string, body: string) {
  const node = element('div', 'font-sans text-xs');
  node.append(element('div', 'font-black text-helvetia-950 text-sm', heading), element('div', 'text-warm-700', body));
  return node;
}
export function userPopup(name: string) {
  const node = element('div', 'font-sans text-xs');
  node.append(element('strong', 'text-helvetia-900', 'Your Location'), element('br'), element('span', 'text-warm-600', name));
  return node;
}
export function incidentPopup(incident: TrafficIncident) {
  const node = element('div', 'font-sans text-xs max-w-[240px]');
  node.append(element('div', 'font-black text-amber-800 text-sm', incident.type), element('div', 'text-warm-700 mt-1', incident.message),
    element('div', 'text-[10px] text-warm-500 mt-1.5', 'LTA traffic incident near this route'));
  return node;
}
export function stopPopup(stop: BusStop, nearest: boolean, alightLabel: string | null, onSelect: () => void) {
  const node = element('div', 'font-sans text-xs');
  node.append(element('div', 'font-black text-helvetia-950 text-sm', stop.name),
    element('div', 'text-warm-500 text-[11px] font-mono mb-1', `Stop ${stop.code} • ${stop.road}`));
  if (nearest) node.append(element('span', 'bg-lemon-soft text-helvetia-950 text-[10px] font-bold px-1.5 py-0.5 rounded', 'Nearest Stop to You'), element('br'));
  if (alightLabel) node.append(element('span', 'bg-helvetia-950 text-lemon text-[10px] font-bold px-1.5 py-0.5 rounded', alightLabel), element('br'));
  const action = element('div', 'mt-2 text-right');
  const button = element('button', 'bg-helvetia text-white text-xs font-bold px-3 py-1.5 rounded-md', 'View Arrivals');
  button.type = 'button'; button.addEventListener('click', onSelect);
  action.append(button); node.append(action);
  return node;
}

export function boardingPopup(leg: JourneyOverlay['legs'][number], previous?: JourneyOverlay['legs'][number]) {
  if (!previous) return textPopup(`Board Bus ${leg.serviceNo}`, `${leg.board.name} · ${leg.board.code}`);
  const sameStop = previous.alight.code === leg.board.code;
  const node = textPopup('Change buses', `${sameStop ? 'Get off' : `Get off at ${previous.alight.name} · ${previous.alight.code}, then walk to`} Bus ${previous.serviceNo}${sameStop ? ' and take' : ''}`);
  node.append(element('div', 'text-warm-700', `${sameStop ? '' : 'board '}Bus ${leg.serviceNo} at ${leg.board.name} · ${leg.board.code}`));
  return node;
}
