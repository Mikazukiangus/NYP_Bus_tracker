// Server/build entry only. Never import this module from src/; vite.config.ts sends only config.public.
import { readEnvironment } from './env.ts';
import { createConfig } from './schema.ts';

export const config = createConfig(readEnvironment());
