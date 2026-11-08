import { test, expect, openApp, view } from './fixtures';
import { transit } from './data';

test('search supports Escape, Tab and a failed bus lookup without losing input', async ({ page, scenario }) => {
  void scenario;
  await openApp(page);
  await page.getByRole('button', { name: 'Change bus', exact: true }).click();
  const search = page.getByPlaceholder('Type a bus number');
  await search.fill('@@');
  await search.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Enter a valid bus service number' })).toBeVisible();
  await expect(search).toHaveValue('@@');
  await expect(search).toBeVisible();
  await search.fill('50');
  await search.press('Enter');
  await expect(page.getByRole('button', { name: 'Change bus', exact: true })).toBeFocused();
  const place = page.getByRole('combobox', { name: 'Where to?', exact: true });
  await place.fill('53009');
  await expect(page.getByRole('listbox')).toBeVisible();
  await place.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await place.press('Enter');
  await expect(page.getByRole('region', { name: 'Bus trips to Bishan Int', exact: true })).toBeHidden();
  await place.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await place.press('Tab');
  await expect(page.getByRole('listbox')).toBeHidden();
});

test('a pending route search shows progress and prevents duplicate submission', async ({ page, scenario }) => {
  void scenario;
  await openApp(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/bus-routes/50.json', async route => {
    await gate;
    await route.fulfill({ json: transit.routes['50'] });
  });
  await page.getByRole('button', { name: 'Change bus', exact: true }).click();
  await page.getByPlaceholder('Type a bus number').fill('50');
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tracking…', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: 'Bus 50 Arrivals', exact: true })).toBeVisible();
});

test('route-stop filtering offers an accessible reset', async ({ page, scenario }) => {
  void scenario;
  await openApp(page);
  await view(page, 'stops');
  await page.getByRole('textbox', { name: 'Search route stops' }).fill('no-such-stop');
  await expect(page.getByRole('status').filter({ hasText: 'No stops found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear stop filter' }).click();
  await expect(page.getByRole('textbox', { name: 'Search route stops' })).toHaveValue('');
  await expect(page.getByRole('button').filter({ hasText: '55329' }).first()).toBeVisible();
});

test('saved rides are keyboard buttons and location clearing can be cancelled', async ({ page, scenario }) => {
  void scenario;
  await openApp(page);
  await page.getByRole('button', { name: 'Saved buses (1)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const close = await dialog.getByRole('button', { name: 'Close saved buses', exact: true }).boundingBox();
  expect(close!.width).toBeGreaterThanOrEqual(44);
  expect(close!.height).toBeGreaterThanOrEqual(44);
  const saved = dialog.getByRole('button', { name: /^Track Bus 72/ });
  await saved.focus();
  await saved.press('Enter');
  await expect(dialog).toBeHidden();
  await page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }).click();
  const before = await page.evaluate(() => localStorage.getItem('bustrackersg_location_v1'));
  await dialog.getByText('Your saved location data', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear location and recent places', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('bustrackersg_location_v1'))).toBe(before);
  await expect(dialog.getByRole('button', { name: 'Confirm clear' })).toBeHidden();
});

test('major views reflow across compact, tablet and wide windows', async ({ page, scenario }, info) => {
  void scenario;
  const widths = info.project.name === 'phone' ? [320, 390, 600] : [768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    for (const tab of ['arrivals', 'map', 'stops', 'weather'] as const) {
      await view(page, tab);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
});

test('skip navigation and enlarged text keep the primary views usable', async ({ page, scenario }, info) => {
  void scenario;
  await openApp(page);
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await skip.focus();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const capture = info.outputPath('enlarged-text.png');
  await page.screenshot({ path: capture });
  await info.attach('enlarged-text', { path: capture, contentType: 'image/png' });
  for (const tab of ['arrivals', 'stops', 'weather'] as const) {
    const controls = page.viewportSize()!.width < 640
      ? page.locator(`nav[aria-label="Views"] button[aria-label="${tab === 'arrivals' ? 'Arrivals' : tab === 'stops' ? 'Stops' : 'Weather'}"]`)
      : page.getByRole('button', { name: tab === 'arrivals' ? 'Arrival Times' : tab === 'stops' ? 'Route Stops' : 'NEA Weather', exact: true });
    await controls.click({ timeout: 5000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
