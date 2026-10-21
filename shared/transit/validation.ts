// Plain JSON boundary primitives. Diagnostics deliberately contain no received values.
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const stopCode = (v: unknown): v is string => typeof v === 'string' && /^\d{5}$/.test(v);
export const serviceNo = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z]{1,6}$/.test(v);
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function timestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return false;
  const date = new Date(`${v.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v.slice(0, 10);
}
export const coordinate = (lat: unknown, lng: unknown): boolean => finite(lat) && finite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
export const direction = (v: unknown): v is 1 | 2 => v === 1 || v === 2;
export function validArtifact(v: Record<string, unknown>): boolean {
  return (v.schemaVersion === undefined || v.schemaVersion === 1) &&
    (v.datasetVersion === undefined || (typeof v.datasetVersion === 'string' && v.datasetVersion.length > 0)) &&
    (v.generatedAt === undefined || timestamp(v.generatedAt));
}
