import React from 'react';
import { FavoriteItem } from '../types/bus';
import { X, Trash2, Heart, ExternalLink, Clock } from 'lucide-react';
import type { FavoriteArrival } from '../services/favoriteArrivals';
import { formatEta, TrackingBadge } from './ArrivalBits';

// Compact "next bus" label for a favourite (used in the modal and the Arrivals tab mini card)
export const NextBusLabel: React.FC<{ arrival?: FavoriteArrival }> = ({ arrival }) => {
  if (!arrival || arrival.status === 'loading') return <span className="text-[11px] text-slate-400">…</span>;
  if (arrival.status === 'unavailable') return <span className="text-[11px] text-slate-400">Live times unavailable</span>;
  if (!arrival.nextBus) return <span className="text-[11px] text-slate-400">No estimate now</span>;
  return (
    <span className="flex items-center gap-1.5 text-[11px] shrink-0">
      <strong className={arrival.nextBus.estimatedMinutes <= 0 ? 'text-emerald-600 font-black' : 'text-slate-900'}>
        {formatEta(arrival.nextBus.estimatedMinutes)}
      </strong>
      <TrackingBadge bus={arrival.nextBus} compact />
    </span>
  );
};

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: FavoriteItem[];
  arrivals: Record<string, FavoriteArrival>;
  onRemoveFavorite: (id: string) => void;
  onSelectFavorite: (fav: FavoriteItem) => void;
}

export const FavoritesModal: React.FC<FavoritesModalProps> = ({
  isOpen,
  onClose,
  favorites,
  arrivals,
  onRemoveFavorite,
  onSelectFavorite
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <Heart className="w-4 h-4 fill-red-500 text-red-500" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                My Favourites ({favorites.length})
              </h2>
              <p className="text-xs text-slate-500">
                Quick access to your regular bus services & stops
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Favorites list body */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100">
          {favorites.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center">
              <Heart className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
              <p className="text-sm font-bold text-slate-700">No favourites saved yet</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Tap the heart button on any bus stop to bookmark your frequent commute stops for 1-tap arrival checks.
              </p>
            </div>
          ) : (
            favorites.map((fav) => {
              const arrival = arrivals[fav.id];

              return (
                <div
                  key={fav.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group hover:bg-slate-50 p-2.5 rounded-xl transition-all"
                >
                  <div
                    onClick={() => {
                      onSelectFavorite(fav);
                      onClose();
                    }}
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#602a85] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
                      {fav.serviceNo}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {fav.stopName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                          {fav.stopCode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        Towards {fav.destination.replace(' Bus Interchange', '')}
                      </div>

                      {/* Live arrival preview (LTA BusArrival) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px]">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="w-3 h-3 text-[#602a85]" />
                          <span>Next:</span>
                          <NextBusLabel arrival={arrival} />
                        </span>
                        {arrival?.status === 'ok' && arrival.nextBus2 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500">
                              2nd: <strong>{formatEta(arrival.nextBus2.estimatedMinutes)}</strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        onSelectFavorite(fav);
                        onClose();
                      }}
                      className="p-2 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Open Tracker"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Track</span>
                    </button>

                    <button
                      onClick={() => onRemoveFavorite(fav.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove favourite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
