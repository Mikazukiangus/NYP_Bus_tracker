import { createHash } from 'node:crypto';
import type { IncidentResult } from './incidents.ts';
import { incidentPagination, type IncidentQuery } from '../../shared/transit/incidentPagination.ts';

type Body = Extract<IncidentResult, { kind: 'ok' }>['body'];
export function createIncidentPager() {
  const prepared = new WeakMap<Body, { incidents: Body['incidents']; snapshot: string }>();
  return (body: Body, query: IncidentQuery) => {
    if (Object.keys(query).length === 0) return { kind: 'legacy' as const, body };
    let data = prepared.get(body);
    if (!data) {
      // Exact tuple order is independent of provider order, locale, process and fetchedAt.
      const rows = body.incidents.map(incident => ({ incident, key: JSON.stringify([incident.type, incident.lat, incident.lng, incident.message]) }));
      rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      data = { incidents: rows.map(row => row.incident), snapshot: createHash('sha256').update(JSON.stringify(['incidents-v1', rows.map(row => row.key)])).digest('hex') };
      prepared.set(body, data);
    }
    if (query.snapshot && query.snapshot !== data.snapshot) return { kind: 'changed' as const };
    const limit = query.limit ?? incidentPagination.defaultLimit, offset = query.offset ?? 0;
    const incidents = data.incidents.slice(offset, offset + limit), total = data.incidents.length;
    return { kind: 'page' as const, body: { ...body, incidents, pagination: {
      limit, offset, total, nextOffset: offset + incidents.length < total ? offset + incidents.length : null,
      snapshot: data.snapshot,
    } } };
  };
}
