const { test, expect } = require('@playwright/test');

// The real store files, as published: checkout is on, every shirt size has stock, and all three pay apps show.

test('the published store is open: sizes in stock and both ways to pay', async ({ page }) => {
  await page.goto('/merch/');
  await expect(page.getByRole('heading', { level: 1, name: 'Merch' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('Online checkout opens soon.', { exact: false })).toHaveCount(0);

  const tee = page.getByRole('article', { name: /Death Metal T-Shirt/ });
  for (const size of ['S', 'M', 'L', 'XL']) await expect(tee.getByRole('radio', { name: size, exact: true })).toBeEnabled();
  // Bigger sizes cost more, so their names carry the extra, e.g. "3XL +$3.50".
  for (const size of ['2XL', '3XL', '4XL']) await expect(tee.getByRole('radio', { name: `${size} +$` })).toBeEnabled();

  await tee.getByRole('radio', { name: 'M', exact: true }).check();
  await tee.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByRole('button', { name: 'Pay by card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay with Venmo, Cash App, or Zelle' })).toBeVisible();
});

test('a broken products file shows a plain notice, not a blank page', async ({ page }) => {
  await page.route('**/merch/products.json', r => r.fulfill({ contentType: 'application/json', body: '{ "products": [ { "id": "x", } ] }' }));
  await page.goto('/merch/');
  await expect(page.getByText('The store is being updated.', { exact: false })).toBeVisible();
});

test('home page and nav point to the new store', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Shop merch' })).toHaveAttribute('href', '/merch/');
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Merch', includeHidden: true })).toHaveAttribute('href', '/merch/');
  expect(await page.content()).not.toMatch(/bigcartel/i);
});
