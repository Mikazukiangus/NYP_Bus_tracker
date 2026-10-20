import type { Tone, WeatherSummary } from '../../types/weather';

// NEA PSI health bands
export function psiBand(psi: number): { label: string; tone: Tone } {
  if (psi <= 50) return { label: 'Good', tone: 'good' };
  if (psi <= 100) return { label: 'Moderate', tone: 'moderate' };
  if (psi <= 200) return { label: 'Unhealthy', tone: 'bad' };
  if (psi <= 300) return { label: 'Very Unhealthy', tone: 'severe' };
  return { label: 'Hazardous', tone: 'severe' };
}

// NEA 1-hour PM2.5 concentration bands (µg/m³)
export function pm25Band(value: number): { label: string; tone: Tone } {
  if (value <= 55) return { label: 'Normal', tone: 'good' };
  if (value <= 150) return { label: 'Elevated', tone: 'warn' };
  if (value <= 250) return { label: 'High', tone: 'bad' };
  return { label: 'Very High', tone: 'severe' };
}

export function uvBand(value: number): { label: string; tone: Tone } {
  if (value <= 2) return { label: 'Low', tone: 'good' };
  if (value <= 5) return { label: 'Moderate', tone: 'moderate' };
  if (value <= 7) return { label: 'High', tone: 'warn' };
  if (value <= 10) return { label: 'Very High', tone: 'bad' };
  return { label: 'Extreme', tone: 'severe' };
}

export function heatBand(heatStress: string): Tone {
  const s = heatStress.toLowerCase();
  if (s.includes('high')) return 'bad';
  if (s.includes('moderate')) return 'warn';
  return 'good';
}

export function forecastIconType(forecast: string): WeatherSummary['iconType'] {
  const f = forecast.toLowerCase();
  if (f.includes('thunder')) return 'thunder';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return 'rain';
  if (f.includes('haz') || f.includes('mist') || f.includes('fog')) return 'haze';
  if (f.includes('fair') || f.includes('sunny')) return f.includes('night') ? 'fair-night' : 'fair';
  return 'cloudy';
}

export const isWetForecast = (forecast?: string) => Boolean(forecast && /rain|shower|thunder|drizzle/i.test(forecast));
