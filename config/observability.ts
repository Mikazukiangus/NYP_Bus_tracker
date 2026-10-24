import { boolean, field, integer, type Environment } from './validation.ts';

export const observabilitySchema = {
  enabled: boolean('VITE_ERROR_TRACKING_ENABLED', true, 'PUBLIC. Send privacy-filtered browser/server exception records to Vercel runtime logs. No replay, cookies or raw error messages.'),
  release: field('VITE_APP_RELEASE', 'local', 'PUBLIC. Optional Git SHA (7–40 lowercase hex). Defaults to VERCEL_GIT_COMMIT_SHA on Vercel, otherwise local.', raw => {
    if (!/^(?:[a-f0-9]{7,40}|local)$/.test(raw)) throw new Error('must be a Git SHA or local');
    return raw;
  }),
  environment: field('VITE_APP_ENVIRONMENT', 'development' as 'development' | 'preview' | 'production' | 'test', 'PUBLIC. Error-report environment; defaults to VERCEL_ENV or NODE_ENV when available.', raw => {
    if (!['development', 'preview', 'production', 'test'].includes(raw)) throw new Error('must be development, preview, production or test');
    return raw as 'development' | 'preview' | 'production' | 'test';
  }),
  timeoutMs: integer('VITE_ERROR_REPORT_TIMEOUT_MS', 2000, 250, 10000, 'PUBLIC. Error-report delivery deadline in milliseconds; best effort, single attempt.'),
};
export function errorEnvironment(env: Environment): Environment {
  return { ...env,
    VITE_APP_RELEASE: env.VITE_APP_RELEASE?.trim() || env.VERCEL_GIT_COMMIT_SHA,
    VITE_APP_ENVIRONMENT: env.VITE_APP_ENVIRONMENT?.trim() || env.VERCEL_ENV || env.NODE_ENV,
  };
}
