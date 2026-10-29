import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = path.resolve(import.meta.dirname, '..');
test('secret prevention covers the index, pre-commit and pull-request CI', () => {
  assert.ok(existsSync(path.join(root, '.githooks/pre-commit')));
  const hook = readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8');
  assert.match(hook, /npm run secrets:scan/);
  assert.match(readFileSync(path.join(root, 'scripts/scan-secrets.ts'), 'utf8'), /git\('show', `:\.\/\$\{name\}`\)/);
  const workflow = readFileSync(path.join(root, '.github/workflows/security.yml'), 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /npm run secrets:scan/);
  assert.match(workflow, /npm audit --json/);
  assert.ok(existsSync(path.join(root, '.github/dependabot.yml')));
});

test('dependency audit fails closed for advisories and unavailable or malformed reports', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nyp-audit-'));
  try {
    const file = path.join(directory, 'audit.json');
    const run = (report: unknown, status = '0') => {
      writeFileSync(file, JSON.stringify(report));
      return spawnSync(process.execPath, [path.join(root, 'scripts/check-audit-report.mjs'), file, status], { encoding: 'utf8' });
    };
    const counts = { info: 0, low: 1, moderate: 0, high: 0, critical: 0 };
    assert.equal(run({ metadata: { vulnerabilities: counts } }).status, 0);
    assert.equal(run({ metadata: { vulnerabilities: { ...counts, high: 1 } } }, '1').status, 1);
    assert.equal(run({ metadata: { vulnerabilities: counts } }, '2').status, 1);
    const bad = run({ error: { message: 'private-marker-do-not-echo' } }, '1');
    assert.equal(bad.status, 1);
    assert.doesNotMatch(bad.stdout + bad.stderr, /private-marker/);
    assert.equal(run({}).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
