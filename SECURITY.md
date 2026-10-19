# Secrets, logs and repository scan

## Scan result — 19 October 2026

No confirmed credentials were found in the scanned current code or the 52 commits reachable from the fetched local branches, remote-tracking refs, tags and reflogs. This was a full checkout, not a shallow clone. Commit metadata, `.git/config`, uncommitted/untracked first-party files, generated browser files and any local `.env`/npm files present were included. Dependencies and `.venv` were excluded. GitHub-hosted caches, forks, pull-request refs not fetched locally, remote logs and unrelated account credential stores were outside this scan.

The initial Gitleaks 8.30.1 scan identified three candidates: the public `sbs_transit_favorites_v1` browser-storage identifier in current/historical `src/App.tsx`, and prose in `COMMENTS.md`. Each was checked and was not a credential. The storage identifier has an exact-value, generic-rule allowlist in `.gitleaks.toml`; the prose was reworded. No test directory, commit or secret type is broadly ignored. The Git remote has no embedded username/password. No local credential `.env` files were present at audit time.

Gitleaks was installed inside the ignored `.venv/bin` from its official release and its archive checked against the published SHA-256 checksum. Findings and raw scanner output were captured privately; only rule IDs, file paths, line numbers and commit IDs are reported. Temporary reports/snapshots are removed after scanning. No credentials were tested against providers, revoked, rotated or copied from Vercel, and no Git history was rewritten.

The final configured scan checked 2,052 files/metadata inputs and 52 commits, with zero remaining findings and no embedded remote credentials. TypeScript, all 63 tests and the production Vite build pass. An actual local development-server check confirmed generic 400/500 responses and redacted logs for malformed JSON and rejected async API handlers. The fixes and guide are saved locally on `codex/validated-config`; they have not been committed or deployed.

Pattern-based scanning cannot prove that no secret exists, especially for custom opaque values. A lack of findings also says nothing about credentials previously shared outside the scanned files/history.

## Store credentials locally

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
