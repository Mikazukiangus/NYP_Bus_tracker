import { test, expect, openApp, view } from './fixtures';
import { readFileSync } from 'node:fs';

const axeSource = process.env.UX_AXE_SOURCE;
test.skip(!axeSource, 'Set UX_AXE_SOURCE to a locally installed axe-core/axe.min.js to run the audit.');

test('audit responsive views and accessibility', async ({ page, scenario }, info) => {
  void scenario;
  const widths = info.project.name === 'phone' ? [320, 390, 600] : [768, 1024, 1440];
  const results: unknown[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    for (const tab of ['arrivals', 'map', 'stops', 'weather'] as const) {
      await view(page, tab);
      await expect(page.getByText('Loading map…', { exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: readFileSync(axeSource!, 'utf8') });
      const axe = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } }));
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        smallButtons: [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0 && (b.getBoundingClientRect().width < 24 || b.getBoundingClientRect().height < 24)).map(b => ({ label: b.getAttribute('aria-label') ?? b.textContent?.trim(), width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })),
      }));
      // Keep the known dense-stop overlap warnings in the raw report for review.
      const unexpected = await page.evaluate((violations: any[]) => violations.filter(v =>
        v.id !== 'target-size' || !v.nodes.every((n: any) => n.target.every((selector: string) =>
          document.querySelector(selector)?.classList.contains('bus-stop-marker')))), axe.violations);
      expect(unexpected.map((v: any) => v.id), 'Unexpected axe violations').toEqual([]);
      expect(geometry.overflow, 'No page overflow').toBe(false);
      results.push({ width, tab, ...geometry, violations: axe.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n: any) => ({ target: n.target, summary: n.failureSummary })) })) });
    }
  }
  await info.attach('responsive-axe', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

test('audit dialogs and recovery states', async ({ page, scenario }, info) => {
  const results: unknown[] = [];
  const scan = async (state: string) => {
    await page.addScriptTag({ content: readFileSync(axeSource!, 'utf8') });
    const axe = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } }));
    expect(axe.violations.map((v: any) => v.id), 'Dialog/recovery accessibility checks').toEqual([]);
    results.push({ state, violations: axe.violations.map((v: any) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n: any) => n.target) })) });
  };
  await openApp(page);
  await page.getByRole('button', { name: 'Saved buses (1)', exact: true }).click();
  await scan('saved-dialog');
  await page.getByRole('button', { name: 'Close saved buses' }).click();
  await page.getByRole('region', { name: 'Your trip' }).getByRole('button', { name: /^Your location:/ }).click();
  const dialog = page.getByRole('dialog');
  await scan('location-dialog');
  await dialog.getByRole('combobox').fill('54351');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await scan('location-suggestions');
  await dialog.getByRole('combobox').press('Escape');
  await dialog.getByText('Your saved location data', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear location and recent places', exact: true }).click();
  await scan('privacy-confirmation');
  await page.keyboard.press('Escape');
  scenario.arrivals = 'malformed';
  await page.reload();
  await openApp(page);
  await scan('arrival-unavailable');
  await view(page, 'stops');
  await page.getByRole('textbox', { name: 'Search route stops' }).fill('no-match');
  await scan('stops-empty');
  await info.attach('state-axe', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});
