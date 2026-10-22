// ── LVNARY merch store ──
// Renders products from /merch/products.json, keeps the bag in this browser, and hands
// checkout to the store worker, which re-checks every price and stock count.

import { quote, listedUnitCents, isAvailable, formatMoney, checkStoreFiles, findVariant } from './store-core.js';

const BAG_KEY = 'lvnary-bag';
const LOW_STOCK = 3;
const APP_NAMES = { venmo: 'Venmo', cash_app: 'Cash App', zelle: 'Zelle' };

const $ = id => document.getElementById(id);
let products = [];
let settings = null;
let bag = { items: [], zone: '' };

// ── BAG STORAGE ── (a per-browser convenience; the page works without it)
function loadBag() {
  try {
    const saved = JSON.parse(localStorage.getItem(BAG_KEY));
    if (saved && Array.isArray(saved.items)) bag = { items: saved.items, zone: saved.zone || '' };
  } catch { /* storage blocked: start empty */ }
}
function saveBag() {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* storage blocked */ }
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

function checkoutReady() {
  return Boolean(settings && settings.checkout_api);
}
function payApps() {
  return Object.keys(APP_NAMES).filter(k => settings.pay_apps[k]);
}
function listAnd(words) {
  return words.length < 3 ? words.join(' or ') : `${words.slice(0, -1).join(', ')}, or ${words.at(-1)}`;
}

// ── PRODUCTS ──
// Big titles shouldn't break "T-Shirt" into "T-" and "Shirt", so hyphenated words stay whole.
function nameWithoutHyphenBreaks(name) {
  return name.split(/(\S*-\S*)/).filter(Boolean).map(part => part.includes('-') && !/\s/.test(part) ? el('span', { class: 'nowrap', text: part }) : part);
}

function renderProduct(product, index) {
  const soldOut = product.status === 'sold_out' || product.variants.every(v => !isAvailable(product, v));
  const prices = product.variants.map(v => listedUnitCents(product, v, settings));
  const low = Math.min(...prices);
  const priceText = prices.some(p => p !== low) ? `From ${formatMoney(low)}` : formatMoney(low);
  const single = product.variants.length === 1;
  const nameId = `p-${product.id}-name`;
  const statusId = `p-${product.id}-status`;
  const photo = product.photos[0];

  const status = el('p', { class: 'product-status', id: statusId, role: 'status', 'aria-live': 'polite' });
  const qty = el('input', { type: 'number', id: `p-${product.id}-qty`, name: 'qty', min: 1, max: settings.max_per_item, value: 1, inputmode: 'numeric', required: true });
  const stockNote = el('p', { class: 'product-stock', id: `p-${product.id}-stock` });

  const sizes = single ? null : el('fieldset', { class: 'sizes' },
    el('legend', { text: 'Size' }),
    el('div', { class: 'size-options' }, product.variants.map((v, i) => {
      const out = !isAvailable(product, v);
      const extra = listedUnitCents(product, v, settings) !== low ? ` +${formatMoney(listedUnitCents(product, v, settings) - low)}` : '';
      const id = `p-${product.id}-size-${i}`;
      return el('div', { class: 'size' },
        // Flex labels make screen readers insert stray spaces, so the radio carries the full name.
        el('input', { type: 'radio', name: 'size', id, value: v.size, disabled: out, 'aria-label': `${v.size}${extra}${out ? ', sold out' : ''}` }),
        el('label', { for: id }, v.size, extra ? el('span', { class: 'size-extra', text: extra }) : null),
      );
    })),
  );

  const updateStockNote = form => {
    const size = single ? product.variants[0].size : (form.elements.size && form.elements.size.value) || '';
    const { variant } = findVariant(products, product.id, size);
    stockNote.textContent = variant && isAvailable(product, variant) && variant.stock <= LOW_STOCK ? `Only ${variant.stock} left${single ? '' : ` in ${variant.size}`}.` : '';
    if (variant) qty.max = Math.min(settings.max_per_item, Math.max(1, variant.stock));
  };

  const form = el('form', { class: 'product-buy', novalidate: true, 'aria-labelledby': nameId }, sizes,
    el('div', { class: 'product-actions' },
      el('div', { class: 'qty' }, el('label', { for: qty.id, text: 'Quantity' }), qty),
      el('button', { type: 'submit', class: 'btn btn-primary', 'aria-describedby': statusId, text: 'Add to bag' }),
    ),
    stockNote,
    status,
  );
  form.addEventListener('change', () => updateStockNote(form));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const size = single ? product.variants[0].size : form.elements.size.value;
    const n = Math.floor(Number(qty.value));
    if (!size) { status.textContent = 'Choose a size first.'; status.dataset.tone = 'error'; form.querySelector('input[name="size"]:not(:disabled)').focus(); return; }
    const { variant } = findVariant(products, product.id, size);
    const inBag = bag.items.filter(i => i.id === product.id && i.size === size).reduce((s, i) => s + i.qty, 0);
    const room = Math.min(variant.stock, settings.max_per_item) - inBag;
    if (!(n >= 1)) { status.textContent = 'Enter a quantity of 1 or more.'; status.dataset.tone = 'error'; qty.focus(); return; }
    if (room <= 0) { status.textContent = `You already have all ${inBag} we have${single ? '' : ` in ${size}`} in your bag.`; status.dataset.tone = 'error'; return; }
    const add = Math.min(n, room);
    const existing = bag.items.find(i => i.id === product.id && i.size === size);
    if (existing) existing.qty += add; else bag.items.push({ id: product.id, size, qty: add });
    saveBag();
    renderBag();
    status.dataset.tone = 'success';
    status.textContent = add < n ? `Added ${add}, all we have left. ` : 'Added to your bag. ';
    status.append(el('a', { href: '#bag', text: 'View bag' }));
  });

  if (single) updateStockNote(form);

  return el('article', { class: `product${soldOut ? ' is-sold-out' : ''}`, 'aria-labelledby': nameId },
    el('img', { class: 'product-photo', src: photo.src, width: photo.width, height: photo.height, alt: photo.alt, loading: index === 0 ? 'eager' : 'lazy', decoding: 'async' }),
    el('div', { class: 'product-info' },
      el('h2', { class: 'product-name', id: nameId }, nameWithoutHyphenBreaks(product.name)),
      el('p', { class: 'product-price', text: soldOut ? `${priceText}, sold out` : priceText }),
      product.description ? el('p', { class: 'product-desc', text: product.description }) : null,
      soldOut ? el('p', { class: 'product-soldout', text: 'Sold out for now. Follow us on Instagram to hear when it’s back.' }) : form,
      product.photos.length > 1 ? el('ul', { class: 'product-more' }, product.photos.slice(1).map(ph =>
        el('li', {}, el('img', { src: ph.src, width: ph.width, height: ph.height, alt: ph.alt, loading: 'lazy', decoding: 'async' })))) : null,
    ),
  );
}

