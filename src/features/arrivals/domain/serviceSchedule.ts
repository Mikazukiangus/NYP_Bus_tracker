export type ServiceDayType = 'weekday' | 'saturday' | 'sunday';
// Preserve the existing service-day policy: late buses before 4 am use the previous day.
export function serviceDayType(nowMs: number): ServiceDayType {
  const sgServiceDay = new Date(nowMs + 8 * 3600 * 1000 - 4 * 3600 * 1000);
  const day = sgServiceDay.getUTCDay();
  return day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday';
}
