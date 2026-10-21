import { z } from '../../shared/input/zod.ts';
import { nameSchema, textSchema, stopCodeSchema, serviceNoSchema, latitudeSchema, longitudeSchema, numberSchema, parseBoundary } from '../../shared/input/primitives.ts';

export const pageSchema = z.object({ value: z.array(z.unknown()) });
const times = z.string().regex(/^(?:-|(?:[01]\d|2[0-3])[0-5]\d|2400)$/).optional();
const operator = z.enum(['SBST', 'SMRT', 'TTS', 'GAS']);
export const stopRowSchema = z.object({ BusStopCode: stopCodeSchema, RoadName: textSchema, Description: nameSchema, Latitude: latitudeSchema, Longitude: longitudeSchema });
export const routeRowSchema = z.object({
  ServiceNo: serviceNoSchema, Operator: operator, Direction: z.union([z.literal(1), z.literal(2)]), StopSequence: numberSchema.int().positive(), BusStopCode: stopCodeSchema,
  Distance: numberSchema.nonnegative().optional(), WD_FirstBus: times, WD_LastBus: times, SAT_FirstBus: times, SAT_LastBus: times, SUN_FirstBus: times, SUN_LastBus: times,
});
export const serviceRowSchema = z.object({ ServiceNo: serviceNoSchema, Operator: operator, Direction: z.union([z.literal(1), z.literal(2)]).optional(), Category: textSchema });
export const parseStopRows = (value: unknown) => parseBoundary(z.array(stopRowSchema), value);
export const parseRouteRows = (value: unknown) => parseBoundary(z.array(routeRowSchema), value);
export const parseServiceRows = (value: unknown) => parseBoundary(z.array(serviceRowSchema), value);
