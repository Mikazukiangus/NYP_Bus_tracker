import React from 'react';
import type { BusType } from '../types/bus';
import { BUS_ARTWORK } from '../graphics/busArtwork';
export { BUS_TYPE_NAME, BUS_TYPE_SHORT } from '../graphics/busArtwork';

export const BusTypeIcon: React.FC<{ type: BusType; className?: string }> = ({ type, className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor"
    strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
    {(Object.hasOwn(BUS_ARTWORK, type) ? BUS_ARTWORK[type] : []).map(({ tag, attributes }, i) => React.createElement(tag, { ...attributes, key: i }))}
  </svg>
);
