import type { BusType } from '../types/bus';

export const BUS_TYPE_NAME: Record<BusType, string> = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy bus' };
export const BUS_TYPE_SHORT: Record<BusType, string> = { SD: 'Single', DD: 'Double', BD: 'Bendy' };
type Shape = { tag: 'rect' | 'circle' | 'path'; attributes: Readonly<Record<string, string | number>> };
const wheel = (cx: number): Shape => ({ tag: 'circle', attributes: { cx, cy: 18, r: 2, fill: 'currentColor', stroke: 'none' } });
const windows = (x: number, y: number, width: number): Shape => ({ tag: 'rect', attributes: { x, y, width, height: 3, rx: .75, fill: 'currentColor', stroke: 'none' } });
// Fixed artwork shared by the React icon and DOM-created Leaflet markers. Never provider SVG.
export const BUS_ARTWORK: Record<BusType, readonly Shape[]> = {
  SD: [{ tag: 'rect', attributes: { x: 1.5, y: 7, width: 21, height: 10.5, rx: 2 } }, windows(4, 9.5, 16), wheel(6.5), wheel(17.5)],
  DD: [{ tag: 'rect', attributes: { x: 1.5, y: 2, width: 21, height: 15.5, rx: 2 } }, windows(4, 4.5, 16), windows(4, 10, 16), wheel(6.5), wheel(17.5)],
  BD: [{ tag: 'rect', attributes: { x: .75, y: 7, width: 10.5, height: 10.5, rx: 1.5 } },
    { tag: 'rect', attributes: { x: 12.75, y: 7, width: 10.5, height: 10.5, rx: 1.5 } },
    { tag: 'path', attributes: { d: 'M11.25 10h1.5M11.25 14.5h1.5' } }, windows(2.75, 9.5, 6.5), windows(14.75, 9.5, 6.5), wheel(4.5), wheel(15), wheel(20)],
};
