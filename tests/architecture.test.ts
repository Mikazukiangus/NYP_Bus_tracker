import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

// Covers this repo's literal import/export and lazy import syntax. Type-only edges remain
// visible for architectural checks, but do not count toward the initial runtime bundle.
function imports(file: string) {
  const text = readFileSync(file, 'utf8');
  const statements = [...text.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/gm)]
    .map((m) => {
      const named = m[2].trim();
      const onlyInlineTypes = named.startsWith('{') && named.endsWith('}') &&
        named.slice(1, -1).split(',').filter((name) => name.trim()).every((name) => name.trim().startsWith('type '));
      return { specifier: m[3], eager: !m[1] && !onlyInlineTypes };
    });
  const dynamic = [...text.matchAll(/\bimport\(['"]([^'"]+)['"]\)/g)].map((m) => ({ specifier: m[1], eager: false }));
  const sideEffects = [...text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)]
    .map((m) => ({ specifier: m[1], eager: true }));
  return [...statements, ...dynamic, ...sideEffects];
}
function resolve(file: string, specifier: string) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined;
  const base = specifier.startsWith('@/') ? path.resolve(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
  return [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate));
}

test('browser/shared modules cannot import server entry points, secret config or logging', () => {
  for (const file of [...files(path.join(root, 'src')), ...files(path.join(root, 'shared'))]) {
    for (const { specifier } of imports(file)) {
      const target = resolve(file, specifier);
      if (!target) continue;
      const relative = path.relative(root, target);
      assert.ok(!/^(?:api\/|server\/|config\/(?:server|env|schema)\.|security\/)/.test(relative), `${path.relative(root, file)} imports ${relative}`);
      if (file.startsWith(path.join(root, 'shared') + path.sep)) {
        assert.ok(relative.startsWith('shared/'), `shared module imports ${relative}`);
      }
    }
    if (file.startsWith(path.join(root, 'shared') + path.sep)) {
      for (const { specifier } of imports(file)) assert.ok(specifier.startsWith('.') || specifier.startsWith('@/shared/'), `shared module imports ${specifier}`);
    }
  }
});

test('build scripts and backend services do not depend on API entry points', () => {
  for (const file of [...files(path.join(root, 'scripts')), ...files(path.join(root, 'server'))]) {
    for (const { specifier } of imports(file)) {
      const target = resolve(file, specifier);
      assert.ok(!target?.startsWith(path.join(root, 'api') + path.sep), `${path.relative(root, file)} imports an API entry point`);
    }
  }
});

test('Leaflet stays outside the eagerly imported application graph', () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const { specifier, eager } of imports(file)) {
      if (!eager) continue;
      assert.notEqual(specifier, 'leaflet', `${path.relative(root, file)} eagerly imports Leaflet`);
      const target = resolve(file, specifier);
      if (target) visit(target);
    }
  }
  visit(path.join(root, 'src/main.tsx'));
  assert.ok(visited.has(path.join(root, 'src/App.tsx')));
});

test('domain rules and plain feature models stay independent of React, adapters and browser state', () => {
  const pureServices = new Set(['tripPlanner.ts', 'leaveWithin.ts', 'routeShape.ts', 'rainAdvice.ts', 'rainNowcast.ts', 'getOffAlarm.ts']);
  const roots = files(path.join(root, 'src')).filter(file => {
    const relative = path.relative(root, file);
    // Map's model describes React/Leaflet renderer refs, rather than plain domain values.
    return /^src\/features\/.*\/domain\//.test(relative) ||
      (/^src\/features\/.*\/model\.ts$/.test(relative) && relative !== 'src/features/map/model.ts') ||
      (path.dirname(relative) === 'src/services' && pureServices.has(path.basename(file)));
  });
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(root, file);
    assert.ok(!/^(?:api\/|server\/|config\/|security\/|src\/(?:components\/|config\.|data\/))/.test(relative) &&
      !/^src\/features\/.*\/(?:data|application)\//.test(relative), `domain reaches ${relative}`);
    const source = readFileSync(file, 'utf8');
    assert.ok(!/\b(?:fetch\s*\(|localStorage\b|sessionStorage\b|navigator\s*\.|Date\.now\s*\()/.test(source), `domain reads external state in ${relative}`);
    for (const { specifier } of imports(file)) {
      const target = resolve(file, specifier);
      assert.ok(target, `domain reaches external or unresolved module ${specifier} from ${relative}`);
      visit(target!);
    }
  }
  roots.forEach(visit);
  assert.ok(visited.has(path.join(root, 'src/features/network/domain/queries.ts')));
});

test('UI components use application hooks rather than data adapters or raw storage/network calls', () => {
  for (const file of files(path.join(root, 'src/components'))) {
    assert.ok(!/\b(?:fetch\s*\(|localStorage\b|sessionStorage\b)/.test(readFileSync(file, 'utf8')), `${path.relative(root, file)} owns data access`);
    for (const { specifier } of imports(file)) {
      const target = resolve(file, specifier);
      assert.ok(!target || !/^src\/features\/.*\/data\//.test(path.relative(root, target)), `${path.relative(root, file)} imports a data adapter`);
    }
  }
});

test('transit and weather HTTP adapters delegate provider requests to server services', () => {
  for (const name of ['bus-arrival', 'bus-route', 'traffic-incidents', 'weather']) {
    const file = path.join(root, `api/${name}.ts`);
    assert.ok(!/\bfetch\s*\(/.test(readFileSync(file, 'utf8')), `${name} owns provider transport`);
    assert.ok(imports(file).some(({ specifier }) => resolve(file, specifier)?.startsWith(path.join(root, 'server') + path.sep)));
  }
});

test('all arrival polling owners use the shared repository rather than uncached transport', () => {
  for (const name of ['useStopArrivals', 'useStopsArrivals', 'favoriteArrivals']) {
    const file = path.join(root, `src/services/${name}.ts`);
    const targets = imports(file).map(({ specifier }) => resolve(file, specifier));
    assert.ok(targets.some(target => target?.endsWith('/features/arrivals/data/arrivalRepository.ts')));
    assert.ok(!targets.some(target => target?.endsWith('/features/arrivals/client.ts')));
  }
});
