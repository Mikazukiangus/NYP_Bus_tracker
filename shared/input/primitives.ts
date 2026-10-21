import { z } from './zod.ts';
import { timestamp } from '../transit/validation.ts';

export const stopCodeSchema = z.string().regex(/^\d{5}$/);
export const serviceNoSchema = z.string().max(32).trim().regex(/^[0-9A-Za-z]{1,6}$/).transform(value => value.toUpperCase());
export const textSchema = z.string().max(4096);
export const nameSchema = textSchema.min(1);
export const timeSchema = z.string().refine(timestamp);
export const numberSchema = z.number().finite();
export const latitudeSchema = numberSchema.min(-90).max(90);
export const longitudeSchema = numberSchema.min(-180).max(180);
export const pointSchema = z.object({ lat: latitudeSchema, lng: longitudeSchema });
// Accept numeric strings from providers, never parseFloat's partial values such as "12bad".
export const numericSchema = z.union([numberSchema, z.string().trim().regex(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i).transform(Number)]).pipe(numberSchema);

export function parseBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  // Raw Zod errors can contain received values. Do not pass them to logs or clients.
  if (!result.success) throw new Error('Invalid external data.');
  return result.data;
}
