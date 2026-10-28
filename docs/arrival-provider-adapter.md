# Bus-arrival provider adapter

The bus-arrival integration has three responsibilities:

| File | Responsibility |
| --- | --- |
| `server/arrivals/provider.ts` | Provider/service interfaces, query and explicit result types |
| `server/arrivals/service.ts` | Consume a provider result; use the injected simulation policy only when the provider is unavailable |
| `server/lta/arrivalProvider.ts` | LTA credentials/URL, guarded HTTP, deadlines, safe retries, circuit state, JSON validation and dependency diagnostics |
| `server/lta/arrivals.ts` | Existing default composition: LTA adapter plus the existing deterministic simulated fallback and warnings |
| `api/bus-arrival.ts` | HTTP input checks, response/cache headers and safe error/request logging; handler factory accepts the `ArrivalService` interface |

Existing callers of `server/lta/arrivals.ts` keep their settings/dependency injection. The default production composition still uses LTA; there is no new provider, secret, setting or network failover enabled by this refactor.

## Replace the provider

Implement this interface from `server/arrivals/provider.ts`:

```ts
interface ArrivalProvider {
  fetchArrivals(query: ArrivalQuery): Promise<ArrivalProviderResult>;
}
```

`ArrivalQuery` carries `stopCode` and optional `serviceNo`. Return either `{ status: 'available', body }` or `{ status: 'unavailable', reason }`. Reasons are `not_configured`, `invalid_response` and `unavailable`. An available result with `Services: []` is valid live data and must not trigger simulation or another provider call.

At the default composition in `api/bus-arrival.ts`, replace the concrete factory import and service construction with:

```ts
import { createArrivalService } from '../server/arrivals/service.ts';

const service = createArrivalService(replacementProvider, simulationFactory);
```

Here `replacementProvider` and `simulationFactory` are application-owned dependencies, not additional configuration variables. Keep the existing `createArrivalHandler(service)` export. `simulationFactory` receives the same query and unavailable reason and must return a `FALLBACK_SIMULATED` response. The default factory in `server/lta/arrivals.ts` is the reference for retaining the current simulation and warning policy. The HTTP handler and browser callers need no changes for an adapter satisfying the current contract. Changing production wiring belongs in the default composition, not in a UI component.

The contract intentionally retains the existing validated Singapore/LTA-compatible wire shape, including stop/service identities, absolute ETAs and monitored/scheduled fields. Available responses currently require `source: 'LTA_DATAMALL_V3'`; this is provenance, not a generic “live” flag. A replacement delivering the same LTA feed can implement this port. A genuinely different data source needs an explicit shared source-contract/browser-label update before use; do not relabel unrelated or simulated data as LTA. This refactor does not broaden the browser's accepted sources.

## Add a live fallback later

A future composite adapter can implement the same `ArrivalProvider` port: return the primary result if it is available, and consult a secondary only for an explicit unavailable outcome. Compose that adapter into the same application service. Keep the existing simulation policy last; never pass real secondary data through the simulation factory or mark a simulated response live.

Before enabling that secondary, budget the complete chain's latency, retain each dependency's guarded transport/schema checks and circuit ownership, and handle caller cancellation without starting another request. Do not add another retry loop around the application service: the concrete LTA adapter already retries safe reads and limits recovery probes to one request. Adapters translate expected operational failures into unavailable outcomes. The application service does not catch adapter rejections: unexpected rejections reach the existing safe HTTP error handler. The concrete LTA adapter retains its existing request-failure classification and logging.

## Verification

`tests/arrival-provider.test.ts` tests replacement/isolation, query forwarding, empty live data, unavailable reasons, unexpected defects and concrete LTA adapter outcomes. `tests/arrival-provider.integration.test.ts` runs a replacement through a real local HTTP endpoint and the actual browser decoder, including malformed request rejection, explicit simulated fallback and safe HTTP errors. Existing arrival, retry, circuit, validation, timeout and HTTP integration tests continue to exercise the default LTA composition. An architecture guard prevents the application service from importing concrete provider/transport/configuration modules.

Run `npm run verify` for the same full check set used by the Vercel CI/CD build gate. No real provider key is needed by these fixtures.
