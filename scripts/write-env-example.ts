import { writeFile } from 'node:fs/promises';
import { envExample } from '../config/schema.ts';

await writeFile(new URL('../.env.example', import.meta.url), envExample());
console.log(JSON.stringify({ event: 'config.example_written', defaultsOnly: true, file: '.env.example' }));
