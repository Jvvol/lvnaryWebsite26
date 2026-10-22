import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { signPayload } from '../src/stripe.js';
import { setStockInText } from '../src/github.js';
import { buildRawEmail } from '../src/email.js';
import { fixtureText } from './fixtures.mjs';

const ORIGIN = 'https://lvnary.com';
const env = () => ({
  SITE_ORIGIN: ORIGIN,
  ALLOWED_ORIGINS: ORIGIN,
  GITHUB_REPO: 'band/site',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'gh-test',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STORE_KV: kv,
});

let files, commits, stripeCalls, emails, kv, realFetch;

function memoryKV() {
  const m = new Map();
  const meta = new Map();
  return { get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v, opts = {}) => { m.set(k, v); meta.set(k, opts.metadata); }, map: m, meta };
}

beforeEach(() => {
  const t = fixtureText();
  files = { 'merch/products.json': { text: t.products, sha: 'sha1' }, 'merch/settings.json': { text: t.settings, sha: 'sha1' } };
  commits = [];
  stripeCalls = [];
  emails = [];
  kv = memoryKV();
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      const path = u.pathname.split('/contents/')[1];
      if (!init.method || init.method === 'GET') {
        const f = files[path];
        return new Response(JSON.stringify({ content: Buffer.from(f.text).toString('base64'), sha: f.sha }), { status: 200 });
      }
      const body = JSON.parse(init.body);
      if (body.sha !== files[path].sha) return new Response('{}', { status: 409 });
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      files[path] = { text, sha: `sha${commits.length + 2}` };
      commits.push({ path, message: body.message, text });
      return new Response('{}', { status: 200 });
    }
    if (u.hostname === 'api.stripe.com') {
      stripeCalls.push({ path: u.pathname, params: new URLSearchParams(init.body) });
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const deps = { sendEmail: async e => { emails.push(e); } };
const post = (path, body, headers = {}) => new Request(`https://shop-api.lvnary.com${path}`, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const stockOf = (id, size) => JSON.parse(files['merch/products.json'].text).products.find(p => p.id === id).variants.find(v => v.size === size).stock;

test('checkout prices come from the store file, not the browser', async () => {
  const res = await handle(post('/checkout', { zone: 'US', cart: [{ id: 'death-metal-tee', size: 'M', qty: 2, price: 1 }] }), env(), deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const p = stripeCalls[0].params;
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '2100');
  assert.equal(p.get('line_items[0][quantity]'), '2');
  assert.equal(p.get('line_items[0][price_data][product_data][name]'), 'Death Metal T-Shirt (Limited Edition), size M');
  // Two shirts: (550 + 150 + 30) / 0.971 = 751.8 → 752
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '752');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), 'US');
  assert.match(p.get('success_url'), /^https:\/\/lvnary\.com\/merch\/thanks\/\?order=LV-[A-Z0-9]{6}$/);
  assert.deepEqual(JSON.parse(p.get('metadata[item_0]')), { id: 'death-metal-tee', size: 'M', qty: 2, label: 'Death Metal T-Shirt (Limited Edition), size M', lineCents: 4200 });
});

test('checkout refuses sold-out sizes and too-large quantities', async () => {
  const res = await handle(post('/checkout', { zone: 'US', cart: [{ id: 'death-metal-tee', size: 'S', qty: 1 }] }), env(), deps);
  assert.equal(res.status, 409);
  assert.match((await res.json()).problems[0].message, /sold out/);
  assert.equal(stripeCalls.length, 0);
});

test('checkout says the store is updating if the products file is broken', async () => {
  files['merch/products.json'].text = files['merch/products.json'].text.replace('"take_home_price": 20', '"take_home_price": "20"');
  const res = await handle(post('/checkout', { zone: 'US', cart: [{ id: 'death-metal-tee', size: 'M', qty: 1 }] }), env(), deps);
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /being updated/);
});

async function signedWebhook(event, secret = 'whsec_test') {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = await signPayload(secret, t, payload);
  return post('/stripe-webhook', payload, { 'Stripe-Signature': `t=${t},v1=${sig}` });
}