// ── BAG ──
function currentQuote() {
  return quote({ cart: bag.items, products, settings, zone: bag.zone || 'US' });
}

function renderBag() {
  const section = $('bag');
  section.hidden = false;
  const lines = $('bagLines');
  const empty = bag.items.length === 0;
  $('bagEmpty').hidden = !empty;
  $('bagCheckout').hidden = empty;
  if (empty) {
    // The order form sits outside the checkout block, so close it with the bag.
    $('appOrder').hidden = true;
    $('payApp').setAttribute('aria-expanded', 'false');
  }
  lines.replaceChildren();

  const q = currentQuote();
  const priced = new Map(q.lines.map(l => [`${l.id}\u0000${l.size}`, l]));

  bag.items.forEach((item, index) => {
    const key = `${item.id}\u0000${item.size}`;
    const { product, variant } = findVariant(products, item.id, item.size);
    const line = priced.get(key);
    const problem = q.problems.find(p => p.id === item.id && p.size === item.size);
    const label = product ? (product.variants.length > 1 ? `${product.name}, size ${item.size}` : product.name) : 'Item no longer available';
    const qtyId = `bag-qty-${index}`;
    const max = variant ? Math.max(item.qty, Math.min(settings.max_per_item, variant.stock)) : item.qty;

    const select = el('select', { id: qtyId, 'aria-describedby': problem ? `bag-problem-${index}` : null },
      Array.from({ length: Math.max(1, max) }, (_, i) => el('option', { value: i + 1, text: i + 1, selected: i + 1 === item.qty })));
    select.addEventListener('change', () => { item.qty = Number(select.value); saveBag(); renderBag(); $(qtyId).focus(); });

    lines.append(el('li', { class: `bag-line${problem ? ' has-problem' : ''}` },
      product ? el('img', { src: product.photos[0].src, alt: '', width: 56, height: 56, loading: 'lazy' }) : el('span', { class: 'bag-thumb' }),
      el('div', { class: 'bag-line-info' },
        el('p', { class: 'bag-line-name', text: label }),
        el('div', { class: 'bag-line-controls' },
          el('label', { for: qtyId, class: 'visually-hidden', text: `Quantity of ${label}` }), select,
          el('button', { type: 'button', class: 'link-button', text: 'Remove', 'aria-label': `Remove ${label}`, onclick: () => {
            bag.items.splice(index, 1); saveBag(); renderBag();
            const next = lines.querySelector('select') || $('bag-title').closest('section');
            next.focus();
          } }),
        ),
        problem ? el('p', { class: 'field-error', id: `bag-problem-${index}`, text: problem.message }) : null,
      ),
      el('p', { class: 'bag-line-price', text: line ? formatMoney(line.lineCents) : '' }),
    ));
  });

  $('ship-zone').value = bag.zone;
  $('itemsTotal').textContent = formatMoney(q.itemsCents);
  if (bag.zone) {
    $('shippingTotal').textContent = q.freeShipping ? 'Free' : formatMoney(q.shippingCents);
    $('grandTotal').textContent = formatMoney(q.totalCents);
  } else {
    $('shippingTotal').textContent = 'Choose where to ship';
    $('grandTotal').textContent = formatMoney(q.itemsCents);
  }
  updateBagBar();
  updateZoneFields();
}

