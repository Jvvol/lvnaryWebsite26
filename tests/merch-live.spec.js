const { test, expect } = require('@playwright/test');

// The real store files, as published: checkout stays off until the worker address is filled in.

test('with checkout off, the store shows products and says checkout opens soon', async ({ page }) => {
  await page.goto('/merch/');
  await expect(page.getByRole('heading', { level: 1, name: 'Merch' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('Online checkout opens soon.', { exact: false })).toBeVisible();
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
