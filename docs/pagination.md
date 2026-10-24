# Public list pagination

Use **offset pagination with a content snapshot fingerprint** for the current traffic-incident collection. This app has no SQL database or persistent incident IDs: LTA delivers a complete, modest feed which the app validates and caches. Offset slicing is straightforward after preparing that snapshot once per warm owner. A cursor/keyset query would add token/state machinery without a database index to seek through. If incidents later become a large persistent history with stable IDs and a unique indexed order, revisit keyset cursors.

## Which endpoints are lists?

| Endpoint | Decision |
| --- | --- |
| `/api/traffic-incidents` | Independent collection; supports the pagination below. |
| `/api/bus-arrival` and `/api/BusArrival` | One stop's live arrival snapshot. Keep its small Services array together for stop boards and trip ranking; ServiceNo already filters the request. |
| `/api/bus-route?ServiceNo=72` | One route with related ordered direction/stop calls. Splitting it would invalidate route decoding, geometry and boarding references. |
| `/api/weather` | One multi-dataset snapshot, with station/forecast arrays and missing/stale relationships; keep it atomic. |
| `/api/health` | One status resource; no list. |

Generated `/bus-routes/` and `/route-shapes/` files are versioned graph/geometry resources rather than list API endpoints. The browser stop picker and saved-bus list are local indexed/storage data. Their existing local limits are unchanged. Provider `$skip` paging already exists in the bulk LTA downloader and is separate from this public API contract.

## Request contract

```http
GET /api/traffic-incidents?limit=100&offset=0
GET /api/traffic-incidents?limit=100&offset=100&snapshot=<pagination.snapshot>
```

- `limit`: canonical decimal integer 1–200, default 100 when any pagination parameter is supplied.
- `offset`: canonical decimal integer 0–10,000, default 0. Leading zeros except `0`, signs, whitespace, decimals/exponents and repeated/array/nested values are rejected.
- `snapshot`: 64 lowercase hexadecimal characters returned by the first page. Required for offset > 0. Unknown parameters, including `cursor`, are rejected.
- To preserve deployed/older clients, **no query parameters still returns the complete legacy feed**, without pagination metadata. Use `?limit=100` or `?offset=0` to opt in. This change does not silently truncate an old map's markers. Making the paged response the default requires a later versioned compatibility change.

Limits are shared wire-contract bounds in `shared/transit/incidentPagination.ts`, not environment settings that can drift between client and server builds. The validated provider/public feed has a 10,000-record safety bound; oversized feeds fail instead of silently truncating. Pagination rejects malformed input before provider/cache work and retains GET/HEAD/CORS/method/body guards.

## Response and consistency

The existing `incidents`, `fetchedAt` and `source` fields are preserved. Paged responses add:

```text
pagination: {
  limit: number,
  offset: number,
  total: number,
  nextOffset: number | null,
  snapshot: string
}
```

`total` is the count in the complete validated snapshot, not a database count query. `nextOffset: null` ends traversal. Empty and beyond-end pages return an empty incidents array and null continuation. The parser validates actual row count, offset/limit/total bounds and the exact expected nextOffset, preventing malformed metadata from driving a loop or partial-success display.

Rows are ordered by an exact canonical JSON tuple of type, latitude, longitude and message, independent of provider ordering, locale and server instance. Identical rows remain identical repeated occurrences; no synthetic ID or guessed deduplication loses data. The order is deterministic, not distance or recency ranking. One immutable body owner gets one sorted/fingerprinted preparation, held weakly so replaced snapshots can be collected.

The SHA-256 fingerprint covers the ordered content and a contract version. It excludes fetchedAt: identical feeds fetched by different server instances remain compatible, while any content/count change invalidates continuation. The fingerprint is public version metadata, not an authentication capability, secret or database cursor. It needs no signing key. An old snapshot is not retained after replacement.

When continuation targets changed content, the API returns HTTP 409 and `Cache-Control: no-store`:

```json
{"error":"Incident data changed. Restart from offset 0.","code":"SNAPSHOT_CHANGED"}
```

No mixed generation is returned as a successful continuation. Normal page responses are also no-store, so CDN storage does not independently age/replace page fragments. The existing two-minute warm service cache, pending-request coalescing, provider retries/breaker and explicit invalidation remain in effect. Pages reuse one provider snapshot rather than each issuing a new provider request. The legacy unpaged response retains its existing age-adjusted CDN cache policy. New snapshots can differ between instances; a changing feed can cause a restart even while another instance still has the earlier content. This is detection of inconsistency, not distributed snapshot storage.

## Browser behavior

The incident data adapter requests sequential 100-record pages and publishes only a complete validated feed. The existing route hook then filters the complete set near the route. No intermediate page is shown as all incidents, and a later page failure retains the hook's previous complete feed as stale (or reports unavailable if none exists).

A 409 discards accumulated rows and restarts from offset zero once. A second conflict, malformed metadata, changed total/fingerprint, 429, outage or expired deadline fails the read; there is no unbounded retry. One configured request timeout covers the entire traversal and restart, and the page-count/record bounds cap work. When timestamps differ for equal content, the aggregate uses the oldest fetchedAt so freshness is conservative. The client constructs local query URLs from validated numeric metadata; it never follows a server-supplied URL. Request count is higher for multi-page feeds and still counts toward the existing IP firewall limit.

For rolling upgrades, the client accepts the complete legacy envelope on the first response. If an older server rejects pagination parameters with 400, it makes one unpaged request within the same deadline. Missing metadata on later pages is rejected. The compatibility path does not merge partial generations.

Pagination bounds individual page payloads and supports list consumers fetching only what they need. It does not reduce the provider's full-feed download, and the map still downloads all incidents for correct route filtering; no overall map bandwidth/CPU speedup is claimed. There is no SQL query or new index to add in this architecture.

## Validation and delivery

See `tests/incident-pagination.test.ts` and COMMENTS.md for actual checks/delivery. Controlled browser fixtures use the real API handler, parser, client and route-incident hook at phone/desktop widths, with gated final pages, changed snapshots and later-page errors. These are local functional checks, not live provider/deployment verification. Application release remains a separate action.

Primary references: [Microsoft API design guidance](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design) discusses bounded pagination; [PostgreSQL's ordering/offset explanation](https://www.postgresql.org/docs/current/queries-limit.html) explains why predictable ordering matters and large database offsets can be expensive. This implementation slices an in-memory snapshot; it does not introduce PostgreSQL.