// The bag sits below every product, so a bar jumps to it, except while the bag is already on screen.
function watchBag() {
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => $('bagBar').classList.toggle('is-near', entry.isIntersecting), { rootMargin: '0px 0px -25% 0px' })
    .observe($('bag'));
}

function updateBagBar() {
  const bar = $('bagBar');
  const count = bag.items.reduce((n, i) => n + i.qty, 0);
  bar.hidden = count === 0;
  const q = currentQuote();
  bar.textContent = `View bag: ${count} ${count === 1 ? 'item' : 'items'}, ${formatMoney(q.itemsCents)}`;
}

function setFieldError(input, message) {
  const err = $(`${input.id}-error`);
  if (!err) return;
  err.textContent = message || '';
  err.hidden = !message;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', err.id);
  } else {
    input.removeAttribute('aria-invalid');
  }
}

function setStatus(message, tone) {
  const s = $('bagStatus');
  s.textContent = message;
  if (tone) s.dataset.tone = tone; else delete s.dataset.tone;
}

function requireZone() {
  if (bag.zone) return true;
  setFieldError($('ship-zone'), 'Choose where to ship your order.');
  $('ship-zone').focus();
  return false;
}

// Sends the bag to the worker. Returns the parsed reply, or null after showing an error.
async function callWorker(path, body, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = path === '/checkout' ? 'Opening checkout…' : 'Placing order…';
  setStatus('');
  try {
    const res = await fetch(`${settings.checkout_api.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (data.problems) {
      // Stock changed since the page loaded: reload it so the bag shows what's really left.
      await loadStore();
      renderBag();
      setStatus(data.problems.length === 1 ? data.problems[0].message : 'Some items in your bag changed. Check the notes in your bag, then try again.', 'error');
      return null;
    }
    if (data.fieldErrors) return data;
    setStatus(data.error || 'Checkout is having trouble right now. Try again in a few minutes.', 'error');
    return null;
  } catch {
    setStatus("We couldn't reach checkout. Check your connection and try again.", 'error');
    return null;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function payByCard() {
  if (!requireZone()) return;
  const data = await callWorker('/checkout', { cart: bag.items, zone: bag.zone }, $('payCard'));
  if (data && data.url) window.location.assign(data.url);
}

// ── VENMO / CASH APP / ZELLE ORDER ──
function updateZoneFields() {
  const zone = bag.zone;
  $('country-field').hidden = zone !== 'WORLD';
  $('order-state-label').textContent = zone === 'CA' ? 'Province or territory' : zone === 'US' ? 'State' : 'State, province, or region (optional)';
  $('order-postal-label').textContent = zone === 'US' ? 'ZIP code' : zone === 'CA' ? 'Postal code' : 'Postal code (optional)';
}

function initAppOrder() {
  const apps = payApps();
  const toggle = $('payApp');
  const form = $('appOrder');
  if (!apps.length) return;
  toggle.hidden = false;
  toggle.textContent = `Pay with ${listAnd(apps.map(a => APP_NAMES[a]))}`;
  $('appChoices').replaceChildren(...apps.map(a => el('div', { class: 'choice' },
    el('input', { type: 'radio', name: 'app', id: `app-${a}`, value: a, required: true, checked: apps.length === 1 }),
    el('label', { for: `app-${a}`, text: APP_NAMES[a] }))));

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    form.hidden = !open;
    if (open) form.querySelector('input:not([type="hidden"])').focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireZone()) return;
    const f = form.elements;
    const fields = ['order-name', 'order-email', 'order-line1', 'order-line2', 'order-city', 'order-state', 'order-postal_code', 'order-country'].map(id => $(id));
    fields.forEach(i => setFieldError(i, ''));
    setAppError('');

    // Quick checks here; the worker checks again and has the final say.
    const local = {};
    if (!f.app.value) local.app = 'Choose how you’ll pay.';
    if (!f.name.value.trim()) local.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) local.email = f.email.value.trim() ? 'Enter an email address like name@example.com.' : 'Enter your email address.';
    if (!f.line1.value.trim()) local.line1 = 'Enter your street address.';
    if (!f.city.value.trim()) local.city = 'Enter your city or town.';
    if (bag.zone !== 'WORLD' && !f.state.value.trim()) local.state = bag.zone === 'US' ? 'Enter your state.' : 'Enter your province or territory.';
    if (bag.zone !== 'WORLD' && !f.postal_code.value.trim()) local.postal_code = bag.zone === 'US' ? 'Enter your ZIP code.' : 'Enter your postal code.';
    if (bag.zone === 'WORLD' && !f.country.value.trim()) local.country = 'Enter your country.';
    if (showFieldErrors(local)) return;

    const data = await callWorker('/order', {
      cart: bag.items, zone: bag.zone, app: f.app.value, name: f.name.value, email: f.email.value, website: f.website.value,
      address: { line1: f.line1.value, line2: f.line2.value, city: f.city.value, state: f.state.value, postal_code: f.postal_code.value, country: f.country.value },
    }, form.querySelector('button[type="submit"]'));
    if (!data) return;
    if (data.fieldErrors) { showFieldErrors(data.fieldErrors); return; }
    showPlaced(data);
  });
}

function setAppError(message) {
  const err = $('app-error');
  err.textContent = message;
  err.hidden = !message;
  $('app-field').toggleAttribute('aria-invalid', Boolean(message));
  if (message) $('app-field').setAttribute('aria-describedby', 'app-error');
}

function showFieldErrors(errors) {
  const keys = Object.keys(errors);
  if (!keys.length) return false;
  let first = null;
  for (const key of keys) {
    if (key === 'app') { setAppError(errors.app); first = first || $('appChoices').querySelector('input'); continue; }
    const input = $(`order-${key}`);
    if (!input) continue;
    setFieldError(input, errors[key]);
    first = first || input;
  }
  if (first) first.focus();
  return true;
}

function showPlaced({ order, totalCents, appName, handle }) {
  bag.items = [];
  saveBag();
  renderBag();
  $('bagEmpty').hidden = true;
  const placed = $('placed');
  placed.replaceChildren(
    el('h3', { class: 'placed-title', text: `Order ${order} is in` }),
    el('p', {}, `Send `, el('strong', { text: formatMoney(totalCents) }), ` on ${appName} to `, el('strong', { class: 'placed-handle', text: handle }), '.'),
    el('p', {}, 'Put ', el('strong', { text: order }), ' in the payment note so we can match it to your order.'),
    el('p', { text: 'We ship once the payment arrives and email you if anything changes. Unpaid orders are cancelled after 3 days.' }),
    el('p', { class: 'bag-fine', text: 'Take a screenshot of this page to keep your order number.' }),
  );
  placed.hidden = false;
  placed.focus();
}

// ── LOAD ──
async function loadStore() {
  const [p, s] = await Promise.all([
    fetch('/merch/products.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('/merch/settings.json', { cache: 'no-cache' }).then(r => r.json()),
  ]);
  const errors = checkStoreFiles(p, s);
  if (errors.length) throw new Error(errors.join('\n'));
  products = p.products.filter(x => x.status !== 'hidden');
  settings = s;
}

function showNotice(text) {
  const n = $('shopNotice');
  n.textContent = text;
  n.hidden = false;
}

async function init() {
  const list = $('products');
  try {
    await loadStore();
  } catch (err) {
    console.error(err);
    list.removeAttribute('aria-busy');
    showNotice('The store is being updated. Check back in a few minutes, or message us on Instagram to order.');
    return;
  }
  loadBag();
  // Drop anything from an old visit that no longer exists, so it can't block checkout.
  bag.items = bag.items.filter(i => products.some(p => p.id === i.id && p.variants.some(v => v.size === i.size)) && Number(i.qty) >= 1);
  if (!['', 'US', 'CA', 'WORLD'].includes(bag.zone)) bag.zone = '';

  list.replaceChildren(...products.map(renderProduct));
  list.removeAttribute('aria-busy');
  if (!products.length) showNotice('Nothing is for sale right now. Follow us on Instagram to hear about the next drop.');

  if (!checkoutReady()) {
    showNotice('Online checkout opens soon. Until then, catch us at a show or message us on Instagram to order.');
    list.querySelectorAll('.product-buy button[type="submit"]').forEach(b => { b.disabled = true; });
    return;
  }

  $('ship-zone').addEventListener('change', e => {
    bag.zone = e.target.value;
    setFieldError(e.target, '');
    saveBag();
    renderBag();
  });
  $('payCard').addEventListener('click', payByCard);
  initAppOrder();
  renderBag();
  watchBag();
}

init();
