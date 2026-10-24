import { createApiRateLimitRule, type FirewallStage } from '../config/firewall.ts';

// Print only; no remote writes, implicit publish, project selection or credentials.
const args = process.argv.slice(2);
if (args.length !== 1 || !['log', 'preview', 'production'].includes(args[0])) {
  process.stderr.write('Usage: npm run --silent firewall:rule -- log|preview|production\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(createApiRateLimitRule(args[0] as FirewallStage), null, 2)}\n`);
}
