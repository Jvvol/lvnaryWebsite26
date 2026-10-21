// ── LVNARY store core ──
// Prices, shipping, and stock checks shared by the merch page and the checkout worker,
// so the total a fan sees is the total they're charged. All money is integer cents.

export const ZONES = ['US', 'CA', 'WORLD'];

const cents = dollars => Math.round(Number(dollars) * 100);
// Guards against float noise such as 2059.0000000001 rounding up a whole cent.
const ceilTo = (value, step) => Math.ceil(value / step - 1e-9) * step;

function feePercent(settings, zone) {
  const intl = zone === 'US' ? 0 : Number(settings.international_card_percent || 0);
  return (Number(settings.card_fee.percent) + intl) / 100;
}

// What a fan pays for one unit: take-home grossed up for the domestic card fee, rounded up.
export function listedUnitCents(product, variant, settings) {
  const net = cents(product.take_home_price) + cents(variant.extra || 0);
  const step = Math.max(1, cents(settings.round_prices_up_to || 0.01));
  return ceilTo(net / (1 - feePercent(settings, 'US')), step);
}

export function findVariant(products, id, size) {
  const product = products.find(p => p.id === id);
  const variant = product && product.variants.find(v => v.size === size);
  return { product, variant };
}

export function isAvailable(product, variant) {
  return product.status === 'active' && Number(variant.stock) > 0;
}

// cart: [{ id, size, qty }]. Returns the priced order plus any problems that block checkout.
export function quote({ cart: rawCart, products, settings, zone }) {
  const problems = [];
  const lines = [];

  // The same size added twice counts as one line, so stock checks see the full quantity.
  const merged = new Map();
  for (const item of Array.isArray(rawCart) ? rawCart : []) {
    const key = `${item.id}\u0000${item.size}`;
    const prev = merged.get(key);
    merged.set(key, { id: String(item.id), size: String(item.size), qty: (prev ? prev.qty : 0) + Number(item.qty) });
  }
  const cart = [...merged.values()];

  if (!ZONES.includes(zone)) problems.push({ message: 'Choose where to ship your order.' });
  if (!cart.length) problems.push({ message: 'Your bag is empty.' });

  for (const item of cart) {
    const qty = Math.floor(Number(item.qty));
    const { product, variant } = findVariant(products, item.id, item.size);
    if (!product || !variant || product.status === 'hidden') {
      problems.push({ id: item.id, size: item.size, message: 'This item is no longer available. Remove it to continue.' });
      continue;
    }
    const label = product.variants.length > 1 ? `${product.name}, size ${variant.size}` : product.name;
    if (!(qty >= 1) || qty > Number(settings.max_per_item || 10)) {
      problems.push({ id: item.id, size: item.size, message: `Choose between 1 and ${settings.max_per_item || 10} of ${label}.` });
      continue;
    }
    if (!isAvailable(product, variant)) {
      problems.push({ id: item.id, size: item.size, message: `${label} just sold out. Remove it to continue.` });
      continue;
    }
    if (qty > Number(variant.stock)) {
      problems.push({ id: item.id, size: item.size, message: `Only ${variant.stock} left of ${label}. Lower the quantity to continue.` });
      continue;
    }
    const unitCents = listedUnitCents(product, variant, settings);
    lines.push({
      id: product.id,
      size: variant.size,
      name: product.name,
      label,
      qty,
      unitCents,
      lineCents: unitCents * qty,
      netCents: (cents(product.take_home_price) + cents(variant.extra || 0)) * qty,
      shipsAs: product.ships_as === 'letter' ? 'letter' : 'parcel',
    });
  }

  const itemsCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const shipsAs = lines.length && lines.every(l => l.shipsAs === 'letter') ? 'letter' : 'parcel';
  let shippingCents = 0;
  let freeShipping = false;

  if (lines.length && ZONES.includes(zone)) {
    const free = settings.free_shipping || {};
    freeShipping = Boolean(free.enabled) && (free.zones || []).includes(zone) && itemsCents >= cents(free.minimum_order);
    if (!freeShipping) {
      const rate = settings.shipping[zone][shipsAs];
      // Stickers ride along free in a parcel; letters count every item.
      const count = lines.filter(l => shipsAs === 'letter' || l.shipsAs === 'parcel').reduce((n, l) => n + l.qty, 0);
      const postage = cents(rate.first) + Math.max(0, count - 1) * cents(rate.each_additional);
      const pct = feePercent(settings, zone);
      // Shipping also carries the card's fixed fee, so the band nets item prices + postage exactly.
      shippingCents = ceilTo((postage + cents(settings.card_fee.fixed)) / (1 - pct), 1);
      // Cards from outside the US cost more to take; cover the difference on the items too.
      const netItems = lines.reduce((sum, l) => sum + l.netCents, 0);
      shippingCents += Math.max(0, ceilTo(netItems / (1 - pct), 1) - itemsCents);
    }
  }

  return { lines, itemsCents, shippingCents, totalCents: itemsCents + shippingCents, shipsAs, freeShipping, problems };
}

