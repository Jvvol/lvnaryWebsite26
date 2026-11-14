import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quote, listedUnitCents, checkStoreFiles } from '../../js/store-core.js';
import { fixtureStore } from './fixtures.mjs';

const realProducts = JSON.parse(readFileSync(new URL('../../merch/products.json', import.meta.url)));
const realSettings = JSON.parse(readFileSync(new URL('../../merch/settings.json', import.meta.url)));

test('the published store files pass the checks', () => {
  assert.deepEqual(checkStoreFiles(realProducts, realSettings), []);
});

test('listed prices cover the card fee and round up to the step', () => {
  const { products, settings } = fixtureStore();
  const [tee, sticker, logo] = products;
  assert.equal(listedUnitCents(tee, tee.variants[0], settings), 2100); // $20 / 0.971 = 20.60 → $21.00
  assert.equal(listedUnitCents(sticker, sticker.variants[0], settings), 350); // $3 → 3.09 → $3.50
  assert.equal(listedUnitCents(logo, logo.variants[0], settings), 250); // $2 → 2.06 → $2.50
  assert.equal(listedUnitCents(tee, tee.variants.find(v => v.size === '2XL'), settings), 2300); // $22 → 22.66 → $23.00
});

test('stickers-only orders use letter rates; any shirt switches to parcel', () => {
  const { products, settings } = fixtureStore();
  const letters = quote({ cart: [{ id: 'logo-sticker', size: 'One size', qty: 2 }], products, settings, zone: 'US' });
  assert.equal(letters.shipsAs, 'letter');
  // (150 + 25 postage + 30 fixed fee) / 0.971 = 211.1 → 212
  assert.equal(letters.shippingCents, 212);
  const parcel = quote({ cart: [{ id: 'logo-sticker', size: 'One size', qty: 2 }, { id: 'death-metal-tee', size: 'M', qty: 1 }], products, settings, zone: 'US' });
  assert.equal(parcel.shipsAs, 'parcel');
  // One shirt: (550 + 30) / 0.971 = 597.3 → 598; stickers ride along free.
  assert.equal(parcel.shippingCents, 598);
});

test('the band always nets take-home prices plus postage, in every zone', () => {
  const { products, settings } = fixtureStore();
  const carts = [
    [{ id: 'logo-sticker', size: 'One size', qty: 1 }],
    [{ id: 'death-metal-sticker', size: 'One size', qty: 3 }, { id: 'logo-sticker', size: 'One size', qty: 4 }],
    [{ id: 'death-metal-tee', size: 'M', qty: 2 }, { id: 'death-metal-tee', size: '2XL', qty: 1 }],
    [{ id: 'death-metal-tee', size: 'L', qty: 1 }, { id: 'death-metal-sticker', size: 'One size', qty: 1 }],
  ];
  for (const zone of ['US', 'CA', 'WORLD']) {
    for (const cart of carts) {
      const q = quote({ cart, products, settings, zone });
      assert.deepEqual(q.problems, []);
      const pct = (settings.card_fee.percent + (zone === 'US' ? 0 : settings.international_card_percent)) / 100;
      const fee = Math.round(q.totalCents * pct + settings.card_fee.fixed * 100);
      const rate = settings.shipping[zone][q.shipsAs];
      const count = q.lines.filter(l => q.shipsAs === 'letter' || l.shipsAs === 'parcel').reduce((n, l) => n + l.qty, 0);
      const postage = Math.round(rate.first * 100) + (count - 1) * Math.round(rate.each_additional * 100);
      const net = q.lines.reduce((s, l) => s + l.netCents, 0);
      assert.ok(q.totalCents - fee >= net + postage, `${zone} ${JSON.stringify(cart)}: kept ${q.totalCents - fee}, needed ${net + postage}`);
    }
  }
});

test('free shipping applies only when turned on, in its zones, over the minimum', () => {
  const { products, settings } = fixtureStore();
  const cart = [{ id: 'death-metal-tee', size: 'M', qty: 3 }];
  assert.ok(quote({ cart, products, settings, zone: 'US' }).shippingCents > 0);
  settings.free_shipping = { enabled: true, minimum_order: 50, zones: ['US'] };
  assert.equal(quote({ cart, products, settings, zone: 'US' }).shippingCents, 0);
  assert.ok(quote({ cart, products, settings, zone: 'CA' }).shippingCents > 0);
  assert.ok(quote({ cart: [{ id: 'death-metal-tee', size: 'M', qty: 1 }], products, settings, zone: 'US' }).shippingCents > 0);
});

test('sold out, hidden, and over-stock items block checkout with a plain message', () => {
  const { products, settings } = fixtureStore();
  const msg = cart => quote({ cart, products, settings, zone: 'US' }).problems.map(p => p.message);
  assert.match(msg([{ id: 'death-metal-tee', size: 'S', qty: 1 }])[0], /just sold out/);
  assert.match(msg([{ id: 'death-metal-tee', size: 'M', qty: 9 }])[0], /Only 3 left/);
  // The same size added twice is checked as one line.
  assert.match(msg([{ id: 'death-metal-tee', size: 'M', qty: 2 }, { id: 'death-metal-tee', size: 'M', qty: 2 }])[0], /Only 3 left/);
  products[2].status = 'hidden';
  assert.match(msg([{ id: 'logo-sticker', size: 'One size', qty: 1 }])[0], /no longer available/);
  products[1].status = 'sold_out';
  assert.match(msg([{ id: 'death-metal-sticker', size: 'One size', qty: 1 }])[0], /just sold out/);
  assert.match(msg([{ id: 'nope', size: 'M', qty: 1 }])[0], /no longer available/);
  assert.match(msg([{ id: 'death-metal-tee', size: 'M', qty: 0 }])[0], /between 1 and 10/);
  assert.match(quote({ cart: [{ id: 'death-metal-tee', size: 'M', qty: 1 }], products, settings, zone: 'MARS' }).problems[0].message, /Choose where to ship/);
});

test('store file checks explain mistakes in plain words', () => {
  const { productsFile, settings } = fixtureStore();
  productsFile.products[0].take_home_price = '$20';
  productsFile.products[0].variants[0].stock = -1;
  productsFile.products[1].status = 'soldout';
  productsFile.products[2].photos[0].alt = '';
  settings.free_shipping.enabled = 'yes';
  const errs = checkStoreFiles(productsFile, settings).join('\n');
  assert.match(errs, /take_home_price must be a number/);
  assert.match(errs, /stock must be a whole number/);
  assert.match(errs, /status must be/);
  assert.match(errs, /needs alt text/);
  assert.match(errs, /free_shipping enabled must be true or false/);
});
