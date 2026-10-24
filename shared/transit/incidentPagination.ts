import { z } from '../input/zod.ts';

// Wire-contract bounds shared by request validation, responses and browser traversal.
export const incidentPagination = Object.freeze({ defaultLimit: 100, maxLimit: 200, maxItems: 10_000 });
export const incidentSnapshotSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const incidentPageSchema = z.object({
  limit: z.number().int().min(1).max(incidentPagination.maxLimit),
  offset: z.number().int().min(0).max(incidentPagination.maxItems),
  total: z.number().int().min(0).max(incidentPagination.maxItems),
  nextOffset: z.number().int().min(1).max(incidentPagination.maxItems).nullable(),
  snapshot: incidentSnapshotSchema,
});
const integerQuery = (max: number) => z.string().max(5).regex(/^(?:0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().min(0).max(max));
export const incidentQuerySchema = z.strictObject({
  limit: integerQuery(incidentPagination.maxLimit).refine(value => value > 0).optional(),
  offset: integerQuery(incidentPagination.maxItems).optional(),
  snapshot: incidentSnapshotSchema.optional(),
}).superRefine((value, ctx) => {
  if ((value.offset ?? 0) > 0 && !value.snapshot) ctx.addIssue({ code: 'custom', path: ['snapshot'], message: 'Continuation requires a snapshot.' });
});
export type IncidentQuery = z.infer<typeof incidentQuerySchema>;
