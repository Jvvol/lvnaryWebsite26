// Reads the store files straight from GitHub (fresher than the published site) and
// writes stock changes back as commits, so products.json stays the one source of truth.

const PRODUCTS_PATH = 'merch/products.json';
const SETTINGS_PATH = 'merch/settings.json';

function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
}

function encodeBase64Utf8(text) {
  let bin = '';
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function api(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'lvnary-store-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function readFile(env, path) {
  const res = await api(env, `${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (!res.ok) throw new Error(`GitHub read ${path} failed: ${res.status}`);
  const body = await res.json();
  return { text: decodeBase64Utf8(body.content), sha: body.sha };
}

// Per-isolate copy of the store files, so a burst of checkouts doesn't spend the token's
// GitHub API budget (5,000 requests an hour) re-reading the same two files.
let cached = null;

export async function loadStore(env, { maxAgeSeconds = 0 } = {}) {
  if (maxAgeSeconds > 0 && cached && cached.repo === env.GITHUB_REPO && Date.now() - cached.at < maxAgeSeconds * 1000) {
    return structuredClone(cached.store);
  }
  const [products, settings] = await Promise.all([readFile(env, PRODUCTS_PATH), readFile(env, SETTINGS_PATH)]);
  const store = { productsFile: JSON.parse(products.text), settings: JSON.parse(settings.text) };
  if (maxAgeSeconds > 0) cached = { repo: env.GITHUB_REPO, at: Date.now(), store: structuredClone(store) };
  return store;
}

// Changes one stock number in the file text, keeping the band's formatting and notes intact.
export function setStockInText(text, id, size, stock) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idMatch = new RegExp(`"id"\\s*:\\s*"${esc(id)}"`).exec(text);
  if (!idMatch) return null;
  const nextId = text.slice(idMatch.index + idMatch[0].length).search(/"id"\s*:/);
  const end = nextId === -1 ? text.length : idMatch.index + idMatch[0].length + nextId;
  const block = text.slice(idMatch.index, end);
  const sizeMatch = new RegExp(`"size"\\s*:\\s*"${esc(JSON.stringify(size).slice(1, -1))}"[^{}]*?"stock"\\s*:\\s*(\\d+)|"stock"\\s*:\\s*(\\d+)[^{}]*?"size"\\s*:\\s*"${esc(JSON.stringify(size).slice(1, -1))}"`).exec(block);
  if (!sizeMatch) return null;
  const whole = sizeMatch[0];
  const replaced = whole.replace(/("stock"\s*:\s*)\d+/, `$1${stock}`);
  return text.slice(0, idMatch.index) + block.slice(0, sizeMatch.index) + replaced + block.slice(sizeMatch.index + whole.length) + text.slice(end);
}

// items: [{ id, size, qty }]. Lowers stock, never below 0. Returns the items that didn't
// have enough stock (an oversell) so the order email can flag them.
export async function decrementStock(env, items, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text, sha } = await readFile(env, PRODUCTS_PATH);
    const data = JSON.parse(text);
    let next = text;
    const short = [];

    for (const item of items) {
      const product = data.products.find(p => p.id === item.id);
      const variant = product && product.variants.find(v => v.size === item.size);
      if (!variant) { short.push({ ...item, had: 0 }); continue; }
      if (variant.stock < item.qty) short.push({ ...item, had: variant.stock });
      variant.stock = Math.max(0, variant.stock - item.qty);
      next = next === null ? null : setStockInText(next, item.id, item.size, variant.stock);
    }

    // If the file was hand-formatted in a way the targeted edit can't follow, rewrite it whole.
    if (next === null || JSON.stringify(JSON.parse(next)) !== JSON.stringify(data)) {
      next = `${JSON.stringify(data, null, 2)}\n`;
    }

    const res = await api(env, PRODUCTS_PATH, {
      method: 'PUT',
      body: JSON.stringify({ message, content: encodeBase64Utf8(next), sha, branch: env.GITHUB_BRANCH }),
    });
    if (res.ok) return short;
    // 409/422: someone else changed the file between our read and write. Read again and retry.
    if (res.status !== 409 && res.status !== 422) throw new Error(`GitHub write failed: ${res.status}`);
  }
  throw new Error('GitHub write kept conflicting');
}
