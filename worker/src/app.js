// ── LVNARY checkout worker ──
// POST /checkout        bag → Stripe Checkout page (card, Apple Pay, Google Pay)
// POST /order           bag + address → Venmo / Cash App / Zelle order, emailed to the band
// POST /stripe-webhook  Stripe says "paid" → lower stock, email the band
// POST /subscribe       mailing list signup → saved in KV (export with npm run subscribers)
// Prices and stock always come from products.json on GitHub, never from the browser.

import { quote, checkStoreFiles, formatMoney, ZONES } from '../../js/store-core.js';
import { loadStore, decrementStock, forgetStore } from './github.js';
import { stripeRequest, verifyWebhook } from './stripe.js';
import { ZONE_COUNTRIES } from './countries.js';

const APP_NAMES = { venmo: 'Venmo', cash_app: 'Cash App', zelle: 'Zelle' };
const P2P_ORDERS_PER_HOUR = 5;
// Saved with each signup, so the list records exactly what each person agreed to.
export const SIGNUP_CONSENT = "I'm 16 or older and agree to receive emails from LVNARY about music, shows, and merch. Unsubscribe anytime.";
const DAY = 86400;

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

export function orderNumber() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `LV-${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}`;
}

// Cloudflare's rate limiter (wrangler.toml [[ratelimits]]) counts in memory, so floods
// don't spend the KV free tier's 1,000 daily writes. No binding (local dev) means no limit.
async function overLimit(env, binding, request) {
  const limiter = env[binding];
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  return !success;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function cleanCart(cart) {
  if (!Array.isArray(cart) || cart.length > 50) return [];
  return cart.map(i => ({ id: String(i && i.id || ''), size: String(i && i.size || ''), qty: Number(i && i.qty) }));
}

async function loadCheckedStore(env) {
  // Quotes may use a few-seconds-old copy; stock changes always re-read GitHub fresh.
  const { productsFile, settings } = await loadStore(env, { maxAgeSeconds: Number(env.STORE_CACHE_SECONDS) || 0 });
  const errors = checkStoreFiles(productsFile, settings);
  if (errors.length) forgetStore(); // don't keep serving a broken copy once the band fixes it
  return { products: productsFile.products, settings, ok: errors.length === 0 };
}

const STORE_BUSY = { error: 'The store is being updated. Try again in a few minutes.' };

function itemLines(lines) {
  return lines.map(l => `${l.qty} × ${l.label}: ${formatMoney(l.lineCents)}`).join('\n');
}

function addressBlock(name, a) {
  return [name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n');
}

// ── Card checkout ──
async function createCheckout(request, env, cors) {
  if (await overLimit(env, 'CHECKOUT_LIMITER', request)) return json({ error: 'Too many checkout attempts from this connection. Wait a minute and try again.' }, 429, cors);
  const body = await readJson(request);
  if (!body) return json({ error: 'Something went wrong sending your bag. Reload the page and try again.' }, 400, cors);
  const zone = String(body.zone || '');
  const cart = cleanCart(body.cart);

  const store = await loadCheckedStore(env);
  if (!store.ok) return json(STORE_BUSY, 503, cors);
  const q = quote({ cart, products: store.products, settings: store.settings, zone });
  if (q.problems.length) return json({ problems: q.problems }, 409, cors);

  const order = orderNumber();
  const site = env.SITE_ORIGIN;
  const metadata = { order, zone };
  q.lines.forEach((l, i) => { metadata[`item_${i}`] = JSON.stringify({ id: l.id, size: l.size, qty: l.qty, label: l.label, lineCents: l.lineCents }); });

  const session = await stripeRequest(env, 'checkout/sessions', {
    mode: 'payment',
    client_reference_id: order,
    success_url: `${site}/merch/thanks/?order=${order}`,
    cancel_url: `${site}/merch/#bag`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: q.lines.map(l => ({
      quantity: l.qty,
      price_data: { currency: 'usd', unit_amount: l.unitCents, product_data: { name: l.label } },
    })),
    shipping_address_collection: { allowed_countries: ZONE_COUNTRIES[zone] },
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: q.freeShipping ? `Free shipping to ${store.settings.shipping[zone].label}` : `Shipping to ${store.settings.shipping[zone].label}`,
        fixed_amount: { amount: q.shippingCents, currency: 'usd' },
      },
    }],
    metadata,
    payment_intent_data: { metadata: { order }, description: `LVNARY merch order ${order}` },
  });
  return json({ url: session.url }, 200, cors);
}

