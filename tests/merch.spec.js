const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');
const { ORIGIN } = require('./helpers');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const API = 'https://shop-api.lvnary.com';

// Serves the test store (some stock, checkout on) instead of the real files.
async function withStore(page) {
  await page.route(`${ORIGIN}/merch/products.json`, r => r.fulfill({ contentType: 'application/json', body: fixture('merch-products.json') }));
  await page.route(`${ORIGIN}/merch/settings.json`, r => r.fulfill({ contentType: 'application/json', body: fixture('merch-settings.json') }));
}

const tee = page => page.getByRole('article', { name: /Death Metal T-Shirt/ });
const logo = page => page.getByRole('article', { name: 'Logo Sticker' });
const bag = page => page.getByRole('region', { name: 'Your bag' });

async function addTee(page, size = 'M') {
  await tee(page).getByRole('radio', { name: size, exact: true }).check();
  await tee(page).getByRole('button', { name: 'Add to bag' }).click();
}

test.beforeEach(async ({ page }) => {
  await withStore(page);
});

test('sold-out sizes are greyed out and can’t be chosen', async ({ page }) => {
  await page.goto('/merch/');
  await expect(tee(page).getByRole('radio', { name: 'S, sold out' })).toBeDisabled();
  await expect(tee(page).getByRole('radio', { name: '4XL, sold out' })).toBeDisabled();
  await expect(tee(page).getByRole('radio', { name: 'M', exact: true })).toBeEnabled();
  await expect(tee(page).getByText('$21.00')).toBeVisible();
  // 2XL costs $2 more to make, so it's listed higher.
  await expect(tee(page).getByRole('radio', { name: /^2XL/ })).toHaveAccessibleName('2XL +$2.00');
});

test('low stock shows how many are left', async ({ page }) => {
  await page.goto('/merch/');
  await tee(page).getByRole('radio', { name: 'XL', exact: true }).check();
  await expect(tee(page).getByText('Only 2 left in XL.')).toBeVisible();
});

test('adding needs a size, then fills the bag with live totals', async ({ page }) => {
  await page.goto('/merch/');
  await tee(page).getByRole('button', { name: 'Add to bag' }).click();
  await expect(tee(page).getByText('Choose a size first.')).toBeVisible();

  await addTee(page, 'M');
  await expect(tee(page).getByText('Added to your bag.')).toBeVisible();
  await logo(page).getByRole('button', { name: 'Add to bag' }).click();

  await expect(bag(page).getByText('Death Metal T-Shirt (Limited Edition), size M', { exact: true })).toBeVisible();
  await expect(page.locator('#itemsTotal')).toHaveText('$23.50');
  await expect(page.locator('#shippingTotal')).toHaveText('Choose where to ship');
  await page.getByLabel('Ship to').selectOption('US');
  await expect(page.locator('#shippingTotal')).toHaveText('$5.98');
  await expect(page.locator('#grandTotal')).toHaveText('$29.48');

  // The bag survives a reload.
  await page.reload();
  await expect(page.locator('#grandTotal')).toHaveText('$29.48');

  await bag(page).getByRole('button', { name: 'Remove Logo Sticker' }).click();
  await expect(page.locator('#itemsTotal')).toHaveText('$21.00');
});

test('you can’t add more than is in stock', async ({ page }) => {
  await page.goto('/merch/');
  await tee(page).getByRole('radio', { name: 'XL', exact: true }).check();
  await tee(page).getByLabel('Quantity').fill('5');
  await tee(page).getByRole('button', { name: 'Add to bag' }).click();
  await expect(tee(page).getByText('Added 2, all we have left.')).toBeVisible();
});

