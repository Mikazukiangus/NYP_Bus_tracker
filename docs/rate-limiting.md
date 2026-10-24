# Public API rate limiting

The user chose IP limits now and verified-account limits when login exists. No anonymous cookie, client-supplied user ID, login or session was added.

## Policy and enforcement location

`config/firewall.ts` contains one validated, versioned policy object and generates a native Vercel rule. The budget is **600 requests per 60-second fixed window per source IP per Vercel region**, shared across `/api/` GET/HEAD reads and exactly POST `/api/client-errors`, query values, hosts and deployments covered by the project rule. The legacy `/api/BusArrival` alias participates. Future `/api/` read endpoints inherit the policy. This generous initial limit leaves room for multiple open views/tabs and shared networks; tune using observed traffic, not a claimed production per-user profile.

Vercel WAF evaluates the rule at the platform boundary, including cache hits; it does not depend on warm function memory, provider success or application cache keys. IP grouping uses the platform's source-IP key, not a client-controlled `x-user-id`, cookie, Authorization value or a manually parsed forwarded-header chain. No IPs are copied into application logs or stored by this code. Existing Vercel traffic logs/retention still apply.

OPTIONS preflights, unsupported write methods and UI/static/map datasets are outside this rule. Application method/body/query/CORS validation remains in place. It protects this project's API reads, not direct browser calls to OneMap/NEA or arbitrary static downloads. There is no standalone Express limiter: exposing that server publicly outside Vercel requires equivalent reverse-proxy limits first. Local development is unaffected.

Important limits: shared NAT/VPN addresses share a budget; IPv6 address rotation and distributed sources can bypass a per-IP policy. Fixed windows permit bursts around a boundary. Counters are per region, not one strict worldwide quota. A Vercel rule, its plan allowance and infrastructure pricing are separate from application `.env` values; no new runtime secret or environment variable is required. Check current plan/usage before publishing. One rule fits the documented Hobby rate-limit rule allowance.

## Current delivery state — 24 October 2026

**Blocking is live.** The existing rule was updated and published through the authenticated Vercel API at the user's request:

- Project: `prj_hRkofLg97cZMW7uyG1cvDrDx4R7L`, team `carbon-bc04`.
- Rule: `rule_public_api_per_ip_limit_q1VNjS` / `Public API per-IP limit`.
- Active configuration: `waf_YhhlPTGZjZU1`, version `6`, `firewallEnabled: true`; zero pending draft changes.
- Conditions: (path starts with `/api/` AND method is GET or HEAD) OR (path equals `/api/client-errors` AND method equals POST). No preview/host/test-header restriction remains.
- Rate limit: fixed window, `keys: ["ip"]`, `limit: 600`, `window: 60`, exceeded action **`rate_limit` (HTTP 429)**. Setting this nested action to `log` only observes traffic; `deny` would return 403 instead.
- The active rule now exactly matches `createApiRateLimitRule('production')`. Turn 127 publishes its POST extension after explicit user authorization: MCP read/update returned 404, so the documented authenticated CLI fallback staged one valid rule update, reviewed the complete diff and published it. Active version 6 matches the reviewed rule; other settings are unchanged and no draft remains. Other POST paths and OPTIONS remain excluded. The application collector is still local pending commit/deployment; application deployment and firewall publication are separate.

## Actual verification and limits

The six-hour traffic summary before enforcement contained 248 allowed requests; a one-hour rule query had no exceedance records. This is low-volume aggregate evidence, not a peak per-IP/NAT load study. The generous 600/60 budget was retained.

An existing protected preview was tried first. Unauthenticated requests returned SSO redirects; authenticated CLI probes did not produce a reliable 429 within the short test window. These are not claimed as a successful preview enforcement test. Deployment Protection was never disabled. Vercel curl automatically created an automation bypass token; only that newly created token was revoked after the probe, and its absence verified. No token value was displayed or committed.

To verify native blocking without applying a low threshold to real visitors, a temporary rule on the public host matched a dedicated test header only and used 3 reads per 10 seconds. Actual unauthenticated requests from the Singapore edge verified:

- Three malformed API reads reached the normal 400 boundary, including HEAD and the legacy arrival alias across different paths.
- The fourth read returned 429; supplying forged forwarded-IP, real-IP and user-ID headers remained 429.
- An ordinary untagged read, the page and an approved OPTIONS preflight remained 400/200/204 respectively.
- The next window recovered to the expected 400 response.

The full 600/60 rule then replaced the temporary conditions and was read back as active with no pending changes. Post-enforcement production smoke passed all six API URLs, existing client assets, service index and denied-origin/approved-preflight behavior. The native threshold/recovery test used 3/10 in isolation; no 601-request burst, separate genuine source-IP test, broad outage/load test or continuous monitoring is claimed. No Retry-After header was returned on the observed native 429s.

The version 6 POST extension was verified by exact active-config readback and six low-volume production checks: page 200 with CSP/HSTS, malformed arrival GET/legacy HEAD 400, unrelated weather POST 405, approved preflight 204 and unapproved Origin 403. The existing 600/60 action and IP key are unchanged. No 601-request burst, new native threshold canary or live collector test was performed; the application endpoint is not deployed yet.

## Change or roll back the rule

The offline generator prints the native rule for each stage and performs no remote write:

```bash
npm run --silent firewall:rule -- log
npm run --silent firewall:rule -- preview
npm run --silent firewall:rule -- production
```

Update this existing rule rather than creating another. Preserve its path/method/IP scope and review the complete draft before publishing. The log output changes exceeded requests to observation; preview output enforces only in preview; production output enforces across matching project deployments. Editing local configuration or deploying the app does not automatically change the firewall.

For operator-led review/publication:

```bash
vercel --scope carbon-bc04 firewall diff --project prj_hRkofLg97cZMW7uyG1cvDrDx4R7L
vercel --scope carbon-bc04 firewall publish --project prj_hRkofLg97cZMW7uyG1cvDrDx4R7L --yes
```

Inspect [traffic for this rule](https://vercel.com/carbon-bc04/nypbus-tracker/firewall/traffic?filter=rule_public_api_per_ip_limit_q1VNjS) during representative use, including multiple tabs and shared networks. For a false positive, stage the same rule with `rateLimit.action: log` (or disable only this rule), review and publish the change. Do not discard unrelated future drafts or disable project-wide protections. The broader DDoS, BotID and managed-rule settings were not edited.

WAF rejection happens before application CORS/HTTP handlers and can have a platform-generated non-JSON body; do not promise the application's JSON envelope, CORS headers or Retry-After on that response. Existing browser adapters check HTTP status before parsing, retain their fallback/degraded behavior and have no immediate API retry loop. Clients should wait for the next normal poll or the advertised Retry-After when supplied; do not blindly retry a 429. A same-origin browser works with the normal responses; approved cross-origin clients may see a network/CORS failure on an edge rejection.

## When accounts exist

Add a separate rate-limit check using a server-verified immutable account ID after authentication and before business work. Keep the IP rule as well: a combined `IP:user` key would not independently enforce either budget. Never trust a user ID supplied in a header/query/cookie without verification, and do not interpret an unverified bearer token as identity. The Vercel SDK supports custom keys, but replacing its default key with a user ID removes that check's IP dimension. No speculative authentication hook or disabled account limiter is shipped here.

## Sources

- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting): limits, IP keys, per-region counters, log/429 actions and plan allowances.
- [Vercel CLI firewall](https://vercel.com/docs/cli/firewall): staged changes, inspection and publication.
- [Vercel rate-limit SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk): future verified-user keys and finite check timeouts.

See COMMENTS.md for actual validation and the latest publication/enforcement status.
