import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from 'dotenv';
import { createConfig, createPublicConfig, ConfigError, envExample } from '../config/schema';
import { readEnvironment } from '../config/env';

test('configuration defaults preserve offline startup and existing public refresh intervals', () => {
  const config = createConfig();
  assert.equal(config.lta.accountKey, '');
  assert.equal(config.weather.apiKey, '');
  assert.equal(config.server.port, 3000);
  assert.equal(config.server.disableHmr, false);
  assert.equal(config.public.urls.apiBase, '');
  assert.equal(config.public.polling.arrivalsSeconds, 15);
  assert.equal(config.public.polling.multiStopSeconds, 30);
  assert.equal(config.public.polling.weatherSeconds, 300);
  assert.ok(Object.isFrozen(config.public.timeouts));
  assert.ok(Object.isFrozen(config.shapes.instances));
});

test('configuration parses overrides once, normalizes bases and never exposes secrets in its public projection', () => {
  const config = createConfig({
    PORT: ' 3107 ', DISABLE_HMR: 'true', VERCEL: '1',
    LTA_ACCOUNT_KEY: ' private-lta-sentinel ', DATA_GOV_SG_API_KEY: 'private-nea-sentinel',
    LTA_API_BASE_URL: 'http://127.0.0.1:3108/lta/',
    VITE_API_BASE_URL: 'https://api.example.com/backend/', VITE_ARRIVALS_REFRESH_SECONDS: '25',
    OVERPASS_URLS: 'https://example.com/first, https://example.com/second',
    VITE_SECRET: 'unknown-private-sentinel',
  });
  assert.equal(config.server.port, 3107);
  assert.equal(config.server.disableHmr, true);
  assert.equal(config.server.vercel, true);
  assert.equal(config.lta.accountKey, 'private-lta-sentinel');
  assert.equal(config.lta.baseUrl, 'http://127.0.0.1:3108/lta');
  assert.equal(config.public.urls.apiBase, 'https://api.example.com/backend');
  assert.equal(config.public.polling.arrivalsSeconds, 25);
  assert.deepEqual(config.shapes.instances, ['https://example.com/first', 'https://example.com/second']);
  const publicJson = JSON.stringify(config.public);
  assert.ok(!publicJson.includes('sentinel'));
  assert.ok(!publicJson.includes('accountKey'));
  assert.deepEqual(createPublicConfig({ LTA_ACCOUNT_KEY: 'secret' }), createConfig().public);
});

test('invalid numbers, booleans, modes, URLs and header values fail with field names and no supplied secrets', () => {
  for (const [key, value] of Object.entries({
    PORT: '3000junk', LTA_PAGE_CONCURRENCY: '99', VITE_ARRIVALS_REFRESH_SECONDS: '-1',
    NEA_KEYLESS_BUDGET: '7', DISABLE_HMR: 'yes', NODE_ENV: 'staging', HEALTH_BUS_STOP_CODE: '5532',
    LTA_API_BASE_URL: 'https://private-name:private-password@example.com',
    VITE_API_BASE_URL: 'http://untrusted.example.com', VITE_ONEMAP_BASE_URL: 'javascript:alert(1)',
    OVERPASS_URLS: 'https://example.com,,https://example.org', OVERPASS_USER_AGENT: 'private\r\nHeader: value',
  })) {
    assert.throws(() => createConfig({ [key]: value }), (error: ConfigError) => {
      assert.ok(error instanceof ConfigError);
      assert.ok(error.message.includes(key));
      assert.ok(!error.message.includes(value));
      assert.ok(!error.message.includes('private-password'));
      return true;
    }, key);
  }
  assert.throws(() => createConfig({ PORT: '1.5', DISABLE_HMR: 'maybe' }), (error: ConfigError) => error.issues.length === 2);
});

test('related retry and deadline settings cannot violate their time budgets', () => {
  assert.throws(() => createConfig({ NEA_RATE_WINDOW_MS: '20000' }), /VITE_WEATHER_RETRY_MS/);
  assert.throws(() => createConfig({ OVERPASS_REQUEST_TIMEOUT_MS: '200000' }), /OVERPASS_QUERY_TIMEOUT_SECONDS/);
  assert.throws(() => createConfig({ OVERPASS_DEADLINE_MS: '310000' }), /OVERPASS_DEADLINE_MS/);
});

test('.env.example is generated from the schema, has no placeholder key and reproduces every default', async () => {
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.equal(example, envExample());
  assert.deepEqual(createConfig(parse(example)), createConfig());
  assert.ok(example.includes('LTA_ACCOUNT_KEY=""'));
  assert.ok(example.includes('VERCEL_DEPLOY_HOOK_URL'));
});

test('environment files have deterministic precedence and shell values win without mutation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nyp-config-'));
  const shell = Object.freeze({ PORT: '4005', LTA_ACCOUNT_KEY: undefined });
  try {
    await Promise.all([
      writeFile(path.join(directory, '.env'), 'PORT=4001\nHOST=localhost\nLTA_ACCOUNT_KEY=base'),
      writeFile(path.join(directory, '.env.local'), 'PORT=4002\nLTA_ACCOUNT_KEY=local'),
      writeFile(path.join(directory, '.env.production'), 'PORT=4003\nLTA_ACCOUNT_KEY=production'),
      writeFile(path.join(directory, '.env.production.local'), 'PORT=4004\nLTA_ACCOUNT_KEY=production-local'),
    ]);
    const env = readEnvironment('production', directory, shell);
    assert.equal(env.PORT, '4005');
    assert.equal(env.HOST, 'localhost');
    assert.equal(env.LTA_ACCOUNT_KEY, 'production-local');
    assert.equal(shell.LTA_ACCOUNT_KEY, undefined);
    assert.throws(() => readEnvironment('../escape', directory, shell), /Invalid environment mode/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