test('pay by card asks where to ship, then hands off to Stripe', async ({ page }) => {
  let sent;
  await page.route(`${API}/checkout`, async r => {
    sent = r.request().postDataJSON();
    await r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': ORIGIN }, body: JSON.stringify({ url: `${ORIGIN}/merch/thanks/?order=LV-ABC234` }) });
  });
  await page.goto('/merch/');
  await addTee(page, 'L');
  await page.getByRole('button', { name: 'Pay by card' }).click();
  await expect(page.getByText('Choose where to ship your order.')).toBeVisible();
  await expect(page.getByLabel('Ship to')).toBeFocused();

  await page.getByLabel('Ship to').selectOption('CA');
  await page.getByRole('button', { name: 'Pay by card' }).click();
  await expect(page).toHaveURL(/\/merch\/thanks\/\?order=LV-ABC234$/);
  expect(sent).toEqual({ cart: [{ id: 'death-metal-tee', size: 'L', qty: 1 }], zone: 'CA' });
  await expect(page.getByText('Your order number is LV-ABC234.')).toBeVisible();

  // Paid bags are emptied.
  await page.goto('/merch/');
  await expect(page.getByText('Your bag is empty.')).toBeVisible();
});

test('if stock ran out meanwhile, checkout explains and the bag updates', async ({ page }) => {
  await page.route(`${API}/checkout`, r => r.fulfill({
    status: 409, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': ORIGIN },
    body: JSON.stringify({ problems: [{ id: 'death-metal-tee', size: 'M', message: 'Death Metal T-Shirt (Limited Edition), size M just sold out. Remove it to continue.' }] }),
  }));
  await page.goto('/merch/');
  await addTee(page, 'M');
  await page.getByLabel('Ship to').selectOption('US');
  await page.getByRole('button', { name: 'Pay by card' }).click();
  await expect(page.locator('#bagStatus')).toHaveText(/size M just sold out/);
  await expect(page.getByRole('button', { name: 'Pay by card' })).toBeEnabled();
});

test('checkout errors say what to do next', async ({ page }) => {
  await page.route(`${API}/checkout`, r => r.abort());
  await page.goto('/merch/');
  await addTee(page);
  await page.getByLabel('Ship to').selectOption('US');
  await page.getByRole('button', { name: 'Pay by card' }).click();
  await expect(page.locator('#bagStatus')).toHaveText("We couldn't reach checkout. Check your connection and try again.");
});

test('the bag shows the order terms before anyone pays', async ({ page }) => {
  await page.goto('/merch/');
  await logo(page).getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.locator('#bagCheckout')).toContainText('include card processing');
  await expect(page.locator('#bagCheckout')).toContainText('ship within 30 days');
  await expect(page.locator('#bagCheckout').getByRole('link', { name: 'Terms and returns' })).toHaveAttribute('href', '/terms/#third-party-links-and-purchases');
  await expect(page.locator('#bagCheckout').getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy/');
});

test('paying by card asks where to ship first', async ({ page }) => {
  await page.goto('/merch/');
  await addTee(page);
  await page.getByRole('button', { name: 'Pay by card' }).click();
  await expect(page.locator('#ship-zone-error')).toHaveText('Choose where to ship your order.');
  await page.getByLabel('Ship to').selectOption('WORLD');
  await expect(page.locator('#shippingTotal')).not.toHaveText('Choose where to ship');
});

test('the mobile bag bar jumps to the bag', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'bag bar only shows on small screens');
  await page.goto('/merch/');
  await expect(page.locator('#bagBar')).toBeHidden();
  await addTee(page);
  const bar = page.getByRole('link', { name: 'View bag: 1 item, $21.00' });
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(bag(page)).toBeInViewport();
});

test('no WCAG 2.1 AA violations with a full bag', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/merch/');
  await addTee(page);
  await page.getByLabel('Ship to').selectOption('US');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([]);
});

test('no sideways scrolling with a full bag', async ({ page }) => {
  await page.goto('/merch/');
  await addTee(page);
  await logo(page).getByRole('button', { name: 'Add to bag' }).click();
  await page.getByLabel('Ship to').selectOption('WORLD');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
