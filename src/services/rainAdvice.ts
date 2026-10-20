import type { RainNowcast, Tone } from '../types/weather';
import { isWetForecast } from '../features/weather/bands';
import { firstCatchable } from './leaveWithin';

// Whether to leave now, wait or take an umbrella, from the rain around you (rainNowcast), NEA's 2-hour forecast,
// lightning, and how long until you're at the stop and at your destination. The odds in the wording come from
// backtesting the nowcast against 7 rainy days of NEA's rain gauge readings (COMMENTS.md, turn 29):
// - Rain moving your way (within 10 km) arrived within 30 min 54% of the time when the forecast was wet, 6% when
//   it was dry, so a dry forecast overrides it.
// - Light rain stopped within 30 min about half the time; moderate rain often eased to a drizzle in 15-30 min but
//   rarely stopped; heavy rain eased within 30 min about half the time; very heavy rain usually lasted an hour.
// - After rain stopped, it came back within 30 min a third of the time when the forecast was wet, rarely otherwise.
// - With no rain within 20 km and a wet forecast, rain started within an hour 10% of the time (1% if dry).

export type RainAction = 'leave-now' | 'umbrella' | 'wait' | 'go';

export interface RainAdvice {
  action: RainAction;
  cause: 'lightning' | RainNowcast['status']; // what it's based on (unknown: the forecast alone)
  tone: Tone;
  title: string;
  detail: string;
  destination?: { tone: Tone; text: string }; // the end of the trip, when a destination is set and it matters
}

export interface RainAdviceInput {
  here: RainNowcast;
  area?: string; // NEA forecast area
  forecast?: string; // NEA's 2-hour forecast there
  lightning?: { count: number; nearestKm: number; windowMinutes: number }; // strikes within 10 km
  walkMin?: number; // walk to the stop (0 when you're at it)
  stopName?: string;
  busServiceNo?: string; // the bus being tracked there
  busMin?: number[]; // minutes until its next buses
  destination?: {
    name: string;
    nowcast: RainNowcast;
    forecast?: string;
    arriveInMin: number; // when you'd get off the bus there
    walkMin: number; // walk from the stop to the destination
  };
}

const range = ([lo, hi]: [number, number]) => (lo === hi ? `~${lo}\u00a0min` : `${lo}–${hi}\u00a0min`);
const lower = (forecast: string) => forecast.toLowerCase();