// ── Venmo / Cash App / Zelle order ──
function validateOrderForm(body, zone, settings) {
  const errors = {};
  const s = v => (typeof v === 'string' ? v.trim() : '');
  const name = s(body.name);
  const email = s(body.email);
  const a = body.address || {};
  const address = {
    line1: s(a.line1), line2: s(a.line2), city: s(a.city), state: s(a.state), postal_code: s(a.postal_code),
    country: zone === 'US' ? 'United States' : zone === 'CA' ? 'Canada' : s(a.country),
  };
  if (!name || name.length > 100) errors.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.email = 'Enter an email address like name@example.com.';
  if (!address.line1 || address.line1.length > 200) errors.line1 = 'Enter your street address.';
  if (address.line2.length > 200) errors.line2 = 'Shorten this line to 200 characters or fewer.';
  if (!address.city || address.city.length > 100) errors.city = 'Enter your city or town.';
  if (zone !== 'WORLD' && (!address.state || address.state.length > 100)) errors.state = zone === 'US' ? 'Enter your state.' : 'Enter your province or territory.';
  if (zone !== 'WORLD' && (!address.postal_code || address.postal_code.length > 20)) errors.postal_code = zone === 'US' ? 'Enter your ZIP code.' : 'Enter your postal code.';
  if (zone === 'WORLD' && (!address.country || address.country.length > 60)) errors.country = 'Enter your country.';
  const app = s(body.app);
  if (!APP_NAMES[app] || !s(settings.pay_apps[app])) errors.app = 'Choose how you’ll pay.';
  return { errors, name, email, address, app };
}

async function createP2POrder(request, env, cors, deps) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Something went wrong sending your order. Reload the page and try again.' }, 400, cors);
  // Bots fill every field; people never see this one.
  if (body.website) return json({ error: 'Something went wrong sending your order. Reload the page and try again.' }, 400, cors);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const count = Number(await env.STORE_KV.get(rlKey)) || 0;
  if (count >= P2P_ORDERS_PER_HOUR) return json({ error: 'Too many orders from this connection. Try again in an hour, or message us on Instagram.' }, 429, cors);

  const zone = String(body.zone || '');
  const cart = cleanCart(body.cart);
  const store = await loadCheckedStore(env);
  if (!store.ok) return json(STORE_BUSY, 503, cors);

  const form = validateOrderForm(body, zone, store.settings);
  if (Object.keys(form.errors).length) return json({ fieldErrors: form.errors }, 422, cors);
  const q = quote({ cart, products: store.products, settings: store.settings, zone });
  if (q.problems.length) return json({ problems: q.problems }, 409, cors);

  await env.STORE_KV.put(rlKey, String(count + 1), { expirationTtl: 3600 });
  const order = orderNumber();
  // Hold the items now so nobody else buys them while we wait for the payment.
  const short = await decrementStock(env, q.lines.map(l => ({ id: l.id, size: l.size, qty: l.qty })), `Hold stock for ${APP_NAMES[form.app]} order ${order}`);

  const handle = store.settings.pay_apps[form.app];
  const total = formatMoney(q.totalCents);
  await deps.sendEmail({
    subject: `New ${APP_NAMES[form.app]} order ${order}: ${total}, NOT PAID YET`,
    text: [
      `LVNARY merch order ${order}`,
      `Paying with ${APP_NAMES[form.app]} (${handle}). NOT PAID YET.`,
      `Ship only after a ${APP_NAMES[form.app]} payment of ${total} arrives with "${order}" in the note.`,
      `If it hasn't arrived in 3 days, email the buyer. If you cancel, add the items back to the stock in products.json.`,
      short.length ? `\n!! OVERSOLD: ${short.map(s => `${s.id} ${s.size} (wanted ${s.qty}, had ${s.had})`).join('; ')}. Email the buyer before taking payment.` : '',
      '',
      'Ship to:',
      addressBlock(form.name, form.address),
      `Email: ${form.email}`,
      '',
      'Items:',
      itemLines(q.lines),
      `${q.freeShipping ? 'Free shipping' : 'Shipping'} (${store.settings.shipping[zone].label}, ${q.shipsAs}): ${formatMoney(q.shippingCents)}`,
      `Total due: ${total}`,
      '',
      'Stock in products.json has already been lowered to hold these items.',
    ].join('\n'),
    replyTo: form.email,
  });

  return json({ order, totalCents: q.totalCents, app: form.app, appName: APP_NAMES[form.app], handle }, 200, cors);
}

