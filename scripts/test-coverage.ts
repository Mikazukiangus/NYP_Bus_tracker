import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node's built-in coverage needs no service, credential or extra dependency.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scopes = ['api', 'server', 'shared', 'security', 'src'];
const output = join(root, 'coverage');
mkdirSync(output, { recursive: true });
for (const file of ['lcov.info', 'test-output.txt', 'summary.json']) rmSync(join(output, file), { force: true });
const tests = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.ts')).sort().map(name => join('tests', name));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--experimental-test-coverage',
  ...scopes.map(scope => `--test-coverage-include=${scope}/**`),
  '--test-reporter=spec', `--test-reporter-destination=${join(output, 'test-output.txt')}`,
  '--test-reporter=lcov', `--test-reporter-destination=${join(output, 'lcov.info')}`, ...tests,
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) throw new Error(`Test runner terminated: ${result.signal}`);
process.exitCode = result.status ?? 1;

type Counts = { lines: number; linesHit: number; branches: number; branchesHit: number; functions: number; functionsHit: number };
const zero = (): Counts => ({ lines: 0, linesHit: 0, branches: 0, branchesHit: 0, functions: 0, functionsHit: 0 });
const percent = (hit: number, total: number) => total ? Number((100 * hit / total).toFixed(2)) : 100;
const percentages = (counts: Counts) => ({ lines: percent(counts.linesHit, counts.lines), branches: percent(counts.branchesHit, counts.branches), functions: percent(counts.functionsHit, counts.functions) });
const keys = { LF: 'lines', LH: 'linesHit', BRF: 'branches', BRH: 'branchesHit', FNF: 'functions', FNH: 'functionsHit' } as const;
const files = readFileSync(join(output, 'lcov.info'), 'utf8').split('end_of_record').filter(record => /^SF:/m.test(record)).map(record => {
  let file = ''; const counts = zero();
  for (const line of record.split('\n')) {
    if (line.startsWith('SF:')) file = line.slice(3);
    const [key, value] = line.split(':');
    if (Object.hasOwn(keys, key)) counts[keys[key as keyof typeof keys]] = Number(value);
  }
  return { file: (isAbsolute(file) ? relative(root, file) : file).split(sep).join('/'), counts, percentages: percentages(counts) };
}).sort((a, b) => a.file.localeCompare(b.file));
if (!files.length) throw new Error('No source coverage collected; inspect coverage/test-output.txt.');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') ? [file.split(sep).join('/')] : [];
  });
}
const totals = files.reduce((sum, file) => {
  for (const key of Object.keys(sum) as (keyof Counts)[]) sum[key] += file.counts[key];
  return sum;
}, zero());
const loaded = new Set(files.map(file => file.file));
const inventory = scopes.flatMap(sourceFiles).sort();
const unmeasured = inventory.filter(file => !loaded.has(file));
const summary = {
  generatedAt: new Date().toISOString(), scopes, measuredFiles: files.length, sourceFiles: inventory.length,
  caveats: [
    'Percentages describe loaded files only. Unmeasured files are listed separately and include type-only modules; declarations are excluded from the inventory.',
    'V8 coverage under tsx includes generated helpers; treat line/function positions as diagnostic, not exact TypeScript statement coverage.',
    'Config, scripts, server.ts, browser behavior and actual external providers are outside this coverage denominator.',
  ],
  totals: { counts: totals, percentages: percentages(totals) }, files, unmeasured,
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const testOutput = readFileSync(join(output, 'test-output.txt'), 'utf8');
console.log(testOutput.split('\n').filter(line => /ℹ (tests|pass|fail|cancelled|skipped|duration_ms)\b/.test(line)).join('\n'));
if (process.exitCode) console.error('Tests failed. Read coverage/test-output.txt for assertion details.');
console.log(`Loaded-file coverage: ${summary.totals.percentages.lines}% lines, ${summary.totals.percentages.branches}% branches, ${summary.totals.percentages.functions}% functions.`);
console.log(`Measured ${files.length}/${inventory.length} source files; ${unmeasured.length} unmeasured (includes type-only modules).`);
console.log('Lowest measured branch coverage:');
for (const file of [...files].sort((a, b) => a.percentages.branches - b.percentages.branches).slice(0, 10)) console.log(`  ${file.percentages.branches.toFixed(2)}%  ${file.file}`);
console.log('Reports: coverage/lcov.info, coverage/summary.json, coverage/test-output.txt');
