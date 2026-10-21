import type { BusType } from '../../types/bus';
import { BUS_ARTWORK } from '../../graphics/busArtwork';
function shape<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
function svg(size: number, strokeWidth: number) {
  const dimension = Number.isFinite(size) && size > 0 && size <= 128 ? size : 16;
  return shape('svg', { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
}
export function flagIcon(size: number) {
  const node = svg(size, 2.5);
  node.append(shape('path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }), shape('line', { x1: 4, x2: 4, y1: 22, y2: 15 }));
  return node;
}
export function changeIcon(size: number) {
  const node = svg(size, 2.75);
  for (const d of ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4']) node.append(shape('path', { d }));
  return node;
}
export function busTypeIcon(type: BusType, size: number) {
  const node = svg(size, 1.75);
  node.removeAttribute('stroke-linecap');
  for (const { tag, attributes } of Object.hasOwn(BUS_ARTWORK, type) ? BUS_ARTWORK[type] : []) node.append(shape(tag, attributes));
  return node;
}
export function liveSignalIcon() {
  const node = svg(11, 3.5);
  node.setAttribute('aria-label', 'Live GPS');
  node.removeAttribute('aria-hidden');
  node.setAttribute('stroke', 'var(--color-green-blue)');
  Object.assign(node.style, { display: 'inline', verticalAlign: '4px', marginRight: '1px' });
  node.append(shape('circle', { cx: 5, cy: 19, r: 2.75, fill: 'var(--color-green-blue)', stroke: 'none' }),
    shape('path', { class: 'live-signal-arc1', d: 'M5 11.5a7.5 7.5 0 0 1 7.5 7.5' }),
    shape('path', { class: 'live-signal-arc2', d: 'M5 4a15 15 0 0 1 15 15' }));
  return node;
}
