import { z } from '../input/zod.ts';
import { latitudeSchema, longitudeSchema, textSchema, nameSchema, timeSchema, parseBoundary } from '../input/primitives.ts';
import { incidentPageSchema, incidentPagination } from './incidentPagination.ts';

const incidentSchema = z.object({ type: nameSchema, lat: latitudeSchema, lng: longitudeSchema, message: textSchema });
export const incidentResponseSchema = z.object({ incidents: z.array(incidentSchema).max(incidentPagination.maxItems), fetchedAt: timeSchema, source: z.literal('LTA_DATAMALL'), pagination: incidentPageSchema.optional() }).superRefine((body, ctx) => {
  const page = body.pagination;
  if (!page) return; // Older deployed servers/clients use the complete legacy envelope.
  const length = Math.min(page.limit, Math.max(0, page.total - page.offset));
  const next = page.offset + length < page.total ? page.offset + length : null;
  if (body.incidents.length !== length || page.nextOffset !== next) ctx.addIssue({ code: 'custom', path: ['pagination'], message: 'Inconsistent page boundaries.' });
});
export const providerIncidentSchema = z.object({ value: z.array(z.object({ Type: nameSchema, Latitude: latitudeSchema, Longitude: longitudeSchema, Message: textSchema })).max(incidentPagination.maxItems) });
export const parseIncidentResponse = (value: unknown) => parseBoundary(incidentResponseSchema, value);
