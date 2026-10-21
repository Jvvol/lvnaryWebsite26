const { test, expect } = require('@playwright/test');
const { PAGES, externalRequests } = require('./helpers');

for (const path of PAGES) {
  test(`no third-party requests on load: ${path}`, async ({ page }) => {
    const external = externalRequests(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(external).toEqual([]);
  });
}
