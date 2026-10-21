import { z } from '../../../../shared/input/zod';
import { textSchema, numericSchema, parseBoundary } from '../../../../shared/input/primitives';
import { isSingaporeLocation } from '../../../../shared/geo/singapore';
const row = z.object({
  SEARCHVAL: textSchema.optional(), BLK_NO: textSchema.optional(), ROAD_NAME: textSchema.optional(), BUILDING: textSchema.optional(), ADDRESS: textSchema.optional(), POSTAL: textSchema.optional(),
  LATITUDE: numericSchema, LONGITUDE: numericSchema,
}).refine(value => isSingaporeLocation(value.LATITUDE, value.LONGITUDE));
const response = z.object({ results: z.array(row) });
export function parseOneMapResponse(value: unknown) {
  return parseBoundary(response, value).results.map(r => ({ ...r, LATITUDE: String(r.LATITUDE), LONGITUDE: String(r.LONGITUDE) }));
}
