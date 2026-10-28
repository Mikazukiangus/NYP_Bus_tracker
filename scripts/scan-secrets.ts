// Reports only finding locations/rule IDs. Scanner output, matches and secret values are never printed.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });

async function main() {
  const localScanner = path.join(root, '.venv/bin/gitleaks');
  const scanner = await lstat(localScanner).then(() => localScanner, () => 'gitleaks');
  const version = spawnSync(scanner, ['version'], { encoding: 'utf8' });
  if (version.status !== 0) throw new Error('scanner_unavailable');
  const directory = await mkdtemp(path.join(tmpdir(), 'bustrackersg-secrets-'));
  await chmod(directory, 0o700);
  try {
    // Ensure our custom rule catches a synthetic high-entropy value, but never consumes the next line
    // after a blank example assignment. No real credential is used or displayed by this check.
    const synthetic = Array.from({ length: 32 }, (_, i) => ((i * 7) % 36).toString(36)).join('');
    for (const [input, expected] of [
      [`LTA_ACCOUNT_KEY="${synthetic}"`, 1],
      ['LTA_ACCOUNT_KEY=""\nDATA_GOV_SG_API_KEY=""', 0],
    ] as const) {
      const check = spawnSync(scanner, ['stdin', '--config', path.join(root, '.gitleaks.toml'),
        '--enable-rule=bustrackersg-secret-assignment', '--redact=100', '--no-banner', '--no-color',
        '--report-format=json', '--report-path', path.join(directory, 'rule-check.json')], { input, encoding: 'utf8' });
      if (check.status !== expected) throw new Error('scanner_rule_check_failed');
    }
    const snapshot = path.join(directory, 'snapshot');
    await mkdir(snapshot);
    const names = new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean));
    const local = await readdir(root);
    for (const name of local) if (name.startsWith('.env') || name === '.npmrc') names.add(name);
    const addDirectory = async (relative: string) => {
      for (const entry of await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])) {
        const name = path.join(relative, entry.name);
        if (entry.isDirectory()) await addDirectory(name);
        else if (entry.isFile()) names.add(name);
      }
    };
    await addDirectory('dist');
    for (const name of await readdir(path.join(root, '.vercel')).catch(() => [])) {
      if (name.startsWith('.env') || name === 'project.json') names.add(`.vercel/${name}`);
    }
    names.add('.git/config');
    let files = 0;
    for (const name of names) {
      const source = path.join(root, name);
      if (!await lstat(source).then((s) => s.isFile(), () => false)) continue;
      const target = path.join(snapshot, name.replace(/^\.git\//, 'git-metadata/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(source), { mode: 0o600 });
      files++;
    }
    await mkdir(path.join(snapshot, 'git-metadata'), { recursive: true });
    await writeFile(path.join(snapshot, 'git-metadata/commits.txt'), git('log', '--all', '--reflog', '--format=fuller'), { mode: 0o600 });
    const ignore = path.join(directory, 'no-ignores');
    await writeFile(ignore, '', { mode: 0o600 });
    let findings = 0;
    let failed = false;
    const scans = [
      ['working-tree', ['dir', snapshot]],
      ['history', ['git', '--log-opts=--all --reflog --full-history', root]],
    ] as const;
    for (const [label, args] of scans) {
      const report = path.join(directory, `${label}.json`);
      const result = spawnSync(scanner, [...args, '--config', path.join(root, '.gitleaks.toml'),
        '--redact=100', '--no-banner', '--no-color', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', ignore,
        '--report-format=json', '--report-path', report], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (result.status !== 0 && result.status !== 1) {
        console.error(JSON.stringify({ scan: label, error: 'Scanner failed; raw output omitted to protect credentials.' }));
        failed = true;
        continue;
      }
      const hits: { RuleID: string; File: string; StartLine: number; Commit?: string }[] = JSON.parse(await readFile(report, 'utf8'));
      findings += hits.length;
      console.log(JSON.stringify({ scan: label, findings: hits.length, locations: hits.map((hit) => ({
        rule: hit.RuleID, file: hit.File.replace(`${snapshot}/`, ''), line: hit.StartLine, commit: hit.Commit || undefined,
      })) }));
    }
    const shallow = git('rev-parse', '--is-shallow-repository').trim() === 'true';
    let credentialRemote = false;
    for (const line of git('config', '--get-regexp', '^remote\\..*\\.url$').trim().split('\n')) {
      const raw = line.slice(line.indexOf(' ') + 1);
      if (/^https?:\/\//.test(raw)) {
        const url = new URL(raw);
        if (url.username || url.password) credentialRemote = true;
      }
    }
    console.log(JSON.stringify({ files: files + 1, commits: Number(git('rev-list', '--all', '--reflog', '--count')),
      shallow, embeddedRemoteCredentials: credentialRemote, scanner: version.stdout.trim(),
      coverage: 'First-party tracked/untracked files, local env/npm files if present, built assets, git config/commit metadata and local refs/tags/reflogs. Vendor dependencies and virtualenv excluded. Fetch remote refs first.' }));
    process.exitCode = failed || shallow ? 2 : findings || credentialRemote ? 1 : 0;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(() => {
  console.error(JSON.stringify({ scan: 'failed', error: 'Install Gitleaks and use a complete Git checkout. Raw errors omitted.' }));
  process.exitCode = 2;
});
