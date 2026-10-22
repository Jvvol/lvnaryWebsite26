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

for (const path of PAGES) {
  test(`has a security policy and nothing on the page breaks it: ${path}`, async ({ page }) => {
    const violations = [];
    page.on('console', msg => { if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text()); });
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    expect(violations).toEqual([]);
  });
}
