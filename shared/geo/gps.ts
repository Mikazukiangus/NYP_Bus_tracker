import { z } from '../input/zod.ts';
import { latitudeSchema, longitudeSchema, numberSchema } from '../input/primitives.ts';
import { isSingaporeLocation } from './singapore.ts';
const schema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema, accuracy: numberSchema.nonnegative() })
  .refine(value => isSingaporeLocation(value.latitude, value.longitude));
export function parseGpsCoordinates(value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
