import { test, expect, openApp, view, checkpoint } from './fixtures';
import { SAFE_ERROR_MESSAGE } from '../shared/errors/events';

test('track a bus, change direction and choose a route stop', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await expect(page.getByRole('img', { name: 'Live GPS', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /To Yio Chu Kang Int/ }).click();
  await view(page, 'stops');
  await expect(page.getByRole('heading', { name: 'Route Stops: Bus 72', exact: true })).toBeVisible();
  const stop = page.getByRole('button').filter({ hasText: '55321' }).first();
  await stop.click();
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await view(page, 'arrivals');
  const search = page.getByPlaceholder('Type a bus number');
  await search.fill('50');
  await search.press('Enter');
  await expect(page.getByText('Bus 50 Arrivals', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Live GPS', exact: true }).first()).toBeVisible();
  await search.press('Tab');
  await checkpoint(page, testInfo, 'arrivals');
});

test('save a bus, restore it after reload, open it and remove it', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await page.getByTitle('Remove from saved buses', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Saved buses (0)', exact: true })).toBeVisible();
  await page.getByTitle('Save this bus at this stop', { exact: true }).first().click();
  await page.reload();
  await page.getByRole('button', { name: 'Saved buses (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved buses (1)', exact: true })).toBeVisible();
  await checkpoint(page, testInfo, 'saved-buses');
  await page.getByTitle('Open Tracker', { exact: true }).click();
  await expect(page.getByText('Bus 72 Arrivals', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved buses (1)', exact: true }).click();
  // The modal is rendered after the underlying tracker, which has the same action title.
  await page.getByTitle('Remove from saved buses', { exact: true }).last().click();
  await expect(page.getByText('No saved buses yet', { exact: true })).toBeVisible();
});

test('choose a location and keep the saved location on reload', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Search for a location' }).fill('54351');
  await dialog.getByRole('option').filter({ hasText: '54351' }).first().click();
  await expect(dialog).toBeHidden();
  const location = page.getByRole('button', { name: /^Your location:/ }).first();
  const savedName = await location.getAttribute('aria-label');
  await expect(location).not.toHaveAttribute('aria-label', /Nanyang Polytechnic/);
  await page.reload();
  await expect(location).toHaveAttribute('aria-label', savedName!);
  await checkpoint(page, testInfo, 'saved-location');
});

test('replace the saved location with a fresh GPS fix', async ({ page, context, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await context.setGeolocation({ latitude: 1.3504, longitude: 103.8487, accuracy: 20 });
  await context.grantPermissions(['geolocation']);
  await page.getByRole('button', { name: 'Use my current GPS position', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Your location:/ }).first()).toHaveAttribute('aria-label', 'Your location: Your location. Change location');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bustrackersg_location_v1')!).location.source)).toBe('gps');
  await checkpoint(page, testInfo, 'gps-location');
});

test('plan a journey and use the actual Leaflet map', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await page.getByRole('combobox', { name: 'Where to?', exact: true }).fill('53009');
  await page.getByRole('option').filter({ hasText: '53009' }).first().click();
  await expect(page.getByRole('region', { name: 'Bus trips to Bishan Int', exact: true })).toBeVisible();
  await expect(page.getByText('Selected', { exact: true })).toBeVisible();
  await view(page, 'map');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.journey-destination-marker')).toHaveCount(1);
  await page.locator('.journey-board-marker').first().click();
  await expect(page.locator('.leaflet-popup-content')).toContainText('Board Bus');
  await page.locator('.leaflet-popup-close-button').click();
  await page.locator('.leaflet-control-zoom-in').click();
  await checkpoint(page, testInfo, 'journey-map');
  await view(page, 'arrivals');
  await expect(page.getByText('Bus 50 Arrivals', { exact: true })).toBeVisible();
  await view(page, 'map');
  await expect(page.locator('.leaflet-container')).toHaveCount(1);
  await expect(page.locator('.journey-destination-marker')).toHaveCount(1);
});

test('keep stale weather visible on failure and recover on refresh', async ({ page, scenario }, testInfo) => {
  scenario.allowReports = true;
  await openApp(page);
  await view(page, 'weather');
  await expect(page.getByRole('heading', { name: 'Weather & Air Quality', exact: true })).toBeVisible();
  await expect(page.getByText('30°C', { exact: true })).toBeVisible();
  scenario.weather = 'unavailable';
  await page.getByRole('button', { name: 'Refresh weather', exact: true }).click();
  await expect(page.getByText(/Refresh failed. Showing earlier readings/)).toBeVisible();
  await checkpoint(page, testInfo, 'weather-stale');
  scenario.weather = 'available';
  await page.getByRole('button', { name: 'Refresh weather', exact: true }).click();
  await expect(page.getByText(/Refresh failed. Showing earlier readings/)).toBeHidden();
  await expect(page.getByText('30°C', { exact: true })).toBeVisible();
});

for (const mode of ['simulated', 'malformed'] as const) {
  test(`reject ${mode} arrival data instead of displaying live ETAs`, async ({ page, scenario }, testInfo) => {
    scenario.arrivals = mode;
    await openApp(page);
    await expect(page.getByRole('img', { name: 'Live GPS', exact: true })).toHaveCount(0);
    await expect(page.getByText('Sample times: the live feed is down', { exact: true })).toBeVisible();
    await checkpoint(page, testInfo, `${mode}-arrivals`);
  });
}

test('report an exception safely and dismiss the recovery notice', async ({ page, scenario }, testInfo) => {
  scenario.allowReports = true;
  // Only this error-report scenario needs a stable UUID for the notice's natural text width.
  await page.addInitScript(() => { crypto.randomUUID = () => '00000000-0000-4000-8000-000000000001'; });
  await openApp(page);
  await page.evaluate(() => { void Promise.reject(new TypeError('E2E_PRIVATE_DETAIL@example.test')); });
  const notice = page.getByRole('alert').filter({ hasText: SAFE_ERROR_MESSAGE });
  await expect(notice).toBeVisible();
  await expect.poll(() => scenario.reports.length).toBe(1);
  expect(scenario.reports[0].context.operation).toBe('browser.unhandled');
  expect(JSON.stringify(scenario.reports)).not.toContain('E2E_PRIVATE_DETAIL');
  await expect(page.locator('body')).not.toContainText('E2E_PRIVATE_DETAIL');
  await checkpoint(page, testInfo, 'safe-error');
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(notice).toBeHidden();
  await view(page, 'stops');
  await expect(page.getByRole('heading', { name: 'Route Stops: Bus 72', exact: true })).toBeVisible();
});
