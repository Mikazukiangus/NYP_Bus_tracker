import React from 'react';
import type { BusType } from '../types/bus';

// LTA BusArrival gives the type of each bus that is coming (not of a service: many services run both)
export const BUS_TYPE_NAME: Record<BusType, string> = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy bus' };
export const BUS_TYPE_SHORT: Record<BusType, string> = { SD: 'Single', DD: 'Double', BD: 'Bendy' };

// Side views on a 24 x 24 grid: one row of windows, two rows, or two joined carriages
const WHEEL = (cx: number) => `<circle cx="${cx}" cy="18" r="2" fill="currentColor" stroke="none"/>`;
const WINDOWS = (x: number, y: number, w: number) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx=".75" fill="currentColor" stroke="none"/>`;
const SHAPES: Record<BusType, string> = {
  SD: `<rect x="1.5" y="7" width="21" height="10.5" rx="2"/>${WINDOWS(4, 9.5, 16)}${WHEEL(6.5)}${WHEEL(17.5)}`,
  DD: `<rect x="1.5" y="2" width="21" height="15.5" rx="2"/>${WINDOWS(4, 4.5, 16)}${WINDOWS(4, 10, 16)}${WHEEL(6.5)}${WHEEL(17.5)}`,
  BD: `<rect x=".75" y="7" width="10.5" height="10.5" rx="1.5"/><rect x="12.75" y="7" width="10.5" height="10.5" rx="1.5"/><path d="M11.25 10h1.5M11.25 14.5h1.5"/>${WINDOWS(2.75, 9.5, 6.5)}${WINDOWS(14.75, 9.5, 6.5)}${WHEEL(4.5)}${WHEEL(15)}${WHEEL(20)}`,
};

// For map markers, which are HTML strings
export const busTypeSvg = (type: BusType, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true">${SHAPES[type]}</svg>`;

export const BusTypeIcon: React.FC<{ type: BusType; className?: string }> = ({ type, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    className={`shrink-0 ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinejoin="round"
    aria-hidden="true"
    // Static shapes from this file only
    dangerouslySetInnerHTML={{ __html: SHAPES[type] }}
  />
);

// Icon and name, e.g. for the next bus in a list of services
export const BusTypeTag: React.FC<{ type?: BusType; className?: string }> = ({ type, className = '' }) =>
  type ? (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold text-warm-600 ${className}`} title={BUS_TYPE_NAME[type]}>
      <BusTypeIcon type={type} className="w-4 h-4" />
      {BUS_TYPE_SHORT[type]}
    </span>
  ) : null;