function hereAdvice(input: RainAdviceInput): Omit<RainAdvice, 'cause'> | null {
  const { here, forecast, area, lightning, walkMin, stopName, busServiceNo, busMin = [] } = input;
  const wetForecast = isWetForecast(forecast);
  const forecastFor = area ? ` for ${area}` : '';

  if (lightning && lightning.count > 0) {
    return {
      action: 'wait',
      tone: 'severe',
      title: 'Lightning nearby: wait under shelter',
      detail: `${lightning.count} strike${lightning.count > 1 ? 's' : ''} within 10\u00a0km in the last ${lightning.windowMinutes}\u00a0min, the closest ${lightning.nearestKm}\u00a0km away. Stay under a bus shelter or indoors until it passes, and keep out of open areas.`,
    };
  }

  switch (here.status) {
    case 'raining': {
      const at = `at ${here.station} (${here.distanceKm}\u00a0km)`;
      // The history is an hour long, so rain all through it has gone on for over an hour
      const since = here.sinceAtLeast ? ' for over an hour' : here.sinceMin >= 10 ? ` for ${here.sinceMin}\u00a0min` : '';
      if (here.label === 'Light rain') {
        if (forecast && !wetForecast) {
          return {
            action: 'umbrella',
            tone: 'moderate',
            title: 'A little rain nearby',
            detail: `Light rain ${at}, but NEA's forecast is ${lower(forecast)}, so it's probably passing. An umbrella helps if you're going now.`,
          };
        }
        return {
          action: 'umbrella',
          tone: 'moderate',
          title: 'Light rain: take an umbrella, or wait a little',
          detail: `Light rain ${at}${since}. Light rain here stops within half an hour about half the time, so a later bus may mean a dry walk.`,
        };
      }
      if (here.label === 'Moderate rain') {
        return {
          action: 'umbrella',
          tone: 'warn',
          title: 'Raining: bring an umbrella',
          detail: `Moderate rain ${at}${since}. It often eases to a drizzle within 15–30\u00a0min but usually keeps on for an hour or more, so waiting gets you a lighter walk, not a dry one.`,
        };
      }
      if (here.label === 'Heavy rain') {
        return {
          action: 'wait',
          tone: 'bad',
          title: 'Heavy rain: wait for a later bus if you can',
          detail: `Heavy rain ${at}${since}. Downpours here ease to light rain within half an hour about half the time. If you need to go now, bring an umbrella and allow extra time; buses may run slower.`,
        };
      }
      return {
        action: 'umbrella',
        tone: 'severe',
        title: 'Very heavy rain: umbrella, and allow extra time',
        detail: `Very heavy rain ${at}${since}. Rain this heavy usually lasts about an hour, so waiting a bus or two won't help much. Keep under shelter where you can; buses may run slower.`,
      };
    }

    case 'stopped':
      if (wetForecast) {
        return {
          action: 'leave-now',
          tone: 'moderate',
          title: 'Rain has paused: a good moment to go',
          detail: `No rain at the gauges around you for ${here.minutesAgo}\u00a0min, but NEA forecasts ${lower(forecast!)}${forecastFor}. It comes back within half an hour about a third of the time, so take an umbrella.`,
        };
      }
      return {
        action: 'go',
        tone: forecast ? 'good' : 'moderate',
        title: 'Rain has stopped',
        detail: forecast
          ? `No rain around you for ${here.minutesAgo}\u00a0min, and NEA's 2-hour forecast is ${lower(forecast)}, so it rarely comes back soon.`
          : `No rain around you for ${here.minutesAgo}\u00a0min. Take an umbrella in case it comes back.`,
      };

    case 'approaching': {
      const where = `Rain ${here.distanceKm}\u00a0km to the ${here.direction}`;
      // With a dry forecast, showers drifting closer seldom get here (6% within 30 min in the backtest)
      if (forecast && !wetForecast) {
        return {
          action: 'go',
          tone: 'good',
          title: 'No rain here: no umbrella needed',
          detail: `${where} is drifting closer, but NEA's 2-hour forecast is ${lower(forecast)}; with a dry forecast it seldom gets this far.`,
        };
      }
      const when = range(here.etaMin);
      const arrives = `${where} is moving your way and ${here.likely ? 'should' : 'may'} arrive in ${when}`;
      const tone: Tone = here.likely ? 'warn' : 'moderate';
      if (walkMin === undefined) {
        return { action: 'leave-now', tone, title: `Rain ${here.likely ? 'expected' : 'possible'} in ${when}`, detail: `${arrives}. Leave now to stay ahead of it, or take an umbrella.` };
      }
      if (walkMin === 0) {
        return {
          action: 'umbrella',
          tone,
          title: `Rain ${here.likely ? 'expected' : 'possible'} in ${when}`,
          detail: `${arrives}. You're at ${stopName ? `the ${stopName} stop` : 'the stop'}, so its shelter has you covered; take an umbrella for the walk at the other end.`,
        };
      }
      // Leaving now gets you to the stop (usually sheltered) before the rain, with a couple of minutes to spare
      if (walkMin + 2 <= here.etaMin[0]) {
        // The bus you can catch, by the same rule as the arrivals card's "Leave within"
        const bus = firstCatchable(walkMin, busMin.map((m) => ({ estimatedMinutes: m })))?.estimatedMinutes;
        return {
          action: 'leave-now',
          tone,
          title: 'Leave now to beat the rain',
          detail: `${arrives}. ${stopName ?? 'The stop'} is a ~${walkMin}\u00a0min walk, so you'd reach it first${
            bus !== undefined ? `; the next ${busServiceNo ? `Bus ${busServiceNo}` : 'bus'} you can catch comes in ${bus}\u00a0min` : ''
          }.`,
        };
      }
      return {
        action: 'umbrella',
        tone,
        title: 'Bring an umbrella: rain on the way',
        detail: `${arrives}, before you'd finish the ~${walkMin}\u00a0min walk to ${stopName ?? 'the stop'}.`,
      };
    }

    case 'nearby': {
      const where = `${here.distanceKm}\u00a0km to the ${here.direction}${here.movingAway ? ', moving away' : ''}`;
      if (wetForecast) {
        return {
          action: 'umbrella',
          tone: 'moderate',
          title: 'Showers around: take an umbrella',
          detail: `Dry here for now, with rain ${where}. NEA forecasts ${lower(forecast!)}${forecastFor} in the next 2 hours.`,
        };
      }
      return {
        action: 'go',
        tone: 'good',
        title: 'No rain here: no umbrella needed',
        detail: `The nearest rain is ${where}${forecast ? `, and NEA's forecast is ${lower(forecast)}` : ''}.`,
      };
    }

    case 'clear':
      if (wetForecast) {
        return {
          action: 'umbrella',
          tone: 'moderate',
          title: 'Dry for now: umbrella just in case',
          detail: `No rain at any gauge within 20\u00a0km, but NEA forecasts ${lower(forecast!)}${forecastFor} in the next 2 hours.`,
        };
      }
      return {
        action: 'go',
        tone: 'good',
        title: 'No rain around: no umbrella needed',
        detail: `No rain at any gauge within 20\u00a0km${forecast ? `, and NEA's 2-hour forecast is ${lower(forecast)}` : ''}.`,
      };

    case 'unknown':
      if (!forecast) return null;
      return wetForecast
        ? {
            action: 'umbrella',
            tone: 'moderate',
            title: `${forecast} forecast: take an umbrella`,
            detail: `NEA's 2-hour forecast${forecastFor}. Live rain gauge readings aren't available right now.`,
          }
        : {
            action: 'go',
            tone: 'good',
            title: 'No rain forecast',
            detail: `NEA's 2-hour forecast${forecastFor} is ${lower(forecast)}. Live rain gauge readings aren't available right now.`,
          };
  }
}

