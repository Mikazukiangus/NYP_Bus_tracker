import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Flags literal browser resource URLs, including loopback and insecure WebSockets.
// XML namespace identifiers are not network requests. Dynamic URLs are also covered
// by production config validation and the browser's transport CSP.
export function insecureResourceLiterals(source: string) {
  return [...source.matchAll(/\b(?:http|ws):\/\/[^\s"'<>`)]*/g)].flatMap(match => {
    const before = source.slice(Math.max(0, match.index - 20), match.index);
    if (match[0] === 'http://www.w3.org/2000/svg' && /xmlns\s*=\s*["']$/.test(before)) return [];
    return [{ line: source.slice(0, match.index).split('\n').length, scheme: match[0].startsWith('ws:') ? 'ws' : 'http' }];
  });
}

export async function checkBrowserSources(root: string) {
  async function files(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const groups = await Promise.all(entries.map(entry => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? files(file) : Promise.resolve(/\.(?:[cm]?[jt]sx?|css|html|svg)$/.test(entry.name) ? [file] : []);
    }));
    return groups.flat();
  }
  const paths = [path.join(root, 'index.html'), ...(await Promise.all(['src', 'shared', 'public'].map(dir => files(path.join(root, dir))))).flat()];
  const findings = (await Promise.all(paths.map(async file => insecureResourceLiterals(await readFile(file, 'utf8'))
    .map(issue => ({ file: path.relative(root, file), ...issue }))))).flat();
  return { files: paths.length, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkBrowserSources(path.resolve(import.meta.dirname, '..'));
  // Locations/schemes only; never echo a URL that might contain credentials or queries.
  console.log(JSON.stringify({ check: 'browser-https-literals', ...result }));
  if (result.findings.length) process.exitCode = 1;
}
