import { readFileSync } from 'node:fs';
// Do not print registry messages, URLs, config or raw failure output.
try {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const counts = report.metadata?.vulnerabilities;
  if (report.error || !counts || !['info', 'low', 'moderate', 'high', 'critical'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) throw new Error();
  const { info, low, moderate, high, critical } = counts;
  console.log(JSON.stringify({ event: 'security.dependency_audit', counts: { info, low, moderate, high, critical } }));
  process.exitCode = moderate + high + critical > 0 || !['0', '1'].includes(process.argv[3]) ? 1 : 0;
} catch {
  console.error(JSON.stringify({ event: 'security.dependency_audit_failed', message: 'Audit unavailable or malformed; check did not pass.' }));
  process.exitCode = 1;
}
