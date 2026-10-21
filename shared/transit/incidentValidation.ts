import { z } from '../input/zod.ts';
import { latitudeSchema, longitudeSchema, textSchema, nameSchema, timeSchema, parseBoundary } from '../input/primitives.ts';

const incidentSchema = z.object({ type: nameSchema, lat: latitudeSchema, lng: longitudeSchema, message: textSchema });
export const incidentResponseSchema = z.object({ incidents: z.array(incidentSchema), fetchedAt: timeSchema, source: z.literal('LTA_DATAMALL') });
export const providerIncidentSchema = z.object({ value: z.array(z.object({ Type: nameSchema, Latitude: latitudeSchema, Longitude: longitudeSchema, Message: textSchema })) });
export const parseIncidentResponse = (value: unknown) => parseBoundary(incidentResponseSchema, value);
