import { z } from '../input/zod';
import { latitudeSchema, longitudeSchema, numberSchema } from '../input/primitives';
import { isSingaporeLocation } from './singapore';
const schema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema, accuracy: numberSchema.nonnegative() })
  .refine(value => isSingaporeLocation(value.latitude, value.longitude));
export function parseGpsCoordinates(value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
