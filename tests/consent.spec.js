const { test, expect } = require('@playwright/test');

const FIXTURE = '/tests/fixtures/consent-test.html';

// Fulfils requests to the fake third-party origin and records which scripts loaded.
async function trackGated(page) {
  const hits = [];
  await page.route('https://example.invalid/**', route => {
    hits.push(new URL(route.request().url()).pathname);
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  return hits;
}

const banner = page => page.getByRole('region', { name: 'Cookie consent' });

test('dormant on real pages: no banner, settings explain nothing optional is used', async ({ page }) => {
  await page.goto('/');
  await expect(banner(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(page.getByRole('dialog')).toContainText("This site doesn't currently use any optional cookies or trackers.");
});

test('nothing optional loads before consent', async ({ page }) => {
  const hits = await trackGated(page);
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(banner(page)).toBeVisible();
  expect(hits).toEqual([]);
});

test('accept all loads gated scripts and is remembered', async ({ page }) => {
  const hits = await trackGated(page);
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => hits.slice().sort()).toEqual(['/analytics.js', '/marketing.js']);
  hits.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await expect(banner(page)).toHaveCount(0);
  expect(hits.sort()).toEqual(['/analytics.js', '/marketing.js']);
});

test('reject all loads nothing and is remembered', async ({ page }) => {
  const hits = await trackGated(page);
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Reject all' }).click();
  await expect(banner(page)).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(banner(page)).toHaveCount(0);
  expect(hits).toEqual([]);
});

test('accept and reject are equally prominent', async ({ page }) => {
  await page.goto(FIXTURE);
  const accept = banner(page).getByRole('button', { name: 'Accept all' });
  const reject = banner(page).getByRole('button', { name: 'Reject all' });
  const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
  expect(Math.abs(a.width - r.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.height - r.height)).toBeLessThanOrEqual(1);
  const bg = l => l.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(await bg(accept)).toBe(await bg(reject));
});

test('customize grants only the chosen category', async ({ page }) => {
  const hits = await trackGated(page);
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Customize' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: /Analytics/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /Marketing/ })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: /Analytics/ }).check();
  await dialog.getByRole('button', { name: 'Save choices' }).click();
  await expect.poll(() => hits).toEqual(['/analytics.js']);
});

test('Global Privacy Control blocks marketing', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  const hits = await trackGated(page);
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => hits).toEqual(['/analytics.js']);
  await page.waitForTimeout(300);
  expect(hits).toEqual(['/analytics.js']);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Global Privacy Control signal detected and honored.');
  await expect(dialog.getByRole('checkbox', { name: /Marketing/ })).toBeDisabled();
});

test('blocked storage fails closed without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
  });
  const hits = await trackGated(page);
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(banner(page)).toBeVisible();
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test('corrupt stored choice is discarded', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lvnary-consent', '{bad'));
  const hits = await trackGated(page);
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(banner(page)).toBeVisible();
  expect(hits).toEqual([]);
});

test('an outdated stored choice asks again', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lvnary-consent', JSON.stringify({
    version: 0, timestamp: '2020-01-01T00:00:00Z',
    categories: { necessary: true, analytics: true, marketing: true, functional: true },
  })));
  const hits = await trackGated(page);
  await page.goto(FIXTURE, { waitUntil: 'networkidle' });
  await expect(banner(page)).toBeVisible();
  expect(hits).toEqual([]);
});

test('withdrawing consent stops scripts after reload', async ({ page }) => {
  const hits = await trackGated(page);
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => hits.length).toBe(2);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  hits.length = 0;
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('dialog').getByRole('button', { name: 'Reject all' }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  expect(hits).toEqual([]);
  expect(await page.evaluate(() => window.lvnaryConsent.get().categories.analytics)).toBe(false);
});

test('settings dialog works from the keyboard', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Cookie settings' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('banner and settings dialog have no WCAG 2.1 AA violations', async ({ page }) => {
  const AxeBuilder = require('@axe-core/playwright').default;
  const scan = async () => (await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
    .violations.map(v => `${v.id}: ${v.help}`);
  await page.goto(FIXTURE);
  await expect(banner(page)).toBeVisible();
  expect(await scan()).toEqual([]);
  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await scan()).toEqual([]);
});
