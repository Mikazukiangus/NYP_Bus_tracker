# Outbound URL and SSRF protection

Released and verified on 22 October 2026 in application commit `ecb4daa`; see `COMMENTS.md` Turns 92–93 for implementation, checks and production delivery.

## Where the guard applies

The current API does not accept an arbitrary visitor URL: its query schemas accept stop/service identifiers only. Server fetches use configured LTA/NEA URLs, and the offline shape builder uses configured Overpass URLs. All of those default transports now use `safeFetch` from `security/ssrf.ts`, including health probes and the LTA route downloader. Existing retry, cache and simulated/unavailable behavior remains in the services.

Browser-only fetches for maps, places and static assets remain browser requests; they cannot use Node DNS/socket controls. No new URL-fetching endpoint was added.

## Use it for a future URL input

Use the guarded fetch directly in server code, after validating the surrounding request schema:

```ts
import { safeFetch } from '../security/ssrf.ts'; // Adjust the relative path.

const response = await safeFetch(userUrl, {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(10_000),
});
```

`assertPublicUrl` checks syntax and literal addresses only. Calling it and then using ordinary `fetch` would lose the DNS protection. Use `safeFetch` for the actual connection. String, URL and native Request inputs are supported. The later [timeout follow-up](outbound-timeouts.md) combines a configurable 30-second default deadline with caller/Request signals; an explicit finite `timeoutMs` supports longer operations such as Overpass. New connections have a configurable 10-second timeout. See Turn 98 for this follow-up's local delivery status.

Do not copy incoming visitor headers, cookies, authorization or server provider keys into a fetch to an arbitrary user-selected public host. The current provider adapters construct their upstream headers explicitly. A guard against private addresses does not make arbitrary public destinations trustworthy or validate their response content. Keep the existing provider response schemas and apply size/content limits appropriate to any future download feature.

## Enforced policy

- Only absolute HTTP/HTTPS URLs. Production provider configuration still requires HTTPS. URL credentials, fragments, control characters, raw whitespace, backslashes, invalid host syntax and URLs over 4,096 characters are rejected. A parsed URL canonicalizes alternate numeric IPv4 spellings before the address check.
- IPv4 must be ordinary public unicast. Private, loopback, link-local/metadata, shared CGNAT, unspecified, reserved/documentation/benchmarking, multicast and broadcast ranges are denied. Azure's platform virtual address `168.63.129.16` is also denied.
- IPv6 must be ordinary global unicast within `2000::/3`. Local/loopback/link-local/multicast/reserved/documentation ranges are denied, as are mapped IPv4, NAT64, 6to4 and Teredo forms. Rejecting all mapped/transition forms is intentional, including ones encoding a public IPv4 address.
- Local hostname suffixes and single-label names are rejected. Other names are resolved using the operating system lookup with all returned IPv4/IPv6 answers. Empty/invalid/failed lookups and any answer set containing an unsafe address fail closed, even when another address or the requested family is public.
- The DNS check runs **inside the connection's lookup callback**. Only the addresses checked in that callback reach the socket; there is no second unguarded lookup after a preflight. Every new connection repeats the check. Reusing an established connection keeps its previously checked peer rather than reconnecting through changed DNS.
- All redirects are refused, including public HTTPS redirects and caller requests for follow/manual behavior. A moved provider requires a deliberate configuration update. The wrapper also rejects any returned 3xx response.
- The wrapper fixes its own direct Undici dispatcher. Caller dispatcher overrides and environment/global proxies cannot replace it. Host, proxy-authorization, connection and upgrade header overrides are rejected. HTTPS keeps normal certificate/hostname verification and SNI.
- Guard failures and native fetch errors have bounded messages without supplied URLs, addresses, credentials or native causes. Existing application logging redacts errors; do not add raw response bodies or received URLs to logs.

This policy also blocks private provider destinations during development. The frontend development server itself can still run on localhost. Configuration parsing alone may accept a development loopback URL, but the outbound guard refuses to contact it. Use explicit in-process mock transport injection for provider fixtures; there is no environment switch that disables private-address checks. `createSafeFetcher`/`createGuardedLookup` resolver injection is a trusted code/test seam, never a request option.

## Validation and limits

Regressions cover IPv4/IPv6 range boundaries, numeric encodings and malformed URLs, exact public lookup outputs, changed DNS answers, mixed-family private answers, private literals, real native socket rejection with zero trap connections, forced dispatch/redirect policy, native redirect refusal, safe errors and all default provider/health transports. An architecture check prevents raw fetch/alternate HTTP transports in server and provider build entry points.

Node 24's native fetch is paired with pinned Undici 7.30.1 and ipaddr.js 2.5.0. A real credential-free NEA HTTPS response passed its current runtime schema with TLS verification enabled; configured provider hostnames passed public DNS checks. A real public HTTP-to-HTTPS redirect was refused. These bounded checks do not claim an exhaustive network-boundary audit.

Production delivery reached READY at the exact application commit. Its guarded route downloader generated 601 services and a network with 5,209 stops / 797 directions. Real LTA arrivals, route/incident data, NEA weather and health responses passed live checks; weather initially missed seven datasets and missed two on follow-up. All 58 CORS policy checks and normal browser flows at 375 px and 1280 px passed. Private-address/DNS-rebinding/redirect attack cases were tested locally with controlled fixtures; no arbitrary URL endpoint, live private-network probe or security bypass was added for verification.

Network egress controls remain a separate defense against infrastructure-specific routing, transparent proxies or custom network translation that application IP classification cannot observe. No firewall, Vercel environment, real credential or production setting was changed.

References: [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Node socket lookup options](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener), [Undici connection configuration](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md), [ipaddr.js address classification](https://github.com/whitequark/ipaddr.js), [Azure platform virtual IP](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16).
