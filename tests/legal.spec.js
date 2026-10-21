const { test, expect } = require('@playwright/test');
const { PAGES } = require('./helpers');

const FOOTER_LINKS = ['Privacy', 'Cookies', 'Terms', 'Accessibility', 'Do Not Sell or Share My Personal Information'];
const LEGAL_PAGES = ['/privacy/', '/cookies/', '/terms/', '/accessibility/', '/do-not-sell/'];

for (const path of PAGES) {
  test(`footer has every legal link and cookie settings: ${path}`, async ({ page }) => {
    await page.goto(path);
    const footer = page.locator('footer');
    for (const name of FOOTER_LINKS) {
      const link = footer.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      const res = await page.request.get(await link.getAttribute('href'));
      expect(res.status(), `${name} link`).toBe(200);
    }
    await expect(footer).toContainText(`© ${new Date().getFullYear()} LVNARY`);
    await footer.getByRole('button', { name: 'Cookie settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

for (const path of PAGES) {
  test(`no horizontal page scroll: ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const path of LEGAL_PAGES) {
  test(`legal page has one h1 and an effective date: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toContainText('Effective date:');
  });
}

async function h2s(page) {
  return page.locator('main h2').allTextContents();
}

test('privacy policy covers the required topics', async ({ page }) => {
  await page.goto('/privacy/');
  expect(await h2s(page)).toEqual(expect.arrayContaining([
    'What we collect', 'How we use it', 'Legal bases', 'Who we share it with', 'How long we keep it',
    'Your rights', 'US state privacy rights', "Children's privacy", 'International visitors', 'Changes', 'Contact',
  ]));
});

test('terms cover the required topics', async ({ page }) => {
  await page.goto('/terms/');
  expect(await h2s(page)).toEqual(expect.arrayContaining([
    'Acceptable use', 'Intellectual property', 'Copyright and DMCA', 'Third-party links and purchases',
    'Disclaimers', 'Limitation of liability', 'Indemnity', 'Governing law', 'Termination', 'Changes', 'Contact',
  ]));
});

test('cookie policy lists the consent record in a table', async ({ page }) => {
  await page.goto('/cookies/');
  const table = page.getByRole('table');
  await expect(table).toContainText('lvnary-consent');
  await expect(table).toContainText('Strictly necessary');
});

test('missing pages show the styled 404', async ({ page }) => {
  await page.goto('/no-such-page/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page drifted out of orbit.');
  await expect(page.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/');
});

test('policy statements are accurate', async ({ page }) => {
  await page.goto('/terms/');
  await expect(page.locator('main')).toContainText('United States District Court for the Northern District of West Virginia');
  await page.goto('/privacy/');
  await expect(page.locator('main')).toContainText('Restrict or object to how we use your information');
  await page.goto('/accessibility/');
  await expect(page.locator('main')).not.toContainText('by hand');
});
