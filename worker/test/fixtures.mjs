import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), 'utf8');

// A fresh, editable copy of the test store each call.
export function fixtureStore() {
  const productsFile = JSON.parse(read('merch-products.json'));
  const settings = JSON.parse(read('merch-settings.json'));
  return { productsFile, products: productsFile.products, settings };
}

export const fixtureText = () => ({ products: read('merch-products.json'), settings: read('merch-settings.json') });
