import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 45000,
  expect: { timeout: 10000, toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{platform}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build:e2e && npm run serve:e2e',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test', VERCEL: '0', VERCEL_ENV: 'development',
      VITE_APP_ENVIRONMENT: 'test', VITE_APP_RELEASE: 'local',
      VITE_API_BASE_URL: '', VITE_DATA_BASE_URL: '',
      LTA_ACCOUNT_KEY: '', DATA_GOV_SG_API_KEY: '', VERCEL_TOKEN: '', VERCEL_DEPLOY_HOOK_URL: '',
    },
  },
});
