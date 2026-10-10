import type { Request, Response } from 'express';

// LTA DataMall static datasets (paginated, 500 records per page via $skip)
const LTA_BASE = 'https://datamall2.mytransport.sg/ltaodataservice';
const PAGE_SIZE = 500;
const PAGE_CONCURRENCY = 8;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Routes/stops change rarely; refresh twice a day per warm instance

interface LTABusStop {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
}

interface LTABusRouteRow {
  ServiceNo: string;
  Operator: string;
  Direction: number;
  StopSequence: number;
  BusStopCode: string;
  // "HHmm", or "-" when the service doesn't run that day
  WD_FirstBus?: string;
  WD_LastBus?: string;
  SAT_FirstBus?: string;
  SAT_LastBus?: string;
  SUN_FirstBus?: string;
  SUN_LastBus?: string;
}

interface LTABusServiceRow {
  ServiceNo: string;
  Operator: string;
  Direction: number;
  Category: string;
}

type FirstLast = [string, string] | null;

interface RouteStop {
  code: string;
  name: string;
  road: string;
  lat: number;
  lng: number;
  firstLastBus?: { weekday: FirstLast; saturday: FirstLast; sunday: FirstLast };
}

interface RouteDirection {
  origin: string;
  destination: string;
  stops: RouteStop[];
  path: [number, number][];
}

export interface BusRouteResponse {
  serviceNo: string;
  operator: string;
  category: 'Trunk' | 'Feeder' | 'Express';
  direction1: RouteDirection;
  direction2?: RouteDirection;
  source: 'LTA_DATAMALL';
}

export interface Datasets {
  stops: Map<string, LTABusStop>; // keyed by BusStopCode
  routes: Map<string, LTABusRouteRow[]>; // keyed by upper-case ServiceNo
  services: Map<string, LTABusServiceRow>;
  loadedAt: number;
}

let datasetsPromise: Promise<Datasets> | null = null;
let datasetsLoadedAt = 0;

async function fetchPage<T>(dataset: string, skip: number, accountKey: string): Promise<T[]> {
  const res = await fetch(`${LTA_BASE}/${dataset}?$skip=${skip}`, {
    headers: { AccountKey: accountKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`LTA ${dataset} skip=${skip} failed (${res.status})`);
  }
  const body = (await res.json()) as { value?: T[] };
  return body.value ?? [];
}

// Fetch every page of a dataset, a batch of pages at a time, until a short page signals the end
async function fetchAll<T>(dataset: string, accountKey: string): Promise<T[]> {
  const rows: T[] = [];
  for (let batch = 0; ; batch++) {
    const skips = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => (batch * PAGE_CONCURRENCY + i) * PAGE_SIZE);
    const pages = await Promise.all(skips.map((skip) => fetchPage<T>(dataset, skip, accountKey)));
    for (const page of pages) rows.push(...page);
    if (pages.some((page) => page.length < PAGE_SIZE)) return rows;
  }
}

export async function loadDatasets(accountKey: string): Promise<Datasets> {
  const [stopRows, routeRows, serviceRows] = await Promise.all([
    fetchAll<LTABusStop>('BusStops', accountKey),
    fetchAll<LTABusRouteRow>('BusRoutes', accountKey),
    fetchAll<LTABusServiceRow>('BusServices', accountKey),
  ]);

  const stops = new Map(stopRows.map((s) => [s.BusStopCode, s]));

  const routes = new Map<string, LTABusRouteRow[]>();
  for (const row of routeRows) {
    const key = row.ServiceNo.toUpperCase();
    const list = routes.get(key);
    if (list) list.push(row);
    else routes.set(key, [row]);
  }

  const services = new Map<string, LTABusServiceRow>();
  for (const row of serviceRows) {
    const key = row.ServiceNo.toUpperCase();
    if (!services.has(key)) services.set(key, row);
  }

  return { stops, routes, services, loadedAt: Date.now() };
}

