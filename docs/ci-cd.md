# CI/CD on Vercel

The existing GitHub integration for `Mikazukiangus/NYP_Bus_tracker` deploys to the `nypbus-tracker` project in `carbon-bc04`. Production is `https://nypbus-tracker.vercel.app/`, using Node 24 and the `main` branch. The pipeline runs entirely in Vercel's build environment; it needs no new GitHub deployment job, token or paid integration.

Every normal Git-triggered build now follows this sequence:

1. `npm ci` installs the locked dependencies, including development tools needed by the checks.
2. `npm run build` starts with `npm run verify`.
3. Verification runs TypeScript with unused-local checks, the HTTPS literal scan and every root `tests/*.test.ts`, including the dedicated integration tests. Any nonzero exit, failed launch, termination or five-minute stage timeout stops the command.
4. Only after all checks pass does the existing LTA route-data generator run, followed by Vite's production build and Vercel's function packaging.
5. A successful production build is assigned to the live domain automatically. A failed check or build does not replace the live deployment.

`vercel.json` explicitly uses `npm ci`, `npm run build` and the `dist` output directory. The gate is in the shared package build command, so the usual Git builds, redeploys and existing monthly data-refresh deploy hook take the same path. Other branches retain the existing Vercel preview behavior; this does not change Git integration settings or branch protection. GitHub Actions status checks are not an additional prerequisite: the quality checks run inside Vercel's own required build.

The test subprocess receives `NODE_ENV=test` so React's `act()` works even when the parent build is in production mode. It also receives empty provider/deploy credential variables; controlled unit/integration fixtures do not need those credentials. The later build retains the parent's production mode, release metadata and configured provider keys. No production credentials are exported to a new CI service. Existing environment values are validated by the shared configuration as before.

The existing LTA generator deliberately supports API fallback when its provider is unavailable. That remains an accepted degraded build, rather than a failed quality gate. This pipeline does not silently change the data-availability policy. Browser/device tests, an audit-free dependency graph and full-runtime coverage are not claimed by a green gate; see [testing limitations](testing.md) and [security maintenance](../SECURITY.md).

## Run and diagnose checks

```sh
source .venv/bin/activate
npm ci
npm run verify
```

Run `npx vite build` to check client compilation locally while preserving generated route files. Run `npm run build` when you intend to regenerate those files; the existing downloader clears `public/bus-routes/` once verification has passed. Without a provider key it uses the existing API fallback. A failed verification stops before that deletion and before compiling new assets.

In Vercel's deployment build logs, look for JSON events `ci.check_started`, `ci.check_passed`, `ci.check_failed` and `ci.verification_passed`. A failure names the stage; preceding compiler, scanner or test output explains the failing check. Fix the cause and push another commit. Do not bypass the shared command with a custom build override or prebuilt upload and describe that as a verified release.

The current pipeline is build-gated CI/CD, not a GitHub required-status rule or a post-build browser promotion check. Adding those later requires a separate reviewed setup. No new GitHub workflow or deployment credential was introduced; the existing monthly shape-refresh workflow remains in place.

Platform references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [GitHub integration](https://vercel.com/docs/git/vercel-for-github), [production deployment behavior](https://vercel.com/docs/deployment-checks).
