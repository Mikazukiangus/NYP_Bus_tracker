# Secrets, logs and repository scan

## Reporting and audit controls — 29 October 2026

Report a suspected vulnerability privately through GitHub's repository security advisory reporting if enabled, or privately to the repository owner. Do not put credentials, exact GPS, exploit payloads containing personal data or production logs in a public issue. Include affected commit, file/line, safe reproduction and impact. Hosted reporting settings were not verified in this offline audit.

The approved remediation branch is `security/audit-20261029`; the evidence, limits and deferred controls are in [the audit record](docs/security-audit-2026-10-29.md). No production change or remote verification is part of that offline work.

Install the repository hook once per clone: `git config core.hooksPath .githooks`. Activate `.venv` before committing. The hook fails closed on scanner failure, checks working files, the staged index and locally reachable history, and prints only finding locations. Hooks can be bypassed; configure required hosted checks and secret push protection as a separate repository setting. The local hook does not replace a hosted gate.

The new `Security checks` workflow uses a read-only token, full checkout without persisted credentials, the existing Gitleaks 8.30.1 development tool (official archive plus matching release checksum), scanner regression and a fail-closed npm advisory report. Moderate or higher advisories fail the dependency check; unavailability also fails. Dependabot proposes npm/action updates weekly. No new runtime package was added. The workflow passed remotely on 8 November 2026 after the compatible transitive dependency patches below. Exact immutable v7 action pins remain a follow-up. The existing Vercel deployment gate does not wait for this separate workflow automatically. Require its successful checks before merge and configure deployment checks if direct pushes can publish. The first run exposed two prior advisories, which were patched without exceptions.

Rotation ownership: the repository/project owner maintains LTA, optional NEA and deployment-hook credentials in the hosting/CI secret stores, reviews provider scope and expiry and performs the rotation procedure below. Where a provider supports simultaneous active keys, provision the replacement, switch environments, verify, then revoke the old key. Where it does not, plan a brief degraded-data interval and revoke/reissue; application support cannot create provider overlap. Never print either key during validation. Provider overlap/expiry capabilities and cloud/operator permissions remain unverified offline.

Browser hardening now explicitly sets nosniff, strict-origin-when-cross-origin, GPS restricted to this origin with camera/microphone disabled, COOP same-origin and CORP same-site. CORS-approved fetches remain allowed; CORP restricts no-cors embedding. Express removes X-Powered-By. TLS versions, renewal alerts and platform-added banners still require hosted verification.

The existing enforced CSP keeps self-only scripts and frame-ancestors none. A narrower candidate is staged as Content-Security-Policy-Report-Only: exact configured API/data/NEA/OneMap origins, no blanket HTTPS/WebSocket allowance, self-only fonts/default sources, no frames/objects, constrained base/form, and Leaflet-compatible inline styles. Inline styles remain necessary for positioned map tiles/controls; inline scripts/eval remain forbidden. No report collector is enabled (violation URLs can reveal browsing/location data); use browser developer-console violations during preview tests. Vercel's static candidate lists default provider origins; when public URL environment settings change, update its report-only origin list with the reviewed values too. Express derives the candidate from validated public config. Before promoting the candidate to enforcement, exercise real preview GPS, tiles, search, weather fallback and any custom API/CDN, inspect violations, then roll out and monitor. This audit did not publish headers or claim the narrowed candidate actively blocks traffic.

Location privacy: open the location picker and expand **Your saved location data** to download or clear the remembered location and recent places. These data persist in this browser until cleared; use separate browser profiles on shared devices. Downloads include addresses/coordinates and should be kept private. Clear uses the existing ordered, cross-tab lock for recent places, cancels pending GPS selection, resets the current journey/location and stops the active get-off alarm. Other open tabs invalidate pending GPS on location deletion; a new explicit selection can save new data later. Blocked storage/locks produce a safe message with browser-settings guidance rather than claiming persistence was cleared. Saved bus controls manage their own records. No export upload, contact collection or automatic expiry was added. OneMap receives address searches and map-tile requests reveal the viewed area; GPS/location coordinates are not added to error reports by these controls.

## Scan result — 19 October 2026

No confirmed credentials were found in the scanned current code or the 52 commits reachable from the fetched local branches, remote-tracking refs, tags and reflogs. This was a full checkout, not a shallow clone. Commit metadata, `.git/config`, uncommitted/untracked first-party files, generated browser files and any local `.env`/npm files present were included. Dependencies and `.venv` were excluded. GitHub-hosted caches, forks, pull-request refs not fetched locally, remote logs and unrelated account credential stores were outside this scan.

The initial Gitleaks 8.30.1 scan identified three candidates: the public `sbs_transit_favorites_v1` browser-storage identifier in current/historical `src/App.tsx`, and prose in `COMMENTS.md`. Each was checked and was not a credential. The storage identifier has an exact-value, generic-rule allowlist in `.gitleaks.toml`; the prose was reworded. No test directory, commit or secret type is broadly ignored. The Git remote has no embedded username/password. No local credential `.env` files were present at audit time.

