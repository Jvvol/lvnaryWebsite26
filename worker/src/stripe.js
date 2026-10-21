// Minimal Stripe client: form-encoded API calls and webhook signature checks, no SDK.

function encodeForm(value, prefix, out = []) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) value.forEach((v, i) => encodeForm(v, `${prefix}[${i}]`, out));
  else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
  } else out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return out;
}

export async function stripeRequest(env, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(params).join('&'),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${body.error && body.error.message}`);
  return body;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function signPayload(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns the parsed event if the Stripe-Signature header is valid and recent, otherwise null.
export async function verifyWebhook(env, payload, header, now = Date.now()) {
  if (!header) return null;
  const parts = header.split(',').map(p => p.split('='));
  const timestamp = (parts.find(([k]) => k === 't') || [])[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !signatures.length) return null;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return null;
  const expected = await signPayload(env.STRIPE_WEBHOOK_SECRET, timestamp, payload);
  if (!signatures.some(sig => safeEqual(sig, expected))) return null;
  return JSON.parse(payload);
}