// ── Mailing list signup ──
// Each address is one KV key, "sub:<email>". The details ride in the key's metadata, so
// one key listing returns the whole list. Signing up twice keeps the first date.
async function subscribe(request, env, cors) {
  const body = await readJson(request);
  const retry = { error: 'Something went wrong on our end. Try again in a minute.' };
  if (!body || body.website) return json(retry, 400, cors);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) fieldErrors.email = 'Enter an email address like name@example.com.';
  if (body.consent !== true) fieldErrors.consent = "Check the box to confirm you're 16 or older and want our emails.";
  if (Object.keys(fieldErrors).length) return json({ fieldErrors }, 422, cors);

  if (await overLimit(env, 'SIGNUP_LIMITER', request)) return json({ error: 'Too many signups from this connection. Wait a minute and try again.' }, 429, cors);

  // Already on the list with today's wording: answer the same way, without spending a KV write.
  // If the consent wording has changed since, record what they agreed to now (keeping the first date).
  const key = `sub:${email}`;
  const { value, metadata } = await env.STORE_KV.getWithMetadata(key);
  if (value === null || !metadata || metadata.consent !== SIGNUP_CONSENT) {
    const signedUp = (metadata && metadata.signed_up) || new Date().toISOString();
    await env.STORE_KV.put(key, '', { metadata: { email, signed_up: signedUp, consent: SIGNUP_CONSENT } });
  }
  return json({ ok: true }, 200, cors);
}

// ── Stripe webhook ──
async function handleWebhook(request, env, deps) {
  const payload = await request.text();
  const event = await verifyWebhook(env, payload, request.headers.get('Stripe-Signature'));
  if (!event) return new Response('Bad signature', { status: 400 });
  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  const session = event.data && event.data.object;
  if (!handled.includes(event.type) || !session || session.payment_status !== 'paid') return new Response('Ignored', { status: 200 });

  // Stripe can deliver the same event more than once; do each step exactly once.
  const key = `stripe:${session.id}`;
  const state = JSON.parse((await env.STORE_KV.get(key)) || '{}');
  const meta = session.metadata || {};
  const items = Object.keys(meta).filter(k => /^item_\d+$/.test(k)).sort((a, b) => a.slice(5) - b.slice(5)).map(k => JSON.parse(meta[k]));
  const stockItems = items.map(({ id, size, qty }) => ({ id, size, qty }));
  const order = meta.order || session.client_reference_id || session.id;

  if (!state.stock) {
    state.short = await decrementStock(env, stockItems, `Card order ${order}: lower stock`);
    state.stock = true;
    await env.STORE_KV.put(key, JSON.stringify(state), { expirationTtl: 30 * DAY });
  }

  if (!state.email) {
    const ship = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details || {};
    const customer = session.customer_details || {};
    const a = ship.address || {};
    const dashboard = `https://dashboard.stripe.com/${session.livemode ? '' : 'test/'}payments/${session.payment_intent}`;
    const total = formatMoney(session.amount_total);
    const zoneLabel = ZONES.includes(meta.zone) ? meta.zone : '';
    await deps.sendEmail({
      subject: `New card order ${order}: ${total}, paid`,
      text: [
        `LVNARY merch order ${order}`,
        `Paid by card through Stripe${session.livemode ? '' : ' (TEST MODE, no real money)'}. Ready to ship.`,
        state.short && state.short.length ? `\n!! OVERSOLD: ${state.short.map(s => `${s.id} ${s.size} (wanted ${s.qty}, had ${s.had})`).join('; ')}. Email the buyer and refund what you can't send (Stripe → Payments → Refund).` : '',
        '',
        'Ship to:',
        addressBlock(ship.name || customer.name, { line1: a.line1, line2: a.line2, city: a.city, state: a.state, postal_code: a.postal_code, country: a.country }),
        `Email: ${customer.email || 'not given'}`,
        '',
        'Items:',
        itemLines(items),
        `Shipping: ${formatMoney(session.total_details ? session.total_details.amount_shipping : 0)}`,
        `Shipping zone: ${zoneLabel}`,
        `Total paid: ${total}`,
        '',
        `Full details and receipt: ${dashboard}`,
        'Stock in products.json has been lowered automatically.',
      ].join('\n'),
      replyTo: customer.email,
    });
    state.email = true;
    await env.STORE_KV.put(key, JSON.stringify(state), { expirationTtl: 30 * DAY });
  }
  return new Response('OK', { status: 200 });
}

export async function handle(request, env, deps) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'POST' && url.pathname === '/stripe-webhook') return await handleWebhook(request, env, deps);
    if (request.method === 'POST' && url.pathname === '/checkout') return await createCheckout(request, env, cors);
    if (request.method === 'POST' && url.pathname === '/order') return await createP2POrder(request, env, cors, deps);
    if (request.method === 'POST' && url.pathname === '/subscribe') return await subscribe(request, env, cors);
    return json({ error: 'Not found' }, 404, cors);
  } catch (err) {
    console.error(err);
    // Webhooks get a 500 so Stripe retries; shoppers get a plain next step.
    if (url.pathname === '/stripe-webhook') return new Response('Error', { status: 500 });
    if (url.pathname === '/subscribe') return json({ error: 'Something went wrong on our end. Try again in a minute.' }, 502, cors);
    return json({ error: 'Checkout is having trouble right now. Try again in a few minutes, or message us on Instagram.' }, 502, cors);
  }
}