Gitleaks was installed inside the ignored `.venv/bin` from its official release and its archive checked against the published SHA-256 checksum. Findings and raw scanner output were captured privately; only rule IDs, file paths, line numbers and commit IDs are reported. Temporary reports/snapshots are removed after scanning. No credentials were tested against providers, revoked, rotated or copied from Vercel, and no Git history was rewritten.

The final configured scan checked 2,052 files/metadata inputs and 52 commits, with zero remaining findings and no embedded remote credentials. TypeScript, all 63 tests and the production Vite build pass. An actual local development-server check confirmed generic 400/500 responses and redacted logs for malformed JSON and rejected async API handlers. The fixes and guide are saved locally on `codex/validated-config`; they have not been committed or deployed.

Pattern-based scanning cannot prove that no secret exists, especially for custom opaque values. A lack of findings also says nothing about credentials previously shared outside the scanned files/history.

## Store credentials locally

The deployed [structured logging implementation](docs/structured-logging.md) generates request IDs and uses anonymous user context because the app has no login. Incoming request/user-ID headers, cookies, browser-report fields and request `user` objects are never trusted as identity. Context omits bodies, arbitrary paths/queries, IPs and GPS. Contact/email/phone-named log detail fields are redacted; arbitrary personal text still belongs outside log metadata. Publication/deployment status remains in COMMENTS.md.

Use your password manager or your team's secret manager as the source of truth. For this app, place development values in `.env.local`, which the shared config loader reads and Git ignores. Keep the local file accessible only to your account:

```bash
cd /Users/admin/Projects/TravelTracker
umask 077
touch .env.local
chmod 600 .env.local
```

Open `.env.local` in your editor and fill these values there, using separate development keys where available:

```dotenv
LTA_ACCOUNT_KEY=""
DATA_GOV_SG_API_KEY=""
```

Never paste real values into a command, commit message, issue, chat, screenshot, README or `.env.example`. Verify the file is ignored and validate without printing values:

```bash
git check-ignore .env.local
npm run config:check
```

`LTA_ACCOUNT_KEY` enables live bus data. `DATA_GOV_SG_API_KEY` is optional; weather supports keyless access. `.env.example` contains blank credentials and public/default settings only. Ignoring a file does not encrypt it or remove an already committed copy. `.key`, `.pem`, `.p12`, `.pfx`, `.vercel/` and the local root `.npmrc` are also ignored; keep any real private keys outside the project where practical.

## Store hosted and CI credentials

