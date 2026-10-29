import { createApiRateLimitRule, createSensitiveEndpointRules, type FirewallStage } from '../config/firewall.ts';

// Print only; no remote writes, implicit publish, project selection or credentials.
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || !['log', 'preview', 'production'].includes(args[0]) || args.length === 2 && args[1] !== '--sensitive') {
  process.stderr.write('Usage: npm run --silent firewall:rule -- log|preview|production [--sensitive]\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(args[1] ? createSensitiveEndpointRules(args[0] as FirewallStage) : createApiRateLimitRule(args[0] as FirewallStage), null, 2)}\n`);
}
