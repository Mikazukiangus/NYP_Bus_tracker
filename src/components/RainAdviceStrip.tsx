import React from 'react';
import { ChevronRight, CircleCheck, Flag, Footprints, Hourglass, LucideIcon, Umbrella, Zap } from 'lucide-react';
import type { RainAction, RainAdvice } from '../services/rainAdvice';
import { toneClasses } from '../features/weather/presentation';

const ACTION_ICON: Record<RainAction, LucideIcon> = {
  'leave-now': Footprints,
  umbrella: Umbrella,
  wait: Hourglass,
  go: CircleCheck,
};

// Under "Where to?": whether to leave now, wait for a later bus or take an umbrella where you're starting from,
// from NEA's rain gauges and forecast. When there's no rain about it's a single short line.
export const RainAdviceStrip: React.FC<{
  advice: RainAdvice;
  source?: string;
  onOpenWeather?: () => void;
  className?: string;
}> = ({ advice, source, onOpenWeather, className = '' }) => {
  const t = toneClasses[advice.tone];
  const Icon = advice.cause === 'lightning' ? Zap : ACTION_ICON[advice.action];
  const quiet = advice.action === 'go' && !advice.destination;
  const footer = (source || onOpenWeather) && (
    <span className="text-[10px] opacity-75">
      {source}
      {onOpenWeather && (
        <>
          {source && ' · '}
          <button onClick={onOpenWeather} className="font-semibold underline inline-flex items-center">
            Weather <ChevronRight className="w-3 h-3" />
          </button>
        </>
      )}
    </span>
  );

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 text-xs ${t.bg} ${t.border} ${t.text} ${className}`}>
      <span className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center shrink-0" aria-hidden="true">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        {quiet ? (
          <p>
            <strong className="font-bold">{advice.title}.</strong> <span className="opacity-90">{advice.detail}</span> {footer}
          </p>
        ) : (
          <>
            <p className="text-sm font-bold">{advice.title}</p>
            <p className="mt-0.5 opacity-90">{advice.detail}</p>
            {advice.destination && (
              <p className={`mt-1.5 flex items-start gap-1.5 ${toneClasses[advice.destination.tone].text}`}>
                <Flag className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                <span>{advice.destination.text}</span>
              </p>
            )}
            {footer && <p className="mt-1">{footer}</p>}
          </>
        )}
      </div>
    </div>
  );
};