- In the Vercel dashboard, select the existing **nypbus-tracker** project, then **Settings → Environment Variables**. Store `LTA_ACCOUNT_KEY` and optional `DATA_GOV_SG_API_KEY` as **Secret**, scoped to the environments that need them. Use separate production and non-production values where available. Update an existing variable rather than creating a duplicate, then redeploy so new deployments use it. Follow the current [Vercel Secret/Config documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
- In the GitHub repository, use **Settings → Secrets and variables → Actions** for `VERCEL_DEPLOY_HOOK_URL`. The monthly workflow references the secret; it must not be copied into a tracked workflow or browser configuration.
- Never prefix credentials with `VITE_`. This repo's explicit public-config allowlist is injected into the browser, and all browser values should be treated as public. The [Vite environment guide](https://vite.dev/guide/env-and-mode.html) explains the boundary. Do not log the complete config object or environment.
- Do not assume a Vercel env pull contains Production/Preview Secret values. Use development credentials locally; preserve any existing `.env.local` before using a pull command that may replace it.

## Log safely

Server code and build scripts use `security/logger.ts`. It emits one JSON record and recursively redacts configured credentials (including common encoded forms), sensitive object/header keys, bearer/basic auth text, URL credentials/query values/fragments, deploy-hook paths, GitHub token formats and private-key blocks. Binary buffers are omitted. Error objects become a small classified result: raw messages, stacks and causes are omitted. Cycles and failed serialization fail closed.

Prefer an event name and a few safe fields. Do not log entire requests, response bodies, environment/config objects or raw errors through `console`:

```ts
import { logger } from '../security/logger.ts';

logger.warn('lta.arrivals_http_error', { status: upstream.status });

try {
  // Fetch or parse provider data.
} catch (error) {
  logger.error('lta.arrivals_request_failed', { error });
  // Return a fixed, useful public error; never return error.message or error.stack.
  res.status(502).json({ error: 'Live bus data is temporarily unavailable.' });
}
```

The logger replaces configured secret values anywhere in text, but no redactor recognizes every possible unknown or transformed secret. Avoid sending sensitive input to the logger in the first place. New server credentials must be added to the configured-secret list in `security/logger.ts` and covered by tests.

The audit also removed raw provider-body logging, raw build/API exception output and NEA error-message propagation. Express 4 async API rejections now reach a final error handler that logs safely and returns generic JSON, including when development mode would otherwise expose a stack. See [OWASP's logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) for data to exclude and protection of log access/retention. Redaction changes protect new output; they do not clean existing remote logs.

The [centralized tracking follow-up](docs/error-tracking.md) adds catch-all wrappers to business API defaults, React/global error capture and safe reference-only UI. Reports preserve only fixed context/type/file labels, numeric positions and typed HTTP status. The anonymous browser collector rejects unknown fields, unapproved Origins, cookies/Authorization, forms, queries and oversized/slow bodies; browser records are explicitly untrusted. It has bounded in-memory admission/deduplication and no delivery retries. These are application safeguards, not a distributed quota or source authentication. Its exact POST path was added to the existing IP budget and published as active firewall version 6; the application collector was deployed and verified in release 5ae3003. No raw error text, GPS or search/save data is sent by this reporter.

## Repeat the scan before publishing

Activate `.venv` first so its installed Gitleaks is available. On another machine, install Gitleaks from the [official installation instructions](https://github.com/gitleaks/gitleaks#installing); it is a local security tool, not an app dependency.

```bash
source .venv/bin/activate
git fetch origin --tags
npm run secrets:scan
```

The scan uses `.gitleaks.toml`, extends Gitleaks' built-in rules, checks the project's credential-assignment names and Vercel deploy-hook URLs, and reports locations without printing matched values. Exit 0 means no configured-rule findings; exit 1 means a candidate or embedded remote credential needs review; exit 2 means the scan failed or the checkout was shallow. An invalid scan never counts as clean. Enable GitHub secret scanning/push protection where available in repository security settings ([GitHub documentation](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)).

Because ignored local credential files are included, a key you intentionally store in `.env.local` may appear as a candidate on a later scan. Its presence there alone is not a Git leak: check that the file is untracked, ignored and protected, and that the value does not appear in source, history or built assets. Never add an actual credential to the scanner's allowlist to silence it.

## If a real secret is found later

1. Revoke/rotate it at its provider first. A Git deletion or history rewrite does not invalidate a credential.
2. Replace it in the secret manager, local/hosted environments and affected CI secrets, then verify the app using the replacement. Check provider usage and affected logs.
3. Remove it from current files. Coordinate history cleanup with collaborators before a destructive rewrite or force-push; forks/cached views may need separate remediation. Follow [GitHub's sensitive-data removal instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
4. Re-run the scan. Keep reports redacted and limit access to any historical logs that might contain the value.

## Public API IP limits

See [rate limiting](docs/rate-limiting.md) for the validated Vercel WAF policy and actual rollout state. The 600 requests per 60 seconds per IP/per-region rule is live for API GET/HEAD and exactly POST /api/client-errors (active version 6), returning HTTP 429 above the shared budget. Earlier GET/HEAD enforcement/recovery was verified with an isolated native test; the POST extension has exact configuration readback and low-volume production smoke verification, without a threshold burst. Per-account limits are deferred by the user until verified login exists. No client-controlled identity, anonymous cookie, application IP log, new secret or in-memory serverless counter was added. Standalone Express is outside this platform rule; protect its gateway before public exposure.


## Dependency maintenance observed during the 28 October release

`npm audit --omit=dev` reports two transitive Express dependencies: body-parser 1.20.8 / [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) (high; fixed in 1.20.9) and qs 6.16.0 / [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) (moderate; fixed in 6.16.1). The former concerns compressed-body parsing; the latter concerns comma-format qs.stringify on attacker-influenced objects. Source inspection found no enabled body-parser middleware or first-party qs.stringify call. This narrows observed use; it does not prove all transitive paths are unreachable. No vulnerability exploitation test or dependency update was included in the structured-logging release. Track patching the lockfile and rerunning the relevant HTTP/security checks as separate maintenance.

### Advisory maintenance on 8 November 2026

After the user explicitly approved online checks and compatible fixes, the release check reproduced the two previously deferred transitive advisories above. The lockfile now resolves body-parser 1.20.9 and qs 6.16.2 within the existing Express dependency ranges. No direct dependency was added. A fresh full npm audit reports zero vulnerabilities at this check, and all 366 tests, TypeScript and HTTPS checks pass locally. GitHub's first Security checks run successfully provisioned Gitleaks, scanned files/history and passed the staged-secret regression; its advisory step exposed these two findings. The patch was published as 637cb37 and GitHub Security checks run 42437289470 passed, including secret scanning, scanner regression and the dependency audit. Vercel also passed all 366 tests/types/HTTPS and deployed that exact revision. Mutable action pins, required branch checks and deployment-check integration remain separate follow-ups.
