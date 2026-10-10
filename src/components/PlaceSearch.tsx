import React, { useEffect, useId, useRef, useState } from 'react';
import { BusFront, Building2, Clock, Hash, Home, Loader2, MapPin, Search, X } from 'lucide-react';
import type { BusNetwork } from '../services/busNetwork';
import { PlaceKind, PlaceResult, isPostalCode, usePlaceSearch } from '../services/placeSearch';

interface PlaceSearchProps {
  network: BusNetwork | null;
  onSelect: (place: PlaceResult) => void;
  placeholder: string;
  label: string; // accessible name
  recent?: PlaceResult[]; // offered when the field is focused and empty
  // 'dropdown' floats results under the field; 'inline' lists them in the page flow (e.g. in a dialog)
  variant?: 'dropdown' | 'inline';
  value?: string; // text shown after a place is chosen
  onClear?: () => void;
  autoFocus?: boolean;
  icon?: React.ReactNode;
  inputClassName?: string;
}

const KIND_ICON: Record<PlaceKind, React.ElementType> = {
  place: Building2,
  address: Home,
  postal: Hash,
  stop: BusFront,
};

export const PlaceSearch: React.FC<PlaceSearchProps> = ({
  network,
  onSelect,
  placeholder,
  label,
  recent = [],
  variant = 'dropdown',
  value = '',
  onClear,
  autoFocus,
  icon,
  inputClassName = '',
}) => {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the chosen place's name when it changes elsewhere (or clear it)
  useEffect(() => setQuery(value), [value]);

  const typed = query.trim() !== '' && query !== value;
  const search = usePlaceSearch(typed ? query : '', network);
  const showRecent = !typed && recent.length > 0;
  const items = typed ? search.results : showRecent ? recent : [];
  const open = isOpen && (variant === 'inline' ? typed : typed || showRecent);

  useEffect(() => setHighlight(0), [query, search.results]);

  // Close the dropdown when focus or a click goes elsewhere
  useEffect(() => {
    if (!isOpen || variant === 'inline') return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [isOpen, variant]);

  const choose = (place: PlaceResult) => {
    onSelect(place);
    setIsOpen(false);
    setQuery(place.name);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[highlight]) choose(items[highlight]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      if (value) setQuery(value);
    }
  };

  const statusText = (() => {
    if (!typed) return null;
    if (search.status === 'loading' && !search.results.length) return 'Searching…';
    if (search.status === 'done' && !search.results.length) {
      if (search.addressSearchFailed) return 'Address search is unavailable right now. Try a bus stop name or 5-digit stop code.';
      return isPostalCode(query)
        ? `No address found for postal code ${query.trim()}.`
        : 'No matches. Try a 6-digit postal code, a landmark or a bus stop name.';
    }
    if (search.addressSearchFailed) return 'Address search is unavailable right now; showing bus stops only.';
    return null;
  })();

  const list = open && (
    <div
      className={
        variant === 'dropdown'
          ? 'absolute left-0 right-0 top-full mt-1.5 z-[1100] bg-white rounded-xl border border-warm-200 shadow-xl overflow-hidden'
          : 'mt-2 rounded-xl border border-warm-200 overflow-hidden'
      }
    >
      {showRecent && (
        <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-warm-500">Recent</div>
      )}
      {items.length > 0 && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-72 overflow-y-auto divide-y divide-warm-100">
          {items.map((place, i) => {
            const Icon = showRecent ? Clock : KIND_ICON[place.kind];
            return (
              <li
                key={place.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                onPointerDown={(e) => e.preventDefault()} // keep focus so the click lands
                onClick={() => choose(place)}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2.5 flex items-start gap-2.5 cursor-pointer text-left ${
                  i === highlight ? 'bg-helvetia-50' : 'bg-white'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${place.kind === 'stop' ? 'text-helvetia' : 'text-green-blue-ink'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-warm-900 truncate">{place.name}</div>
                  {place.subtitle && <div className="text-xs text-warm-500 truncate">{place.subtitle}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {statusText && (
        <div className="px-3 py-2.5 text-xs text-warm-600 flex items-center gap-2 bg-warm-50 border-t border-warm-100 first:border-t-0">
          {search.status === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-helvetia shrink-0" />}
          <span>{statusText}</span>
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px] text-warm-500 bg-warm-50 border-t border-warm-100">
        Addresses &amp; postal codes: OneMap (SLA) · Bus stops: LTA
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-3.5 text-warm-500 pointer-events-none flex items-center">
          {icon ?? <Search className="w-5 h-5" />}
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={!!open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[highlight] ? `${listId}-${highlight}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            // Make it easy to type a new place over the chosen one
            if (value && query === value) inputRef.current?.select();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          className={`w-full pl-11 pr-10 bg-warm-50 border border-warm-300 rounded-xl text-warm-900 placeholder:text-warm-500 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia focus:border-transparent transition-all ${inputClassName}`}
        />
        {query && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              setQuery('');
              onClear?.();
              inputRef.current?.focus();
            }}
            className="absolute right-2 p-1.5 text-warm-500 hover:text-warm-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {list}
    </div>
  );
};

export const PlaceKindIcon: React.FC<{ kind?: PlaceKind; className?: string }> = ({ kind, className }) => {
  const Icon = kind ? KIND_ICON[kind] : MapPin;
  return <Icon className={className} />;
};
