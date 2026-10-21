const { test, expect } = require('@playwright/test');
const { PAGES, externalRequests } = require('./helpers');

for (const path of PAGES) {
  test(`no third-party requests on load: ${path}`, async ({ page }) => {
    const external = externalRequests(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(external).toEqual([]);
  });
}

for (const path of PAGES) {
  test(`favicon is declared and loads: ${path}`, async ({ page }) => {
    await page.goto(path);
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    const res = await page.request.get(new URL(href, page.url()).href);
    expect(res.status()).toBe(200);
  });
}
