import React from 'react';
import type { Tone, WeatherSummary } from '../types/weather';
import { forecastIconType, formatSgTime, toneClasses } from '../services/neaWeather';
import {
  CalendarDays,
  CircleCheck,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Droplet,
  Gauge,
  Haze,
  Moon,
  RefreshCw,
  Sun,
  SunMedium,
  ThermometerSun,
  TriangleAlert,
  Umbrella,
  Wind,
  Zap,
} from 'lucide-react';

interface NEAWeatherWidgetProps {
  weather: WeatherSummary | null;
  isLoading: boolean;
  error?: boolean;
  onRefreshWeather: () => void;
  onShowAll?: () => void;
  // compact: beside the map on the arrivals tab; full: the Weather tab
  variant?: 'compact' | 'full';
}

const regionLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

function ForecastIcon({ type, className = 'w-8 h-8' }: { type: WeatherSummary['iconType']; className?: string }) {
  switch (type) {
    case 'thunder':
      return <CloudLightning className={`${className} text-amber-500`} />;
    case 'rain':
      return <CloudRain className={`${className} text-blue-500`} />;
    case 'haze':
      return <CloudFog className={`${className} text-slate-500`} />;
    case 'fair':
      return <Sun className={`${className} text-amber-500 fill-amber-300`} />;
    case 'fair-night':
      return <Moon className={`${className} text-indigo-500 fill-indigo-200`} />;
    default:
      return <Cloud className={`${className} text-slate-400 fill-slate-200`} />;
  }
}

interface TileProps {
  icon: React.ReactNode;
  label: string;
  period?: string;
  value?: React.ReactNode;
  badge?: { label: string; tone: Tone };
  detail?: string;
}

function Tile({ icon, label, period, value, badge, detail }: TileProps) {
  const tone = badge ? toneClasses[badge.tone] : null;
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 min-w-0 flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">
          {label}
          {period && <span className="font-normal text-slate-400"> {period}</span>}
        </span>
      </div>
      {value === undefined ? (
        <div className="text-sm font-bold text-slate-400">—</div>
      ) : (
        <div className="text-lg font-black text-slate-900 leading-tight truncate">{value}</div>
      )}
      {badge && tone && (
        <span className={`self-start text-[10px] font-bold px-1.5 py-0.5 rounded ${tone.bg} ${tone.text} truncate max-w-full`}>
          {badge.label}
        </span>
      )}
      {detail && <div className="text-[10px] text-slate-400 leading-snug line-clamp-2">{detail}</div>}
    </div>
  );
}

