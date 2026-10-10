import React from 'react';
import { NEAWeather } from '../types/bus';
import { CloudRain, Sun, Cloud, Zap, Droplets, Wind, Umbrella, RefreshCw, CheckCircle } from 'lucide-react';

interface NEAWeatherWidgetProps {
  weather: NEAWeather | null;
  isLoading: boolean;
  onRefreshWeather: () => void;
}

export const NEAWeatherWidget: React.FC<NEAWeatherWidgetProps> = ({
  weather,
  isLoading,
  onRefreshWeather
}) => {
  if (!weather) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="h-16 bg-slate-100 rounded mb-2"></div>
      </div>
    );
  }

  const renderWeatherIcon = () => {
    switch (weather.iconType) {
      case 'thunder':
        return <Zap className="w-8 h-8 text-amber-500 fill-amber-400" />;
      case 'heavy-rain':
      case 'rain':
        return <CloudRain className="w-8 h-8 text-blue-500" />;
      case 'fair':
        return <Sun className="w-8 h-8 text-amber-500 fill-amber-300" />;
      case 'cloudy':
      default:
        return <Cloud className="w-8 h-8 text-slate-400 fill-slate-200" />;
    }
  };

  return (
    <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 overflow-hidden">
      {/* Top row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Umbrella className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-none">
                NEA Singapore Weather
              </h3>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded uppercase">
                2-Hour Forecast
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Region: <strong className="text-slate-700">{weather.area}</strong> ({weather.region})
            </p>
          </div>
        </div>

        <button
          onClick={onRefreshWeather}
          disabled={isLoading}
          className="text-xs text-slate-500 hover:text-purple-700 flex items-center gap-1 p-1"
          title="Refresh NEA weather data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="text-[11px] hidden sm:inline">Update</span>
        </button>
      </div>

      {/* Main weather banner */}
      <div className="mt-3.5 grid grid-cols-1 @xl:grid-cols-3 gap-3">
        {/* Forecast & Temp */}
        <div className="@xl:col-span-2 bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-2 bg-white rounded-xl shadow-2xs border border-slate-100">
              {renderWeatherIcon()}
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                {weather.forecast}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {weather.isRaining ? 'Precipitation in progress' : 'Dry conditions currently'}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {weather.temperatureC}°<span className="text-lg text-slate-500 font-semibold">C</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Air Temp</div>
          </div>
        </div>

        {/* Rain probability gauge */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span className="font-semibold flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-blue-500" /> Rain Chance
            </span>
            <span className="font-bold text-slate-900">{weather.rainProbabilityPercent}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden my-1">
            <div
              className={`h-2 rounded-full transition-all ${
                weather.rainProbabilityPercent > 60
                  ? 'bg-blue-600'
                  : weather.rainProbabilityPercent > 30
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${weather.rainProbabilityPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3" /> {weather.windSpeedKmh} km/h wind
            </span>
            <span>Humidity: {weather.humidityPercent}%</span>
          </div>
        </div>
      </div>

      {/* Commuter Advice Alert */}
      <div
        className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
          weather.isRaining
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {weather.isRaining ? (
            <Umbrella className="w-4 h-4 text-amber-700" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-700" />
          )}
        </div>
        <div>
          <div className="font-bold">Commuter Transit Advice</div>
          <div className="text-[11px] mt-0.5 opacity-90">{weather.commuterAdvice}</div>
        </div>
      </div>

      <div className="mt-2 text-right">
        <span className="text-[10px] text-slate-400">{weather.updateTime}</span>
      </div>
    </div>
  );
};
