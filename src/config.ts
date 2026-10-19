import { createPublicConfig, type PublicConfig } from '../config/public';
import { deepFreeze } from '../config/validation';

declare const __PUBLIC_CONFIG__: PublicConfig;

// Vite injects an explicit allowlist, never process.env. Node-based unit tests use the same public defaults.
export const config: PublicConfig = deepFreeze(
  typeof __PUBLIC_CONFIG__ === 'undefined' ? createPublicConfig() : __PUBLIC_CONFIG__
);
export const apiUrl = (path: string): string => `${config.urls.apiBase}${path}`;
export const dataUrl = (path: string): string => `${config.urls.dataBase}${path}`;