function Alerts({ alerts, limit, onShowAll }: { alerts: WeatherSummary['alerts']; limit?: number; onShowAll?: () => void }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      {shown.map((a) => {
        const t = toneClasses[a.tone];
        const Icon = a.tone === 'good' ? CircleCheck : a.tone === 'moderate' ? Umbrella : TriangleAlert;
        return (
          <div key={a.title} className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${t.bg} ${t.border} ${t.text}`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold">{a.title}</div>
              <div className="text-[11px] mt-0.5 opacity-90 leading-snug">{a.detail}</div>
            </div>
          </div>
        );
      })}
      {limit && alerts.length > limit && (
        <button onClick={onShowAll} className="text-[11px] font-semibold text-[#602a85] hover:underline">
          +{alerts.length - limit} more in the Weather tab
        </button>
      )}
    </div>
  );
}

const near = (station?: string, km?: number) =>
  station ? `${station}${km !== undefined ? ` · ${km} km` : ''}` : undefined;

export const NEAWeatherWidget: React.FC<NEAWeatherWidgetProps> = ({
  weather,
  isLoading,
  error,
  onRefreshWeather,
  onShowAll,
  variant = 'compact',
}) => {
  const full = variant === 'full';

  if (!weather) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        {error ? (
          <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>Couldn't reach NEA weather data right now.</span>
            <button onClick={onRefreshWeather} className="text-xs font-semibold text-[#602a85] hover:underline shrink-0">
              Try again
            </button>
          </div>
        ) : (
          <div className="animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-1/3 mb-4"></div>
            <div className="h-16 bg-slate-100 rounded mb-2"></div>
            <div className="h-12 bg-slate-100 rounded"></div>
          </div>
        )}
      </div>
    );
  }

  const w = weather;
  const tiles: TileProps[] = [
    {
      icon: <CloudRain className="w-3.5 h-3.5 text-blue-500" />,
      label: 'Rain',
      period: '5 min',
      value: w.rain ? <>{w.rain.value}<span className="text-xs font-semibold text-slate-500"> mm</span></> : undefined,
      badge: w.rain && { label: w.rain.label, tone: w.rain.tone },
      detail: full ? near(w.rain?.station, w.rain?.distanceKm) : undefined,
    },
    {
      icon: <Gauge className="w-3.5 h-3.5 text-slate-500" />,
      label: 'PSI',
      period: '24 hr',
      value: w.psi?.value,
      badge: w.psi && { label: w.psi.label, tone: w.psi.tone },
      detail: full && w.psi ? `${regionLabel(w.region)} region` : undefined,
    },
    {
      icon: <Haze className="w-3.5 h-3.5 text-slate-500" />,
      label: 'PM2.5',
      period: '1 hr',
      value: w.pm25 ? <>{w.pm25.value}<span className="text-xs font-semibold text-slate-500"> µg/m³</span></> : undefined,
      badge: w.pm25 && { label: w.pm25.label, tone: w.pm25.tone },
      detail: full && w.pm25 ? `${regionLabel(w.region)} region` : undefined,
    },
    {
      icon: <Droplet className="w-3.5 h-3.5 text-sky-500" />,
      label: 'Humidity',
      value: w.humidity ? `${w.humidity.value}%` : undefined,
      detail: full ? near(w.humidity?.station, w.humidity?.distanceKm) : undefined,
    },
    {
      icon: <Wind className="w-3.5 h-3.5 text-slate-500" />,
      label: 'Wind',
      value: w.windKmh ? <>{w.windKmh.value}<span className="text-xs font-semibold text-slate-500"> km/h</span></> : undefined,
      detail: full ? near(w.windKmh?.station, w.windKmh?.distanceKm) : undefined,
    },
    {
      icon: <SunMedium className="w-3.5 h-3.5 text-amber-500" />,
      label: 'UV index',
      value: w.uv?.value,
      badge: w.uv && { label: w.uv.label, tone: w.uv.tone },
      detail: full && w.uv ? `Islandwide · ${formatSgTime(w.uv.time)}` : undefined,
    },
  ];
  if (full) {
    tiles.push(
      {
        icon: <ThermometerSun className="w-3.5 h-3.5 text-orange-500" />,
        label: 'Heat stress',
        value: w.heatStress ? <>{w.heatStress.value}<span className="text-xs font-semibold text-slate-500"> °C WBGT</span></> : undefined,
        badge: w.heatStress && { label: w.heatStress.label, tone: w.heatStress.tone },
        detail: near(w.heatStress?.station, w.heatStress?.distanceKm),
      },
      {
        icon: <Zap className="w-3.5 h-3.5 text-amber-500" />,
        label: 'Lightning',
        period: '10 km',
        value: w.lightning ? w.lightning.count : undefined,
        badge: w.lightning && {
          label: w.lightning.count ? `Closest ${w.lightning.nearestKm} km` : 'None',
          tone: w.lightning.count ? 'severe' : 'good',
        },
        detail: w.lightning ? `Strikes in the last ${w.lightning.windowMinutes} min` : undefined,
      }
    );
  }

  const latestUpdate = w.temperature?.time || w.rain?.time || w.forecast2h?.updated;

  return (
    <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Umbrella className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black text-slate-900 leading-none">Weather & Air Quality</h3>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              Near <strong className="text-slate-700">{w.area}</strong> · {regionLabel(w.region)} region
            </p>
          </div>
        </div>
        <button
          onClick={onRefreshWeather}
          disabled={isLoading}
          className="text-xs text-slate-500 hover:text-purple-700 flex items-center gap-1 p-1 shrink-0"
          title="Refresh NEA weather data"
          aria-label="Refresh weather"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="text-[11px] hidden sm:inline">Update</span>
        </button>
      </div>

      {/* Forecast & temperature */}
      <div className="mt-3 bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl p-3 border border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-white rounded-xl border border-slate-100 shrink-0">
            <ForecastIcon type={w.iconType} />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {w.forecast2h?.text ?? 'Forecast unavailable'}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              <span className="block @md:inline">2-hr forecast</span>
              {w.forecast2h && <span className="block @md:inline"><span className="hidden @md:inline"> · </span>{w.forecast2h.validText}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {w.temperature ? (
              <>
                {w.temperature.value}°<span className="text-base text-slate-500 font-semibold">C</span>
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-medium max-w-[9rem] truncate" title={w.temperature?.station}>
            {w.temperature ? (
              <>
                Now<span className="hidden @md:inline"> · {w.temperature.station}</span>
              </>
            ) : (
              'Air temp'
            )}
          </div>
        </div>
      </div>

      {/* Readings */}
      <div className={`mt-3 grid gap-2 ${full ? 'grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4' : 'grid-cols-3'}`}>
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </div>

      {/* Commuter alerts */}
      <div className="mt-3">
        <Alerts alerts={w.alerts} limit={full ? undefined : 2} onShowAll={onShowAll} />
      </div>

      {full && (w.today || w.outlook) && (
        <div className="mt-4 grid grid-cols-1 @3xl:grid-cols-2 gap-4">
          {w.today && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2">Next 24 hours · {regionLabel(w.region)}</h4>
              <div className="text-[11px] text-slate-500 mb-2">
                {w.today.forecast} · {w.today.temperature.low}–{w.today.temperature.high}°C · Humidity{' '}
                {w.today.humidity.low}–{w.today.humidity.high}% · Wind {w.today.wind.direction} {w.today.wind.low}–
                {w.today.wind.high} km/h
              </div>
              <div className="space-y-1.5">
                {w.today.regionPeriods.map((p) => (
                  <div key={p.text} className="flex items-center gap-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <ForecastIcon type={forecastIconType(p.forecast)} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{p.forecast}</div>
                      <div className="text-[11px] text-slate-500">{p.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {w.outlook && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> 4-day outlook
              </h4>
              <div className="grid grid-cols-2 @lg:grid-cols-4 @3xl:grid-cols-2 @5xl:grid-cols-4 gap-2">
                {w.outlook.map((d) => (
                  <div key={d.date} className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs min-w-0">
                    <div className="font-bold text-slate-800">{d.day}</div>
                    <div className="flex items-start gap-1.5 mt-1">
                      <ForecastIcon type={forecastIconType(d.forecast)} className="w-4 h-4 shrink-0" />
                      <span className="text-slate-700 leading-snug" title={d.summary}>{d.forecast}</span>
                    </div>
                    <div className="text-slate-500 mt-1">
                      {d.low}–{d.high}°C
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source line */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span>
          Source: NEA via data.gov.sg{latestUpdate ? ` · readings ${formatSgTime(latestUpdate)}` : ''}
        </span>
        {(w.missing.length > 0 || w.stale.length > 0) && (
          <span className="text-amber-600">
            {w.missing.length > 0 ? 'Some readings still loading or unavailable' : 'Some readings may be out of date'}
          </span>
        )}
      </div>
    </div>
  );
};
