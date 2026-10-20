import type { Tone } from '../../types/weather';
export { forecastIconType } from './bands';

export function formatSgTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
}

export const toneClasses: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  good: { text: 'text-green-blue-ink', bg: 'bg-green-blue-soft', border: 'border-green-blue/30', dot: 'bg-green-blue' },
  moderate: { text: 'text-helvetia-800', bg: 'bg-helvetia-50', border: 'border-helvetia-200', dot: 'bg-helvetia' },
  warn: { text: 'text-amber-900', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  bad: { text: 'text-orange-900', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  severe: { text: 'text-red-900', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-600' },
};