export function formatMoney(c) {
  return `$${(c / 100).toFixed(2)}`;
}

// Plain-language checks for the two store files. Returns a list of problems; empty means OK.
export function checkStoreFiles(productsFile, settings) {
  const errs = [];
  const num = (v, where) => { if (typeof v !== 'number' || !(v >= 0)) errs.push(`${where} must be a number like 20 or 2.5 (no $ sign, no quotes).`); };

  const products = productsFile && productsFile.products;
  if (!Array.isArray(products)) return ['products.json needs a "products" list.'];
  const ids = new Set();
  products.forEach((p, i) => {
    const where = `Product ${i + 1}${p && p.name ? ` (${p.name})` : ''}`;
    if (!p || typeof p !== 'object') { errs.push(`${where} is not written correctly.`); return; }
    if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id)) errs.push(`${where}: id must be lowercase letters, numbers, and dashes.`);
    else if (ids.has(p.id)) errs.push(`${where}: id "${p.id}" is used twice.`);
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) errs.push(`${where}: add a name.`);
    num(p.take_home_price, `${where}: take_home_price`);
    if (!['active', 'sold_out', 'hidden'].includes(p.status)) errs.push(`${where}: status must be "active", "sold_out", or "hidden".`);
    if (!['letter', 'parcel'].includes(p.ships_as)) errs.push(`${where}: ships_as must be "letter" or "parcel".`);
    if (!Array.isArray(p.photos) || !p.photos.length) errs.push(`${where}: add at least one photo.`);
    else p.photos.forEach((ph, j) => {
      if (!ph || typeof ph.src !== 'string') errs.push(`${where}: photo ${j + 1} needs a src.`);
      if (!ph || typeof ph.alt !== 'string' || !ph.alt.trim()) errs.push(`${where}: photo ${j + 1} needs alt text describing it.`);
    });
    if (!Array.isArray(p.variants) || !p.variants.length) errs.push(`${where}: add at least one size (use "One size" for stickers).`);
    else {
      const sizes = new Set();
      p.variants.forEach((v, j) => {
        const vw = `${where}, size ${v && v.size ? v.size : j + 1}`;
        if (!v || typeof v.size !== 'string' || !v.size.trim()) errs.push(`${where}: size ${j + 1} needs a name.`);
        else if (sizes.has(v.size)) errs.push(`${where}: size "${v.size}" is listed twice.`);
        if (v) sizes.add(v.size);
        if (!v || !Number.isInteger(v.stock) || v.stock < 0) errs.push(`${vw}: stock must be a whole number, 0 or more.`);
        if (v && v.extra !== undefined) num(v.extra, `${vw}: extra`);
      });
    }
  });

  if (!settings || typeof settings !== 'object') return [...errs, 'settings.json is not written correctly.'];
  if (!settings.card_fee) errs.push('settings.json: card_fee is missing.');
  else {
    num(settings.card_fee.percent, 'card_fee percent');
    num(settings.card_fee.fixed, 'card_fee fixed');
    if (settings.card_fee.percent >= 50) errs.push('card_fee percent looks too high.');
  }
  num(settings.international_card_percent, 'international_card_percent');
  num(settings.round_prices_up_to, 'round_prices_up_to');
  if (!Number.isInteger(settings.max_per_item) || settings.max_per_item < 1) errs.push('max_per_item must be a whole number, 1 or more.');
  for (const zone of ZONES) {
    const z = settings.shipping && settings.shipping[zone];
    if (!z) { errs.push(`shipping is missing ${zone}.`); continue; }
    for (const kind of ['letter', 'parcel']) {
      if (!z[kind]) { errs.push(`shipping ${zone} is missing ${kind}.`); continue; }
      num(z[kind].first, `shipping ${zone} ${kind} first`);
      num(z[kind].each_additional, `shipping ${zone} ${kind} each_additional`);
    }
  }
  const free = settings.free_shipping;
  if (!free || typeof free.enabled !== 'boolean') errs.push('free_shipping enabled must be true or false (no quotes).');
  else {
    num(free.minimum_order, 'free_shipping minimum_order');
    if (!Array.isArray(free.zones) || free.zones.some(z => !ZONES.includes(z))) errs.push('free_shipping zones can only list "US", "CA", and "WORLD".');
  }
  if (!settings.pay_apps || ['venmo', 'cash_app', 'zelle'].some(k => typeof settings.pay_apps[k] !== 'string')) {
    errs.push('pay_apps needs venmo, cash_app, and zelle (use "" to hide one).');
  }
  if (typeof settings.checkout_api !== 'string') errs.push('checkout_api must be in quotes (use "" to turn checkout off).');
  return errs;
}
