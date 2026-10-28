import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../security/logger.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tests = readdirSync(join(root, 'tests')).filter(file => file.endsWith('.test.ts')).sort().map(file => join('tests', file));
const stages = [
  { name: 'types', args: ['node_modules/typescript/bin/tsc', '--noEmit', '--noUnusedLocals'] },
  { name: 'https', args: ['--import', 'tsx', 'scripts/check-https.ts'] },
  { name: 'tests', args: ['--import', 'tsx', '--test', ...tests] },
];

for (const stage of stages) {
  const started = Date.now();
  logger.info('ci.check_started', { check: stage.name });
  // React's act() is unavailable in production mode. Only the fixture subprocess uses test mode;
  // the parent build retains Vercel's production mode, release metadata and provider credentials.
  const env = stage.name === 'tests' ? { ...process.env, NODE_ENV: 'test',
    LTA_ACCOUNT_KEY: '', DATA_GOV_SG_API_KEY: '', VERCEL_TOKEN: '', VERCEL_DEPLOY_HOOK_URL: '',
  } : process.env;
  const result = spawnSync(process.execPath, stage.args, { cwd: root, env, stdio: 'inherit', timeout: 300000 });
  const durationMs = Date.now() - started;
  if (result.error || result.signal || result.status !== 0) {
    logger.error('ci.check_failed', { check: stage.name, durationMs, exitCode: result.status,
      reason: result.error ? 'launch_or_timeout' : result.signal ? 'signal' : 'nonzero_exit' });
    process.exit(result.status && result.status > 0 ? result.status : 1);
  }
  logger.info('ci.check_passed', { check: stage.name, durationMs });
}
logger.info('ci.verification_passed', { checks: stages.length, testFiles: tests.length });
