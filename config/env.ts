import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import type { Environment } from './schema.ts';

// Match Vite's file priority without copying file credentials into process.env. Shell/platform variables win.
// Resolve from the repository, not the current working directory (also works in Vercel function bundles).
export function readEnvironment(
  mode = process.env.NODE_ENV || (process.env.npm_lifecycle_event === 'build' ? 'production' : 'development'),
  directory = path.resolve(import.meta.dirname, '..'),
  shell: Environment = process.env,
): Environment {
  if (!/^[a-zA-Z0-9_-]+$/.test(mode)) throw new Error('Invalid environment mode');
  const merged: Record<string, string | undefined> = {};
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    try { Object.assign(merged, parse(readFileSync(path.join(directory, name)))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return { ...merged, ...Object.fromEntries(Object.entries(shell).filter(([, value]) => value !== undefined)) };
}
