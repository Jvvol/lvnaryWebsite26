const { test, expect } = require('@playwright/test');
const { ORIGIN } = require('./helpers');

// Serves the home page with the given show rows authored inside the shows list.
async function withShows(page, rows) {
  await page.route(`${ORIGIN}/`, async route => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      /(<div class="shows-list" id="showsList">)/,
      `$1${rows}`
    );
    await route.fulfill({ response: res, body });
  });
}

test('skip link is first focusable and moves focus to main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Skip to content');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('main');
});

test('mobile menu toggles with keyboard', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'menu toggle only shows on small screens');
  await page.goto('/');
  const toggle = page.locator('.nav-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#nav-links')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('no horizontal overflow with long venue names', async ({ page }) => {
  const venue = 'The Extraordinarily Long Named Community Center and Ballroom';
  const row = `<div class="show-row" data-month="DEC" data-day="12" data-venue="${venue}" data-location="Saint Clairsville, OH" data-tickets="https://example.com/t"></div>`;
  await withShows(page, row.repeat(3));
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('ticket link is visible and named for the venue', async ({ page }) => {
  await withShows(page, `<div class="show-row" data-month="DEC" data-day="12" data-venue="Declan's Room" data-location="Morgantown, WV" data-tickets="https://example.com/t"></div>`);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Tickets for Declan's Room/ })).toBeVisible();
});

test('show data is rendered as text, not HTML', async ({ page }) => {
  await withShows(page, `<div class="show-row" data-month="DEC" data-day="12" data-venue="&lt;img src=x onerror=window.__pwned=1&gt;" data-location="WV"></div>`);
  await page.goto('/');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('.show-row').first()).toContainText('<img src=x');
});

test('empty shows state points to the mailing list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#showsList')).toContainText('No shows booked right now. Join the mailing list to hear first.');
});

test('content and footer links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: ORIGIN });
  const page = await context.newPage();
  await page.goto('/');
  for (const name of ['Music', 'Shows', 'Merch', 'About']) {
    const heading = page.getByRole('heading', { level: 2, name });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate(h => getComputedStyle(h).opacity)).toBe('1');
  }
  await expect(page.locator('footer').getByRole('link', { name: 'Privacy' })).toBeVisible();
  await context.close();
});

test('reduced motion stops animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.locator('.hero-wordmark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  const canvas = page.locator('canvas.starfield');
  const first = await canvas.evaluate(c => c.toDataURL());
  await page.waitForTimeout(500);
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(first);
});

test('new-tab links are safe and announced', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('a[target="_blank"]').evaluateAll(as => as.map(a => ({
    rel: a.rel,
    name: a.getAttribute('aria-label') || a.textContent,
  })));
  expect(links.length).toBeGreaterThan(0);
  for (const l of links) {
    expect(l.rel).toContain('noopener');
    expect(l.name).toContain('opens in new tab');
  }
});

test('without JavaScript, the placeholder signup and cookie settings are hidden', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: ORIGIN });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#signup')).toBeHidden();
  await expect(page.locator('#mailing-list')).toContainText('Signup needs JavaScript');
  await expect(page.getByRole('button', { name: 'Cookie settings' })).toBeHidden();
  await context.close();
});
