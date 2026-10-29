import { z } from '../shared/input/zod.ts';
import { latitudeSchema, longitudeSchema, parseBoundary } from '../shared/input/primitives.ts';
const id = z.number().int().positive().safe();
const schema = z.object({ elements: z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('way'), id, geometry: z.array(z.object({ lat: latitudeSchema, lon: longitudeSchema })).max(20000).optional() }),
  z.object({ type: z.literal('relation'), id, tags: z.record(z.string().max(256), z.string().max(4096)).optional(), members: z.array(z.object({ type: z.string().max(64), ref: id, role: z.string().max(256) })).max(20000).optional() }),
  z.object({ type: z.literal('node'), id }),
])).max(200000) }).superRefine((body, context) => {
  let points = 0, members = 0;
  for (const element of body.elements) {
    if (element.type === 'way') points += element.geometry?.length ?? 0;
    if (element.type === 'relation') members += element.members?.length ?? 0;
  }
  if (points > 2000000 || members > 2000000) context.addIssue({ code: 'custom', message: 'External geometry exceeds the work budget.' });
});
export const parseOverpass = (raw: unknown) => parseBoundary(schema, raw);

// Separate aggregate expansion/comparison caps: repeated references must not multiply work without bound.
export function createShapeWorkBudget(limits = { routePoints: 100000, totalPoints: 5000000, comparisons: 50000000 }) {
  let points = 0, comparisons = 0;
  return {
    admitRoute(count: number) {
      if (!Number.isSafeInteger(count) || count < 0 || count > limits.routePoints || (points += count) > limits.totalPoints) throw new Error('External geometry exceeds the work budget.');
    },
    compare() { if (++comparisons > limits.comparisons) throw new Error('External geometry exceeds the work budget.'); },
  };
}
