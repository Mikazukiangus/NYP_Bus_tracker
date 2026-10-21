import { z } from '../shared/input/zod';
import { latitudeSchema, longitudeSchema, parseBoundary } from '../shared/input/primitives';
const id = z.number().int().positive().safe();
const schema = z.object({ elements: z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('way'), id, geometry: z.array(z.object({ lat: latitudeSchema, lon: longitudeSchema })).optional() }),
  z.object({ type: z.literal('relation'), id, tags: z.record(z.string(), z.string()).optional(), members: z.array(z.object({ type: z.string(), ref: id, role: z.string() })).optional() }),
  z.object({ type: z.literal('node'), id }),
])) });
export const parseOverpass = (raw: unknown) => parseBoundary(schema, raw);