// The walk at the end of the trip: only said when rain there would change what to bring
function destinationAdvice(dest: NonNullable<RainAdviceInput['destination']>, hereForecast?: string): RainAdvice['destination'] {
  const { name, nowcast: n, forecast, arriveInMin, walkMin } = dest;
  const walk = walkMin >= 1 ? `the ~${walkMin}\u00a0min walk at the end` : 'the end of your trip';
  const wetForecast = isWetForecast(forecast);
  switch (n.status) {
    case 'raining':
      if (n.label === 'Light rain') {
        return {
          tone: 'moderate',
          text:
            arriveInMin >= 25
              ? `Light rain at ${name} now. It may have stopped by the time you get there (~${arriveInMin}\u00a0min), but an umbrella helps for ${walk}.`
              : `Light rain at ${name} now: an umbrella helps for ${walk}.`,
        };
      }
      return { tone: n.tone, text: `${n.label} at ${name} now, and it usually lasts an hour or more: bring an umbrella for ${walk}.` };
    case 'stopped':
      return wetForecast
        ? { tone: 'moderate', text: `Rain just stopped at ${name}, but showers may return by the time you get there; an umbrella is handy.` }
        : undefined;
    case 'approaching':
      if (forecast && !wetForecast) return undefined;
      if (n.etaMin[0] > arriveInMin + 10) return undefined;
      return {
        tone: n.likely ? 'warn' : 'moderate',
        text: `Rain is heading for ${name} and ${n.likely ? 'should' : 'may'} get there in ${range(n.etaMin)}, ${n.etaMin[1] < arriveInMin ? 'before you do' : 'around when you do'} (~${arriveInMin}\u00a0min): bring an umbrella for ${walk}.`,
      };
    default:
      // Already said for here when the forecast here is wet too
      return wetForecast && !isWetForecast(hereForecast) ? { tone: 'moderate', text: `NEA forecasts ${lower(forecast!)} around ${name}.` } : undefined;
  }
}

export function rainAdvice(input: RainAdviceInput): RainAdvice | null {
  const found = hereAdvice(input);
  if (!found) return null;
  const advice: RainAdvice = { ...found, cause: input.lightning?.count ? 'lightning' : input.here.status };
  const destination = input.destination ? destinationAdvice(input.destination, input.forecast) : undefined;
  if (!destination) return advice;
  // Dry here but wet at the other end: the umbrella is for there (the line about there keeps its own colour
  // otherwise, so the advice for here isn't coloured by rain somewhere else)
  if (advice.action === 'go') {
    const name = input.destination!.name;
    return {
      ...advice,
      action: 'umbrella',
      tone: destination.tone,
      title: destination.tone === 'moderate' ? `Dry here: an umbrella is handy for ${name}` : `Dry here: take an umbrella for ${name}`,
      destination,
    };
  }
  return { ...advice, destination };
}