const paidEvent = () => ({
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_test_1', payment_status: 'paid', livemode: false, amount_total: 4952, payment_intent: 'pi_1', client_reference_id: 'LV-ABC234',
    metadata: { order: 'LV-ABC234', zone: 'US', item_0: JSON.stringify({ id: 'death-metal-tee', size: 'M', qty: 2, label: 'Death Metal T-Shirt (Limited Edition), size M', lineCents: 4200 }) },
    customer_details: { email: 'fan@example.com', name: 'Sam Fan' },
    collected_information: { shipping_details: { name: 'Sam Fan', address: { line1: '1 High St', city: 'Morgantown', state: 'WV', postal_code: '26505', country: 'US' } } },
    total_details: { amount_shipping: 752 },
  } },
});

test('a paid order lowers stock once and emails the band the address and items', async () => {
  const res = await handle(await signedWebhook(paidEvent()), env(), deps);
  assert.equal(res.status, 200);
  assert.equal(stockOf('death-metal-tee', 'M'), 1);
  assert.equal(commits.length, 1);
  assert.match(commits[0].message, /LV-ABC234/);
  // The band's notes and one-line sizes survive the edit.
  assert.match(commits[0].text, /"_help": \[/);
  assert.match(commits[0].text, /\{ "size": "M", "stock": 1 \}/);
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /New card order LV-ABC234: \$49\.52, paid/);
  assert.match(emails[0].text, /Sam Fan\n1 High St\nMorgantown WV 26505\nUS/);
  assert.match(emails[0].text, /2 × Death Metal T-Shirt \(Limited Edition\), size M: \$42\.00/);
  assert.match(emails[0].text, /TEST MODE/);
  assert.equal(emails[0].replyTo, 'fan@example.com');

  // Stripe retries the same event: nothing happens twice.
  await handle(await signedWebhook(paidEvent()), env(), deps);
  assert.equal(stockOf('death-metal-tee', 'M'), 1);
  assert.equal(commits.length, 1);
  assert.equal(emails.length, 1);
});

test('an oversold order is flagged in the email and stock stops at 0', async () => {
  const e = paidEvent();
  e.data.object.metadata.item_0 = JSON.stringify({ id: 'death-metal-tee', size: 'XL', qty: 3, label: 'Tee XL', lineCents: 6300 });
  await handle(await signedWebhook(e), env(), deps);
  assert.equal(stockOf('death-metal-tee', 'XL'), 0);
  assert.match(emails[0].text, /OVERSOLD: death-metal-tee XL \(wanted 3, had 2\)/);
});

test('webhooks with a bad or missing signature are rejected', async () => {
  assert.equal((await handle(await signedWebhook(paidEvent(), 'whsec_wrong'), env(), deps)).status, 400);
  assert.equal((await handle(post('/stripe-webhook', JSON.stringify(paidEvent())), env(), deps)).status, 400);
  assert.equal(commits.length, 0);
});

test('unpaid sessions are ignored', async () => {
  const e = paidEvent();
  e.data.object.payment_status = 'unpaid';
  assert.equal((await handle(await signedWebhook(e), env(), deps)).status, 200);
  assert.equal(commits.length, 0);
});

const p2pOrder = over => ({
  zone: 'US', app: 'venmo', name: 'Sam Fan', email: 'fan@example.com',
  address: { line1: '1 High St', city: 'Morgantown', state: 'WV', postal_code: '26505' },
  cart: [{ id: 'logo-sticker', size: 'One size', qty: 2 }],
  ...over,
});

test('a Venmo order gets a number, holds stock, and emails the band', async () => {
  const res = await handle(post('/order', p2pOrder()), env(), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.order, /^LV-[A-Z0-9]{6}$/);
  assert.equal(body.handle, '@lvnary-test');
  assert.equal(body.totalCents, 500 + 212);
  assert.equal(stockOf('logo-sticker', 'One size'), 18);
  assert.match(emails[0].subject, new RegExp(`New Venmo order ${body.order}: \\$7\\.12, NOT PAID YET`));
  assert.match(emails[0].text, /Sam Fan\n1 High St\nMorgantown WV 26505\nUnited States/);
});