function getDatasets(accountKey: string): Promise<Datasets> {
  if (!datasetsPromise || Date.now() - datasetsLoadedAt > CACHE_TTL_MS) {
    datasetsLoadedAt = Date.now();
    datasetsPromise = loadDatasets(accountKey).catch((err) => {
      // Don't cache failures
      datasetsPromise = null;
      throw err;
    });
  }
  return datasetsPromise;
}

function mapCategory(category?: string): BusRouteResponse['category'] {
  const c = (category || '').toUpperCase();
  if (c.includes('FEEDER')) return 'Feeder';
  if (c.includes('EXPRESS')) return 'Express';
  return 'Trunk';
}

const TIME_RE = /^\d{4}$/;
const firstLast = (first?: string, last?: string): FirstLast =>
  first && last && TIME_RE.test(first) && TIME_RE.test(last) ? [first, last] : null;

function buildDirection(rows: LTABusRouteRow[], stops: Map<string, LTABusStop>): RouteDirection | undefined {
  const ordered = [...rows].sort((a, b) => a.StopSequence - b.StopSequence);
  const routeStops: RouteStop[] = [];
  for (const row of ordered) {
    const stop = stops.get(row.BusStopCode);
    if (!stop) continue;
    const times = {
      weekday: firstLast(row.WD_FirstBus, row.WD_LastBus),
      saturday: firstLast(row.SAT_FirstBus, row.SAT_LastBus),
      sunday: firstLast(row.SUN_FirstBus, row.SUN_LastBus),
    };
    routeStops.push({
      code: stop.BusStopCode,
      name: stop.Description,
      road: stop.RoadName,
      lat: stop.Latitude,
      lng: stop.Longitude,
      ...(times.weekday || times.saturday || times.sunday ? { firstLastBus: times } : {}),
    });
  }
  if (routeStops.length === 0) return undefined;
  return {
    origin: routeStops[0].name,
    destination: routeStops[routeStops.length - 1].name,
    stops: routeStops,
    path: routeStops.map((s) => [s.lat, s.lng]),
  };
}

export function buildRoute(serviceNo: string, data: Datasets): BusRouteResponse | null {
  const key = serviceNo.toUpperCase();
  const rows = data.routes.get(key);
  if (!rows || rows.length === 0) return null;

  const direction1 = buildDirection(rows.filter((r) => r.Direction === 1), data.stops);
  const direction2 = buildDirection(rows.filter((r) => r.Direction === 2), data.stops);
  if (!direction1) return null;

  const service = data.services.get(key);
  return {
    serviceNo: rows[0].ServiceNo,
    operator: rows[0].Operator,
    category: mapCategory(service?.Category),
    direction1,
    ...(direction2 ? { direction2 } : {}),
    source: 'LTA_DATAMALL',
  };
}

function send(res: Response | any, status: number, body: unknown, cacheControl?: string) {
  if (cacheControl && res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  return body;
}

export default async function handler(req: Request | any, res: Response | any) {
  const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
  const serviceNo = ((req.query?.ServiceNo || req.query?.serviceNo || url.searchParams.get('ServiceNo') || url.searchParams.get('serviceNo')) as string | undefined)?.trim();

  if (!serviceNo || !/^[0-9A-Za-z]{1,6}$/.test(serviceNo)) {
    return send(res, 400, {
      error: 'Missing or invalid query parameter: ServiceNo',
      usage: '/api/bus-route?ServiceNo=72',
    });
  }

  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
  if (!accountKey) {
    return send(res, 503, { error: 'LTA_ACCOUNT_KEY not configured; route data unavailable.' });
  }

  try {
    const data = await getDatasets(accountKey);
    const route = buildRoute(serviceNo, data);
    if (!route) {
      return send(res, 404, { error: `Bus service ${serviceNo} not found in LTA DataMall BusRoutes.` }, 'public, s-maxage=3600');
    }
    // Route data is near-static: cache at the edge for a day, serve stale for a week while revalidating
    return send(res, 200, route, 'public, s-maxage=86400, stale-while-revalidate=604800');
  } catch (err) {
    console.error('Failed to load LTA route datasets:', err);
    return send(res, 502, { error: 'Failed to load route data from LTA DataMall.' });
  }
}
