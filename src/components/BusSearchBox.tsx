import React, { useEffect, useState } from 'react';
import { Search, ArrowRightLeft, Sparkles, X } from 'lucide-react';
import { BusRoute } from '../types/bus';

interface BusSearchBoxProps {
  busNumber: string;
  setBusNumber: (val: string) => void;
  onSearch: (busNo: string) => void;
  currentRoute: BusRoute;
  direction: number;
  setDirection: (dir: number) => void;
}

// 72, 45, 50 and 159 serve Nanyang Poly stops (55329 / 55321 / 54351)
const POPULAR_NUMBERS = ['72', '45', '50', '159', '14', '65', '147', '190', '857'];

export const BusSearchBox: React.FC<BusSearchBoxProps> = ({
  busNumber,
  setBusNumber,
  onSearch,
  currentRoute,
  direction,
  setDirection
}) => {
  const [inputVal, setInputVal] = useState(busNumber);

  // Keep the input in sync when the service changes elsewhere (e.g. a favourite is opened)
  useEffect(() => {
    setInputVal(busNumber);
  }, [busNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onSearch(inputVal.trim());
    }
  };

  const handleSelectQuick = (num: string) => {
    setInputVal(num);
    setBusNumber(num);
    onSearch(num);
  };

  const dir1 = currentRoute.direction1;
  const dir2 = currentRoute.direction2;

  const currentDirData = direction === 2 && dir2 ? dir2 : dir1;

  return (
    <div className="bg-white rounded-2xl border border-warm-200/90 shadow-sm p-3.5 sm:p-5">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <label htmlFor="bus-search-input" className="sr-only sm:not-sr-only sm:block text-xs font-semibold text-warm-700 uppercase tracking-wider sm:mb-1.5">
          Find Bus Service
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-warm-500 pointer-events-none flex items-center">
            <Search className="w-5 h-5" />
          </div>
          <input
            id="bus-search-input"
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Bus number, e.g. 72"
            enterKeyHint="search"
            className="w-full pl-11 pr-24 py-3 sm:py-3.5 bg-warm-50 border border-warm-300 rounded-xl text-base sm:text-lg font-bold text-warm-900 placeholder:text-warm-500 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia focus:border-transparent transition-all"
            autoComplete="off"
          />

          {inputVal && (
            <button
              type="button"
              aria-label="Clear bus number"
              onClick={() => {
                setInputVal('');
              }}
              className="absolute right-20 text-warm-500 hover:text-warm-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="submit"
            className="absolute right-1.5 px-4 py-2 bg-lemon hover:bg-lemon-hover text-helvetia-950 rounded-lg text-sm font-bold transition-all shadow-xs"
          >
            Track
          </button>
        </div>
      </form>

      {/* Popular Chips */}
      <div className="mt-2.5 sm:mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <span className="text-[11px] font-medium text-warm-500 flex items-center gap-1 shrink-0 mr-1">
          <Sparkles className="w-3 h-3 text-green-blue" />
          Popular:
        </span>
        {POPULAR_NUMBERS.map((num) => {
          const isActive = currentRoute.serviceNo === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => handleSelectQuick(num)}
              className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-helvetia text-white shadow-xs scale-105'
                  : 'bg-warm-100 hover:bg-warm-200 text-warm-700'
              }`}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Route Direction Switcher */}
      <div className="mt-2.5 pt-3 sm:mt-4 sm:pt-3.5 border-t border-warm-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-helvetia text-white font-extrabold text-sm px-2.5 py-1 rounded-lg shadow-2xs shrink-0">
              Bus {currentRoute.serviceNo}
            </span>
            <div className="text-xs">
              <span className="text-warm-500">Operator: </span>
              <span className="font-semibold text-warm-800">{currentRoute.operator}</span>
              <span className="text-warm-300 mx-1.5">•</span>
              <span className="text-warm-500 font-medium">{currentRoute.category} Service</span>
            </div>
          </div>

          {dir2 && (
            <div className="flex items-center bg-warm-100 p-1 rounded-xl gap-1 text-xs font-semibold w-full sm:w-auto sm:max-w-[60%]">
              <button
                type="button"
                onClick={() => setDirection(1)}
                className={`flex-1 sm:flex-none min-w-0 justify-center px-3 py-2 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === 1
                    ? 'bg-lemon text-helvetia-950 shadow-xs font-bold'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                <span className="truncate">To {dir1.destination.replace(' Bus Interchange', '').replace(' Interchange', '')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection(2)}
                className={`flex-1 sm:flex-none min-w-0 justify-center px-3 py-2 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === 2
                    ? 'bg-lemon text-helvetia-950 shadow-xs font-bold'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                <ArrowRightLeft className="w-3 h-3 opacity-60 shrink-0" />
                <span className="truncate">To {dir2.destination.replace(' Bus Interchange', '').replace(' Interchange', '')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Current Destination banner */}
        <div className="mt-2 text-xs text-warm-600 bg-helvetia-50/50 border border-helvetia-100 rounded-lg px-3 py-1.5 hidden sm:flex items-center justify-between">
          <div className="truncate">
            <span className="text-helvetia-900 font-medium hidden sm:inline">Origin: </span>
            <span className="text-warm-700">{currentDirData.origin}</span>
            <span className="mx-2 text-helvetia-400">➔</span>
            <span className="text-helvetia-900 font-medium hidden sm:inline">Destination: </span>
            <span className="text-warm-900 font-semibold">{currentDirData.destination}</span>
          </div>
          <span className="text-[11px] text-helvetia-700 font-medium shrink-0 ml-2">
            {currentDirData.stops.length} stops
          </span>
        </div>
      </div>
    </div>
  );
};
