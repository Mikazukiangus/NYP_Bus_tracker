# Bus-arrival response contract

`GET /api/bus-arrival?BusStopCode=55329` returns the services at a stop. Optional `ServiceNo=72` requests one service. This document describes the local API contract, including the validation added on 20 October 2026; it does not indicate a new deployment.

API reads also apply the [exact-origin CORS policy](../cors.md): approved frontend origins can read responses, untrusted Origin-bearing requests receive 403, and approved read preflights return an empty 204 without provider work. Cookie-authenticated cross-origin sharing is disabled.

The example below is illustrative, not a captured live response:

```json
{
  "odata.metadata": "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival",
  "BusStopCode": "55329",
  "Services": [
    {
      "ServiceNo": "72",
      "Operator": "GAS",
      "NextBus": {
        "OriginCode": "55509",
        "DestinationCode": "75009",
        "EstimatedArrival": "2026-10-20T10:05:00+08:00",
        "Monitored": 1,
        "Latitude": "1.379",
        "Longitude": "103.849",
        "VisitNumber": "1",
        "Load": "SEA",
        "Feature": "WAB",
        "Type": "DD"
      },
      "NextBus2": {},
      "NextBus3": {}
    }
  ],
  "source": "LTA_DATAMALL_V3"
}
```

`NextBus2` and `NextBus3` use the same bus-record shape. LTA documents blank subsequent-bus fields when no further bus is available; the application's validator also tolerates omitted slots, `null`, and `{}`. A record with a blank `EstimatedArrival` represents no estimate and may have blank attributes. `Services: []` is a valid live response with no services due, distinct from a failed request.

## Validated fields

The public response requires a five-digit string `BusStopCode` matching the requested stop, a `Services` array, and a recognised application `source`. Each service must have a nonempty alphanumeric string `ServiceNo` (up to six characters) and an operator of `SBST`, `SMRT`, `TTS`, or `GAS`.

A nonempty estimated bus must provide:

- `EstimatedArrival`: a real calendar date and time in ISO form, with seconds and `Z` or a numeric timezone offset. Invalid dates and timestamps without a timezone are rejected.
- `Load`: `SEA`, `SDA`, or `LSD`.
- `Feature`: `WAB` or a blank string.
- `Type`: `SD`, `DD`, or `BD`.

Other fields are optional for compatibility with partial records, but validated when present:

- `OriginCode` and `DestinationCode`: five-digit strings or blank.
- `Latitude` and `Longitude`: decimal strings within ±90 and ±180 respectively, or blank. Zero is permitted for unavailable GPS; it is not converted into a live bus position.
- `VisitNumber`: a positive integer string or blank.
- `Monitored`: numeric `0` (schedule-based) or `1` (GPS-based), not the strings `"0"`/`"1"`. Blank is also tolerated in a no-estimate placeholder; an omitted value is treated as unmonitored by the UI.
- `odata.metadata` and application `warning`: strings when present. Metadata is optional and is not used to calculate arrivals.

Unknown additive fields are discarded at validation, rather than echoed to callers or passed into the UI. No field is silently converted from the wrong JSON type. There is one shared contract and validator in `shared/transit/arrivals.ts`; the server type module re-exports it.

## Failure and fallback behavior

The server validates untrusted provider JSON before applying its live-source label. A malformed envelope, invalid service/bus field or mismatched stop rejects the entire snapshot. Invalid JSON also takes this path. The server logs `lta.arrivals_invalid_response` with at most eight field paths and constraint messages, for example:

```json
{
  "issues": [
    {
      "path": "Services[0].NextBus.Load",
      "message": "must be a recognised value"
    }
  ]
}
```

Diagnostics do not include supplied values, provider response bodies or JSON parser snippets. Existing HTTP-error and transport-error logging remains redacted.

The endpoint preserves its existing HTTP 200 simulated fallback when credentials are absent or provider data cannot be used. Its body uses the same envelope, with `source: "FALLBACK_SIMULATED"` and an explanatory `warning`. With a configured key, the warning identifies invalid/unavailable upstream data instead of incorrectly claiming that credentials are missing. Only validated live arrivals receive the configured live-arrival CDN cache header. Simulations are never accepted as live browser data.

The browser independently validates the public JSON before mapping any service or calculating countdowns. A malformed snapshot returns the client's unavailable result (`null`), which the existing UI handles with its labelled fallback. Missing/blank bus slots become null estimates. The browser never substitutes a fabricated 99-minute ETA for malformed data.

All five public endpoints now share the [request-boundary contract](../input-validation.md). Arrivals accepts GET/HEAD, requires a five-digit string stop code and accepts an optional service of up to six letters/digits. The existing lower-camel aliases remain supported. Repeated keys, conflicting aliases, unknown query keys, arrays/nested query values and request bodies are rejected before a provider call. Service numbers normalize to uppercase; stop-code leading zeros are retained. Blank optional `ServiceNo` still means no service filter.

Malformed or missing input returns HTTP 400 with bounded schema paths and no supplied values:

```json
{
  "error": "Invalid request.",
  "issues": [{ "path": "query.BusStopCode", "message": "Invalid or unsupported input." }]
}
```

Unsupported methods return HTTP 405 with `Allow: GET, HEAD`. Request errors use `Cache-Control: no-store`. This replaces the older missing-parameter `usage` body; successful arrival responses and labelled simulated fallbacks remain unchanged.

Provider reference: [LTA DataMall API User Guide, Bus Arrival section](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), version 6.10, 1 October 2026. The application-specific `source`, fallback and compatibility rules above are defined by this repository.
