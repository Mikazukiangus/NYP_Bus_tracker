import { writeFile } from 'node:fs/promises';
import { envExample } from '../config/schema.ts';

await writeFile(new URL('../.env.example', import.meta.url), envExample());
console.log('Updated .env.example from config/schema.ts (defaults only; no local secrets read).');