test('order form problems come back per field', async () => {
  const res = await handle(post('/order', p2pOrder({ email: 'nope', address: { line1: '' }, app: 'zelle' })), env(), deps);
  assert.equal(res.status, 422);
  const { fieldErrors } = await res.json();
  assert.equal(fieldErrors.email, 'Enter an email address like name@example.com.');
  assert.equal(fieldErrors.line1, 'Enter your street address.');
  assert.equal(fieldErrors.state, 'Enter your state.');
  // Zelle has no handle in the test settings, so it isn't offered.
  assert.equal(fieldErrors.app, 'Choose how you’ll pay.');
  assert.equal(commits.length, 0);
});

test('bots and floods are turned away', async () => {
  assert.equal((await handle(post('/order', p2pOrder({ website: 'spam.example' })), env(), deps)).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await handle(post('/order', p2pOrder()), env(), deps)).status, 200);
  assert.equal((await handle(post('/order', p2pOrder()), env(), deps)).status, 429);
});

test('a signup is saved with the date and what the person agreed to', async () => {
  const res = await handle(post('/subscribe', { email: '  Fan@Example.com ', consent: true }), env(), deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const saved = kv.meta.get('sub:fan@example.com');
  assert.equal(saved.email, 'fan@example.com');
  assert.match(saved.signed_up, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(saved.consent, /16 or older/);
  // Signing up again is fine and keeps one entry.
  assert.equal((await handle(post('/subscribe', { email: 'fan@example.com', consent: true }), env(), deps)).status, 200);
  assert.equal([...kv.map.keys()].filter(k => k.startsWith('sub:')).length, 1);
});

test('signups need a real address and the consent box', async () => {
  const res = await handle(post('/subscribe', { email: 'abc', consent: false }), env(), deps);
  assert.equal(res.status, 422);
  const { fieldErrors } = await res.json();
  assert.equal(fieldErrors.email, 'Enter an email address like name@example.com.');
  assert.match(fieldErrors.consent, /16 or older/);
  assert.equal([...kv.map.keys()].some(k => k.startsWith('sub:')), false);
});

test('signup bots and floods are turned away', async () => {
  assert.equal((await handle(post('/subscribe', { email: 'bot@example.com', consent: true, website: 'spam.example' }), env(), deps)).status, 400);
  assert.equal(kv.meta.get('sub:bot@example.com'), undefined);
  for (let i = 0; i < 5; i++) assert.equal((await handle(post('/subscribe', { email: `fan${i}@example.com`, consent: true }), env(), deps)).status, 200);
  assert.equal((await handle(post('/subscribe', { email: 'fan9@example.com', consent: true }), env(), deps)).status, 429);
});

test('other sites cannot call the worker from a browser', async () => {
  const res = await handle(post('/checkout', { zone: 'US', cart: [] }, { Origin: 'https://evil.example' }), env(), deps);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('stock edits keep the file layout, even with similar sizes elsewhere', () => {
  const text = fixtureText().products;
  const next = setStockInText(text, 'logo-sticker', 'One size', 7);
  const data = JSON.parse(next);
  assert.equal(data.products.find(p => p.id === 'logo-sticker').variants[0].stock, 7);
  assert.equal(data.products.find(p => p.id === 'death-metal-sticker').variants[0].stock, 20);
  assert.equal(next.split('\n').length, text.split('\n').length);
});

test('order emails keep buyer text out of the headers', () => {
  const raw = buildRawEmail({ from: 'orders@lvnary.com', to: 'band@example.com', subject: 'Hi\r\nBcc: x@evil.example', text: 'Line', replyTo: 'a@b.co\r\nBcc: x@evil.example' });
  const head = raw.split('\r\n\r\n')[0];
  assert.doesNotMatch(head, /^Bcc:/m);
  assert.doesNotMatch(head, /Reply-To/);
});
