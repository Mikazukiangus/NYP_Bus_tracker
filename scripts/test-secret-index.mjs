import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const fixture = mkdtempSync(path.join(tmpdir(), 'nyp-secret-index-'));
const git = (...args) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
try {
  mkdirSync(path.join(fixture, 'scripts'));
  mkdirSync(path.join(fixture, '.venv/bin'), { recursive: true });
  const scanner = process.env.GITLEAKS_BINARY || path.join(root, '.venv/bin/gitleaks');
  symlinkSync(scanner, path.join(fixture, '.venv/bin/gitleaks'));
  copyFileSync(path.join(root, 'scripts/scan-secrets.ts'), path.join(fixture, 'scripts/scan-secrets.ts'));
  copyFileSync(path.join(root, '.gitleaks.toml'), path.join(fixture, '.gitleaks.toml'));
  writeFileSync(path.join(fixture, '.gitignore'), '.venv/\n');
  writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(fixture, 'example.txt'), 'clean\n');
  git('init', '--quiet');
  git('config', 'user.name', 'Security fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', 'https://example.invalid/offline-fixture');
  git('add', '.'); git('commit', '--quiet', '-m', 'clean fixture');
  const run = () => spawnSync(process.execPath, ['--import', path.join(root, 'node_modules/tsx/dist/loader.mjs'), path.join(fixture, 'scripts/scan-secrets.ts')], { cwd: fixture, encoding: 'utf8' });
  assert.equal(run().status, 0, 'Clean fixture must pass');
  const synthetic = Array.from({ length: 32 }, (_, i) => ((i * 7) % 36).toString(36)).join('');
  writeFileSync(path.join(fixture, 'example.txt'), `LTA_ACCOUNT_KEY="${synthetic}"\n`);
  git('add', 'example.txt');
  writeFileSync(path.join(fixture, 'example.txt'), 'clean\n');
  const rejected = run();
  assert.equal(rejected.status, 1, 'Staged-only synthetic secret must fail');
  assert.match(rejected.stdout, /staged-index\/example.txt/);
  assert.ok(!(rejected.stdout + rejected.stderr).includes(synthetic), 'Scanner output must redact values');
  console.log(JSON.stringify({ event: 'security.index_regression_passed', cleanAccepted: true, stagedSecretRejected: true, valueRedacted: true }));
} finally { rmSync(fixture, { recursive: true, force: true }); }
