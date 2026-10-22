const { test, expect } = require('@playwright/test');
const { externalRequests } = require('./helpers');

const PROVIDER = 'https://example.invalid/subscribe';
const CORS = { 'Access-Control-Allow-Origin': '*' };

const form = page => page.locator('#signup');
const email = page => page.getByLabel('Email address');
const consent = page => page.getByRole('checkbox', { name: /16 or older/ });
const submit = page => form(page).locator('button[type="submit"]');
const status = page => form(page).getByRole('status');

async function expectFieldError(page, field, message) {
  await expect(page.getByText(message)).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  const ids = describedBy.split(/\s+/);
  const texts = await Promise.all(ids.map(id => page.locator(`#${id}`).textContent()));
  expect(texts.join(' ')).toContain(message);
}

// Points the form at a fake worker so tests never reach the real one.
async function useProvider(page) {
  await form(page).evaluate((f, url) => { f.action = url; }, PROVIDER);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#mailing-list');
});

test('marketing consent checkbox is unchecked by default', async ({ page }) => {
  await expect(consent(page)).not.toBeChecked();
  await expect(form(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy/');
});

test('empty email shows a fix-it error', async ({ page }) => {
  await submit(page).click();
  await expectFieldError(page, email(page), 'Enter your email address.');
});

test('malformed email shows an example', async ({ page }) => {
  await email(page).fill('abc');
  await consent(page).check();
  await submit(page).click();
  await expectFieldError(page, email(page), 'Enter an email address like name@example.com.');
});

test('consent is required', async ({ page }) => {
  await email(page).fill('fan@example.com');
  await submit(page).click();
  await expectFieldError(page, consent(page), "Check the box to confirm you're 16 or older and want our emails.");
});

test('the form sends signups to the store worker', async ({ page }) => {
  await expect(form(page)).toHaveAttribute('action', 'https://shop-api.lvnary.com/subscribe');
});

test('successful signup shows loading then confirmation', async ({ page }) => {
  let release, sent;
  const held = new Promise(r => { release = r; });
  await page.route(PROVIDER, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type' } });
    sent = route.request().postDataJSON();
    await held;
    route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"status":"success"}' });
  });
  await useProvider(page);
  await email(page).fill('fan@example.com');
  await consent(page).check();
  await submit(page).click();
  await expect(submit(page)).toHaveText('Subscribing…');
  await expect(submit(page)).toBeDisabled();
  release();
  await expect(status(page)).toHaveText("You're on the list. Thanks for signing up.");
  expect(sent).toEqual({ email: 'fan@example.com', consent: true, website: '' });
  await expect(email(page)).toHaveValue('');
});

test('problems the worker finds show on the field', async ({ page }) => {
  await page.route(PROVIDER, route => route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 422,
    headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type' },
    contentType: 'application/json',
    body: JSON.stringify({ fieldErrors: { email: 'Enter an email address like name@example.com.' } }),
  }));
  await useProvider(page);
  await email(page).fill('fan@example.c');
  await consent(page).check();
  await submit(page).click();
  await expectFieldError(page, email(page), 'Enter an email address like name@example.com.');
  await expect(email(page)).toBeFocused();
});

test('provider error lets you retry', async ({ page }) => {
  await page.route(PROVIDER, route => route.fulfill({ status: route.request().method() === 'OPTIONS' ? 204 : 500, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' }));
  await useProvider(page);
  await email(page).fill('fan@example.com');
  await consent(page).check();
  await submit(page).click();
  await expect(status(page)).toHaveText('Something went wrong on our end. Try again in a minute.');
  await expect(submit(page)).toBeEnabled();
  await expect(submit(page)).toHaveText('Subscribe');
});

test('network failure shows a retry message and stays on the page', async ({ page }) => {
  let posts = 0;
  await page.route(PROVIDER, route => { posts++; route.abort('internetdisconnected'); });
  await useProvider(page);
  await email(page).fill('fan@example.com');
  await consent(page).check();
  await submit(page).click();
  await expect(status(page)).toHaveText("We couldn't reach the signup service. Check your connection and try again.");
  expect(new URL(page.url()).pathname).toBe('/');
  expect(posts).toBe(1);
  await expect(submit(page)).toBeEnabled();
});
