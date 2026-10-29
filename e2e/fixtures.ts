import { readFileSync } from 'node:fs';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { arrivals, fixedTime, transit, weather } from './data';
import { errorEventSchema, type ErrorEvent } from '../shared/errors/events';

type Scenario = {
  arrivals: 'live' | 'simulated' | 'malformed';
  weather: 'available' | 'unavailable';
  reports: ErrorEvent[];
  allowReports: boolean;
};
export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({ page }, use) => {
    const scenario: Scenario = { arrivals: 'live', weather: 'available', reports: [], allowReports: false };
    const unexpected: string[] = [], pageErrors: string[] = [];
    const tile = readFileSync(new URL('./fixtures/map-tile.svg', import.meta.url));
    page.on('pageerror', error => pageErrors.push(error.message));
    // Advance normally from a known date: Leaflet uses Date.now() for tile fades/pans.
    await page.clock.install({ time: new Date(fixedTime) });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (url.origin === 'http://127.0.0.1:4173') {
        if (url.pathname === '/api/bus-arrival') {
          const body = arrivals(url.searchParams.get('BusStopCode') ?? '');
          if (scenario.arrivals === 'malformed') return json({ ...body, Services: 'invalid' });
          if (scenario.arrivals === 'simulated') return json({ ...body, source: 'FALLBACK_SIMULATED', warning: 'Test simulation' });
          return json(body);
        }
        if (url.pathname === '/api/bus-route') {
          const data = transit.routes[url.searchParams.get('ServiceNo') ?? ''];
          return json(data ?? { error: 'Route not found' }, data ? 200 : 404);
        }
        if (url.pathname === '/api/weather') return json(scenario.weather === 'available' ? weather : { error: 'Unavailable' }, scenario.weather === 'available' ? 200 : 503);
        if (url.pathname === '/api/traffic-incidents') return json({ incidents: [], fetchedAt: fixedTime, source: 'LTA_DATAMALL' });
        if (url.pathname === '/api/health') return json({ service: 'BusTrackerSG', status: 'ok', timestamp: fixedTime });
        if (url.pathname === '/api/client-errors' && request.method() === 'POST') {
          scenario.reports.push(errorEventSchema.parse(request.postDataJSON()));
          return route.fulfill({ status: 204 });
        }
        if (url.pathname === '/bus-routes/network.json') return json(transit.network);
        if (url.pathname === '/bus-routes/index.json') return json(transit.index);
        const routeMatch = url.pathname.match(/^\/bus-routes\/(50|72)\.json$/);
        if (routeMatch) return json(transit.routes[routeMatch[1]]);
        const shapeMatch = url.pathname.match(/^\/route-shapes\/(50|72)\.json$/);
        if (shapeMatch) return json(transit.shapes[shapeMatch[1]]);
        // Only the real app document and bundled assets may reach the preview server.
        if (url.pathname === '/' || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico') return route.continue();
      }
      if (url.origin === 'https://www.onemap.gov.sg' && (/^\/maps\/tiles\//.test(url.pathname) || url.pathname === '/web-assets/images/logo/om_logo.png')) {
        return route.fulfill({ contentType: 'image/svg+xml', body: tile });
      }
      if (url.origin === 'https://api-open.data.gov.sg' && url.pathname === '/v2/real-time/api/two-hr-forecast' && scenario.weather === 'unavailable') return json({ error: 'Unavailable' }, 503);
      unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    });
    await use(scenario);
    expect(unexpected, 'All data/provider requests must use declared fixtures').toEqual([]);
    expect(pageErrors, 'Unexpected browser exceptions').toEqual([]);
    if (!scenario.allowReports) expect(scenario.reports, 'Unexpected application error reports').toEqual([]);
  },
});
export { expect };

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Bus 72 Arrivals', { exact: true })).toBeVisible();
}

export async function view(page: Page, name: 'arrivals' | 'map' | 'stops' | 'weather') {
  // Phone navigation intentionally hides while a text input has keyboard focus.
  await page.locator('input:focus').evaluateAll(inputs => inputs.forEach(input => (input as HTMLInputElement).blur()));
  const labels = { arrivals: ['Arrivals', 'Arrival Times'], map: ['Map', 'Live Bus Map'], stops: ['Stops', 'Route Stops'], weather: ['Weather', 'NEA Weather'] };
  const phone = (page.viewportSize()?.width ?? 1280) < 640;
  const button = phone ? page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: new RegExp(`^${labels[name][0]}(?: \\(weather alert\\))?$`) }) : page.getByRole('button', { name: labels[name][1], exact: true });
  await button.click();
}

export async function checkpoint(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText('Loading map…', { exact: true })).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 1280) >= 640 && await page.getByRole('heading', { name: /^Bus \d+ Arrivals$/ }).count()) {
    await expect(page.locator('.leaflet-container')).toHaveCount(1);
  }
  if (await page.locator('.leaflet-container').count()) {
    await expect.poll(() => page.locator('.leaflet-container').evaluateAll(maps => maps.every(map => {
      const tiles = [...map.querySelectorAll<HTMLImageElement>('.leaflet-tile')];
      return !map.classList.contains('leaflet-zoom-anim') && tiles.length > 0 && tiles.every(tile => tile.complete && tile.naturalWidth > 0 && getComputedStyle(tile).opacity === '1');
    })), { message: 'Map tiles decoded and real Leaflet animation finished' }).toBe(true);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: 'No horizontal page overflow' }).toBe(true);
  // The dedicated journey-map checkpoint compares map pixels. Incidental map previews can
  // finish a different subpixel pan during other flows, so keep them outside those baselines.
  const mask = [page.locator('header').getByText(/^\d{2}:\d{2}:\d{2} SGT$/), page.locator('.leaflet-container')];
  const fullPage = name !== 'saved-buses';
  const path = testInfo.outputPath(`${name}.png`);
  if (name === 'journey-map') {
    const map = page.locator('.leaflet-container');
    await map.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    if (process.env.E2E_VISUAL === '1') await expect(map).toHaveScreenshot(`${name}.png`);
    await map.screenshot({ path, animations: 'disabled' });
  } else {
    if (process.env.E2E_VISUAL === '1') await expect(page).toHaveScreenshot(`${name}.png`, { fullPage, mask });
    await page.screenshot({ path, fullPage, animations: 'disabled' });
  }
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
