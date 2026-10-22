// Mailing list tools. Signups live in the store worker's KV storage on Cloudflare.
//   npm run subscribers                          → writes subscribers.csv (not committed)
//   npm run subscribers -- --remove fan@x.com    → deletes one address (unsubscribe or deletion request)
// Needs `npx wrangler login` once on this computer.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const KV = ['--binding', 'STORE_KV', '--remote', '--config', 'worker/wrangler.toml'];
// Runs wrangler's script with node directly (no shell), so an address can't be read as a command.
const wrangler = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const removeAt = process.argv.indexOf('--remove');
if (removeAt !== -1) {
  const email = String(process.argv[removeAt + 1] || '').trim().toLowerCase();
  if (!email.includes('@')) {
    console.error('Give the address to remove, for example: npm run subscribers -- --remove fan@example.com');
    process.exit(1);
  }
  wrangler(['kv', 'key', 'delete', `sub:${email}`, ...KV]);
  console.log(`✔ Removed ${email}. Remove it from your email sending service too, if you've uploaded the list.`);
} else {
  const keys = JSON.parse(wrangler(['kv', 'key', 'list', '--prefix', 'sub:', ...KV]));
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = keys
    .map(k => k.metadata || { email: k.name.slice(4) })
    .sort((a, b) => String(a.signed_up).localeCompare(String(b.signed_up)))
    .map(m => [m.email, m.signed_up, m.consent].map(cell).join(','));
  writeFileSync('subscribers.csv', ['email,signed_up,consent', ...rows].join('\n') + '\n');
  console.log(`✔ ${rows.length} ${rows.length === 1 ? 'subscriber' : 'subscribers'} saved to subscribers.csv`);
}
