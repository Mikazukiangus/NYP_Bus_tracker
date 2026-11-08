import { test, expect, openApp, view, checkpoint } from './fixtures';
import { SAFE_ERROR_MESSAGE } from '../shared/errors/events';
import { readFile } from 'node:fs/promises';

test('download remembered locations and clear them without losing saved buses', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Search for a location' }).fill('54351');
  await dialog.getByRole('option').filter({ hasText: '54351' }).first().click();
  await page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByText('Your saved location data', { exact: true }).click();
  await expect(dialog.getByText(/until you clear them/)).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download location data', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('bustrackersg-locations.json');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.location.name).toBeTruthy();
  expect(exported.recentPlaces.length).toBeGreaterThan(0);
  expect(Object.keys(exported).sort()).toEqual(['exportedAt', 'location', 'recentPlaces', 'schemaVersion']);
  await dialog.getByRole('button', { name: 'Clear location and recent places', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm clear', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /Saved location|Browser storage/ })).toContainText('Saved location and recent places cleared.');
  await dialog.getByRole('status').filter({ hasText: /Saved location|Browser storage/ }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('status').filter({ hasText: /Saved location|Browser storage/ })).toBeVisible();
  const stored = await page.evaluate(() => ({ location: localStorage.getItem('bustrackersg_location_v1'), recent: JSON.parse(localStorage.getItem('bustrackersg_recent_places_v1')!).places }));
  expect(stored).toEqual({ location: null, recent: [] });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const image = testInfo.outputPath('location-privacy.png');
  await page.screenshot({ path: image });
  await testInfo.attach('location-privacy', { path: image, contentType: 'image/png' });
  await page.reload();
  await expect(page.getByRole('button', { name: /^Your location:/ }).first()).toHaveAttribute('aria-label', /Nanyang Polytechnic/);
  await expect(page.getByRole('button', { name: 'Saved buses (1)', exact: true })).toBeVisible();
});

test('track a bus, change direction and choose a route stop', async ({ page, scenario }, testInfo) => {
  void scenario;
  await openApp(page);
  await expect(page.getByRole('img', { name: 'Live GPS', exact: true }).first()).toBeVisible();
  const changeBus = page.getByRole('button', { name: 'Change bus', exact: true });
  await expect(page.locator('#live-arrivals').getByRole('heading')).toBeInViewport();
  await expect(changeBus).toHaveAttribute('aria-expanded', 'false');
  await changeBus.click();
  const nearby = page.getByRole('region', { name: /^Nearest bus stops/ });
  await expect(nearby.getByRole('button', { name: /Bus 72 from Nanyang Poly, towards Tampines/ }).first()).toContainText(/72 → Tampines/);
  await expect(nearby.getByRole('button', { name: /Bus 72 from Opp Nanyang Poly/ }).first()).toContainText(/72 → Yio Chu Kang/);
  await page.getByRole('button', { name: /To Yio Chu Kang Int/ }).click();
  await view(page, 'stops');
  await expect(page.getByRole('heading', { name: 'Route Stops: Bus 72', exact: true })).toBeVisible();
  const stop = page.getByRole('button').filter({ hasText: '55321' }).first();
  await stop.click();
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await view(page, 'arrivals');
  const search = page.getByPlaceholder('Type a bus number');
  if (await changeBus.getAttribute('aria-expanded') === 'false') await changeBus.click();
  await search.fill('50');
  await search.press('Enter');
  await expect(page.getByText('Bus 50 Arrivals', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Live GPS', exact: true }).first()).toBeVisible();
  await expect(changeBus).toHaveAttribute('aria-expanded', 'false');
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

test('keyboard users can enter and dismiss both dialogs and return to the opener', async ({ page, scenario }) => {
  void scenario;
  await openApp(page);
  const cases = [
    { opener: page.getByRole('button', { name: 'Saved buses (1)', exact: true }), title: 'Saved buses (1)' },
    { opener: page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }), title: 'Set your location' },
  ];
  for (const { opener, title } of cases) {
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const first = dialog.getByRole('button', { name: /^Close (location picker|saved buses)$/ });
    const last = dialog.getByRole('button', { name: /^(Close|Done)$/ });
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    // Even a programmatic attempt to focus an underlying action must be ignored.
    await page.locator('header button[title="Your saved buses"]').evaluate(el => (el as HTMLElement).focus());
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  }
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
    const card = page.locator('#live-arrivals');
    await expect(card.getByText('Live times unavailable', { exact: true })).toBeVisible();
    await expect(card.getByText('min', { exact: true })).toHaveCount(0);
    await expect(page.locator('header').getByText('Live', { exact: true })).toBeHidden();
    await checkpoint(page, testInfo, `${mode}-arrivals`);
    if (testInfo.project.name === 'phone') {
      await view(page, 'stops');
      const shortcut = page.getByRole('button', { name: /Live times unavailable.*Show arrivals/ });
      await expect(shortcut).toBeVisible();
      await shortcut.click();
    }
    scenario.arrivals = 'live';
    await card.getByRole('button', { name: 'Retry live arrivals' }).click();
    await expect(card.getByRole('img', { name: 'Live GPS', exact: true }).first()).toBeVisible();
    await expect(card.getByText('Live times unavailable', { exact: true })).toBeHidden();
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
