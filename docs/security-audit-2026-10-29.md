# Security audit and remediation — 29 October 2026

Baseline: `69a0158369fd81c0e8c8812b2eb42835c67c7a78`. Baseline locations below refer to that commit. Phase 1 was strictly read-only/offline: no edits (including COMMENTS), production access, installations or third-party calls. The user subsequently approved the recommendations and explicitly chose to keep remote verification deferred. Work is on `security/audit-20261029`; local category commits do not authorize pushes, deployments or firewall publication.

## Stack, boundaries and data

TypeScript/Node 24, React 19/Vite 8/Tailwind 4/Leaflet, Zod 4, Express 4.22.3 and Vercel functions. No ORM/database, application authentication, uploads, incoming provider webhook, email, payment or runtime LLM feature was found. Public GET/HEAD APIs: arrivals (including legacy alias), routes, weather, incidents and health; anonymous POST/OPTIONS telemetry; approved API CORS preflights; static SPA/public JSON. See server.ts:28 and api/*.ts. GitHub's scheduled OSM refresh writes public shape JSON; the Vercel build generates LTA routes after its types/HTTPS/tests gate. Config/env loading is centralized and only config.public is bundled.

Assets: provider credentials/quotas, source and release integrity, availability, telemetry, and browser-local GPS/addresses/recent places. Actors: anonymous clients, data contributors, compromised dependencies/actions and shared-browser users. Boundaries: browser/API, provider/API, external data/build, dependencies/CI and stored browser data/UI. Top STRIDE scenarios: health quota exhaustion (D); fake reports exhausting telemetry admission (S/D); oversized external data exhausting builds/functions (T/D); shared-profile location disclosure (I); compromised mutable CI actions running with repository-write permissions (T/E).

## Findings and delivery state

No confirmed Critical/High application vulnerability was established. These source/in-memory findings are not a claim that the system is secure. Runtime/platform and current-advisory limits remain below.

| ID | Severity | Baseline evidence / excerpt | Scenario | Proposed control | State |
| --- | --- | --- | --- | --- | --- |
| F01 | Medium | api/health.ts:41 `await Promise.all([…probe(…), probe(…)])` | Anonymous repeated GET/HEAD requests spend provider quota outside the weather budget. | Bounded probe reuse, single-flight and endpoint budget. | Local implementation in c138c03; post-commit gate: 349 tests / 47 files plus types/HTTPS. Gateway publication pending. |
| F02 | Medium | server/errors/ingest.ts:81 `count >= reportPolicy.serverEvents`, then `count++` | 100 invalid requests exhaust a warm instance's allowance; the next valid request returns 429. | Retain bounded admission, lower edge/IP budget and observe losses. | Templates/diagnostics implemented locally; mitigation is NOT active until gateway publication. |
| F03 | Medium | shared/http/circuitBreaker.ts:26 `response.json()`; server/lta/client.ts:41 unbounded batch loop; server/overpassSchema.ts:4 unbounded arrays | Large or malicious provider/OSM responses exhaust memory/work despite timeouts. | Decoded-byte, row/page/geometry and total collection bounds. | Implemented locally; full offline gate: 356 tests / 48 files plus types/HTTPS. |
| F04 | Medium | scripts/verify.ts:9 stages are types/HTTPS/tests; package.json:26 separate `secrets:scan` | A forgotten manual scan allows secret/advisory-bearing changes past the gate. | Enforced local/CI scans and dependency audit/update policy. | Local scanner/hook, CI definitions and Dependabot implemented. 358 tests pass; remote execution/required checks remain unverified. |
| F05 | Medium | .github/workflows/refresh-data.yml:14,26 `contents: write`, `actions/checkout@v7`, `actions/setup-node@v7` | A compromised mutable action tag executes within a write-scoped job. | Reviewed immutable action pins and least-privilege jobs. | Exact pins deferred: user prohibits remote verification. No guessed SHAs or unverified downgrades. |
| F06 | Low | security/transport.ts:4 only HSTS/CSP; server.ts:19 `express()` | Fewer explicit browser restrictions and a standalone framework banner; not a demonstrated XSS. | Appropriate headers, disable Express banner, preserve GPS/CORS behavior. | Pending. |
| F07 | Low | security/transport.ts:6 `connect-src 'self' https: wss:` | A separate script compromise can contact arbitrary external origins. | Narrow configured destinations; report-only trial for changed policy. | Pending. |
| F08 | Low | src/services/persistence.ts:6 `localStorage.setItem`; userLocation.ts:15 no expiry; useRecentPlaces.ts:11 no deletion control | Shared-browser users recover retained GPS/addresses. | Clear/export controls, retention notice, preserve remembered-location behavior. | Pending. |
| U01 | Info / Unverified | package-lock.json:1654 body-parser 1.20.8; :3013 qs 6.16.0; SECURITY.md:105 prior advisory snapshot | Relevant compressed-body or qs.stringify path would be needed; no first-party path established. | Fresh advisory/provenance/reachability check before compatible updates. | Deferred offline; no upgrades or new runtime packages. |

## All 50 checklist items — baseline

PASS means source/local checks, not a new production assessment. NA reasons describe the detected application, not its hosting operator accounts.

| # | Item | Result and evidence/reason |
| --- | --- | --- |
| 1 | SQL injection | NA: no DB/ORM/query layer. |
| 2 | XSS | PASS: React escaping; map/dom.ts:5 textContent; attribution.ts:6 attribute encoding. |
| 3 | Server input validation | PASS: server/http/request.ts:7 strict schemas; ingest.ts:84 strict envelopes. |
| 4 | Path traversal | NA HTTP file paths; build service filenames are alphanumeric allowlisted. |
| 5 | SSRF | PASS current boundary: no user-controlled destination URL; ssrf.ts:59 socket-time checks, :95 no redirects/deadlines. Future arbitrary URLs need host allowlists. |
| 6 | Work/size limits | FAIL F01–F03; telemetry 8,192-byte/schema/deadline bounds exist. Hosting pre-parser limits unverified. |
| 7 | Unicode/encoding | PASS: security identifiers ASCII-only/canonical uppercase; UTF-8; no email/user identity comparison. |
| 8 | Authorization | NA: intentional public APIs, no privileged application actions. |
| 9 | IDOR | NA: public stop/service identifiers, no owned records. |
| 10 | Mass assignment | NA: no persisted server models; strict telemetry DTO. |
| 11 | RBAC/least privilege | Unverified operator/key scopes; no application roles. |
| 12 | RLS | NA: no relational/tenant database. |
| 13 | CSRF | NA cookie-authenticated mutations; telemetry requires Origin and refuses credentials. |
| 14 | CORS | PASS: cors.ts:39 exact allowlist, bounded headers/methods, no credentialed wildcard. |
| 15 | Clickjacking | PASS: frame-ancestors none. |
| 16 | CSP | FAIL F07; script policy strong, Leaflet inline styles justified. |
| 17 | Headers | FAIL F06; platform additions unverified. |
| 18 | TLS/HSTS | Unverified current TLS/cert alerts; source HTTPS/two-year HSTS and literal scan pass. |
| 19 | Cookies | NA no cookies issued; secure helper constraints inspected/tested. |
| 20 | Cache privacy | PASS: public feeds cached; health/errors/telemetry no-store. |
| 21 | Secrets/history | PASS scoped: zero configured-rule findings, 2,265 text inputs/103 reachable commits. No remote refs fetched. |
| 22 | Env hygiene | PASS .gitignore:11, blank example, no local-history .env commits; Docker NA. |
| 23 | Secret scanning enforcement | FAIL F04; hosted push protection unverified. |
| 24 | Rotation/owners/expiry | Unverified; SECURITY.md:93 has rotation procedure. |
| 25 | Crypto/randomness | PASS: randomUUID; SHA-256 public fingerprints; random jitter is not a token. |
| 26 | Password storage | NA no passwords. |
| 27 | At-rest encryption | Unverified device/hosting/log encryption; no DB/bucket. |
| 28 | Constant-time comparison | NA no secret/HMAC comparisons. |
| 29 | JWT | NA no JWT. |
| 30 | Refresh tokens | NA no tokens. |
| 31 | OAuth/OIDC | NA no integration. |
| 32 | Sessions | NA no sessions. |
| 33 | MFA | NA application accounts; operator MFA unverified. |
| 34 | Login brute force | NA no login/reset/OTP/signup; public abuse F01/F02. |
| 35 | Enumeration | NA no accounts/recovery flow. |
| 36 | Uploads | NA no uploads. |
| 37 | Webhooks | NA incoming consumer; deployment hook is outbound CI only. |
| 38 | Storage/presigned URLs | NA no user bucket or signing feature. |
| 39 | Current advisories | Unverified U01; fresh npm audit prohibited, no cached response. |
| 40 | Supply chain | FAIL F05; lock/npm ci present, hosted branch protection unverified. |
| 41 | Package provenance | Unverified registry publisher/history; locked packages/integrities locally present. |
| 42 | Containers | NA no application container configuration. |
| 43 | Network IaC | NA no security-group/database IaC; live WAF unverified. |
| 44 | Privacy lifecycle | FAIL F08; engineering finding, not GDPR certification. |
| 45 | Log integrity/retention | Unverified platform controls; application UTC/anonymous request context is present. |
| 46 | Safe errors | PASS generic reference-only public errors, redaction and explicitly untrusted browser reports. |
| 47 | Email | NA no email-sending integration; DNS not queried. |
| 48 | Abuse | FAIL F01/F02; live WAF not inspected. |
| 49 | LLM | NA no runtime LLM feature; coding MCP is not app functionality. |
| 50 | Money | NA no financial transactions. |

## Remaining human/platform checks

Verify GitHub branch/review/push-protection/operator-MFA settings, Vercel WAF and rule capacity, TLS/certificate alerts, log access/retention/residency/encryption and credential owners/scopes/expiry/rotation overlap. No exposed secret was identified requiring rotation in the scoped scan. Current registry advisories/publisher history and immutable CI action pins require separately authorized verification or trusted offline evidence. No production settings will be changed by this branch. Tests use controlled data/loopback, with external connections denied during local verification.

## Resource budgets (F03)

JSON readers count actual decoded stream bytes (default 8 MiB, Overpass 64 MiB), reject nesting beyond 64 and invalid UTF-8, and cancel rejected streams. LTA pages contain at most 500 rows; validated LTA_MAX_PAGES, LTA_MAX_ROWS and LTA_COLLECTION_TIMEOUT_MS default to 512 / 250,000 / 45,000 ms. Collections reject rather than publish partial data at the cap. OSM caps 200,000 elements, 20,000 points per way/members per relation, two million aggregate points/members, 100,000 expanded points per route, five million expanded points per build and 50 million simplification comparisons. Route generation checks its budgets before writes. Existing committed data were not regenerated; future larger legitimate datasets may require reviewed limits. No new dependency was added.
